"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

const ProductSchema = z.object({
  id: z.string().optional(),
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  unit: z.string().default("EA"),
  sellPriceNzd: z.coerce.number().nonnegative(),
  reorderPoint: z.coerce.number().int().nonnegative().default(0),
  imageUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  // Phase A
  brandId: z.string().optional().nullable(),
  costNzd: z.coerce.number().nonnegative().optional().nullable(),
  caseQty: z.coerce.number().int().positive().default(1),
  isTester: z.boolean().default(false),
  active: z.boolean().default(true),
  // Client data fields
  supplierCode: z.string().optional().nullable(),
  binLocation: z.string().optional().nullable(),
  unitBarcode: z.string().optional().nullable(),
  caseBarcode: z.string().optional().nullable(),
});

export async function upsertProduct(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const { id, ...data } = parsed.data;

  if (id) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Not found" };
    assertTenant(existing.tenantId, session.tenantId);
    await prisma.product.update({ where: { id }, data });
  } else {
    const dupe = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (dupe) return { ok: false, error: "SKU already exists" };
    await prisma.product.create({
      data: {
        ...data,
        tenantId: session.tenantId,
        stockLevel: { create: { qty: 0 } },
      },
    });
  }
  revalidatePath("/products");
  return { ok: true, data: null };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);
  await prisma.product.delete({ where: { id } });
  revalidatePath("/products");
  return { ok: true, data: null };
}

// ─── Price-group pricing ─────────────────────────────────────────────────────

const GroupPriceSchema = z.object({
  priceGroupId: z.string().min(1),
  unitPrice: z.coerce.number().nonnegative(),
  minQty: z.coerce.number().int().positive().default(1),
});

const SavePricesSchema = z.object({
  productId: z.string(),
  prices: z.array(GroupPriceSchema),
});

/**
 * Replace all price-group prices for a product (delete-and-recreate).
 * Dedups by (priceGroupId, minQty) to respect the unique constraint.
 */
export async function saveProductPrices(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const parsed = SavePricesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid pricing data" };
  const { productId, prices } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { ok: false, error: "Product not found" };
  assertTenant(product.tenantId, session.tenantId);

  // Confirm all referenced price groups belong to this tenant.
  const groupIds = Array.from(new Set(prices.map((p) => p.priceGroupId)));
  if (groupIds.length > 0) {
    const groups = await prisma.priceGroup.findMany({
      where: { id: { in: groupIds }, tenantId: session.tenantId },
      select: { id: true },
    });
    if (groups.length !== groupIds.length) {
      return { ok: false, error: "Unknown price group(s)" };
    }
  }

  const seen = new Set<string>();
  const rows = prices.filter((p) => {
    const k = `${p.priceGroupId}:${p.minQty}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  await prisma.$transaction(async (tx) => {
    await tx.productPrice.deleteMany({ where: { productId } });
    if (rows.length > 0) {
      await tx.productPrice.createMany({
        data: rows.map((p) => ({
          productId,
          priceGroupId: p.priceGroupId,
          unitPrice: p.unitPrice,
          minQty: p.minQty,
        })),
      });
    }
  });

  revalidatePath(`/products/${productId}`);
  return { ok: true, data: null };
}

// ─── Image upload ─────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Upload a product image to Supabase Storage and return the public URL. */
export async function uploadProductImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "No file" };
  if (file.size > MAX_IMAGE_SIZE) return { ok: false, error: "File too large (max 5 MB)" };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return { ok: false, error: "Only JPEG, PNG, WebP, and GIF images are allowed" };
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) return { ok: false, error: "Invalid file extension" };
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${session.tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from("product-images").upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };
  const { data } = supabaseAdmin.storage.from("product-images").getPublicUrl(path);
  return { ok: true, data: { url: data.publicUrl } };
}
