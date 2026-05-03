"use server";
import {
  ProductSchema,
  SavePricesSchema,
  ProductImageIdSchema,
  SetPrimaryImageSchema,
} from "@/lib/schemas/products";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

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

// ─── Product images ───────────────────────────────────────────────────────────
//
// Images are stored in the `ProductImage` Postgres table (bytes column +
// content-type) rather than in an external object store. This makes the
// system self-contained — no Supabase / S3 setup, no extra credentials,
// works identically in dev and prod.
//
// The previous Supabase Storage path was broken in production (sst.config.ts
// shipped stub URLs, see commit history) and only saved the URL into local
// component state, never to the DB. This rewrite fixes both: each upload
// hits the DB immediately, and the URL pattern is `/api/product-images/[id]`
// served by the route at the same path.

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Append an image to a product. The product must already exist (i.e. for new
 * products, save the form first).
 */
export async function addProductImage(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const productId = formData.get("productId");
  const file = formData.get("file");

  if (typeof productId !== "string" || !productId) {
    return { ok: false, error: "Save the product first, then upload images." };
  }
  if (!(file instanceof File)) return { ok: false, error: "No file" };
  if (file.size > MAX_IMAGE_SIZE) return { ok: false, error: "File too large (max 5 MB)" };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: "Only JPEG, PNG, WebP, or GIF images are allowed." };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { tenantId: true },
  });
  if (!product) return { ok: false, error: "Product not found" };
  assertTenant(product.tenantId, session.tenantId);

  const bytes = Buffer.from(await file.arrayBuffer());

  // Append at the end of the existing order. First-uploaded image becomes
  // the primary by default.
  const last = await prisma.productImage.findFirst({
    where: { productId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;

  const created = await prisma.productImage.create({
    data: {
      productId,
      bytes,
      contentType: file.type,
      filename: file.name || null,
      size: file.size,
      order: nextOrder,
    },
    select: { id: true },
  });

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true, data: { id: created.id } };
}

/** Delete an image. The remaining images keep their relative order. */
export async function deleteProductImage(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const parsed = ProductImageIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const img = await prisma.productImage.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      productId: true,
      product: { select: { tenantId: true } },
    },
  });
  if (!img) return { ok: false, error: "Not found" };
  assertTenant(img.product.tenantId, session.tenantId);

  await prisma.productImage.delete({ where: { id: img.id } });
  revalidatePath(`/products/${img.productId}`);
  revalidatePath("/products");
  return { ok: true, data: null };
}

/**
 * Move an image to position 0 (primary) and renumber the rest 1..N preserving
 * their previous relative order.
 */
export async function setPrimaryProductImage(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const parsed = SetPrimaryImageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { productId, imageId } = parsed.data;

  const img = await prisma.productImage.findUnique({
    where: { id: imageId },
    select: { productId: true, product: { select: { tenantId: true } } },
  });
  if (!img) return { ok: false, error: "Not found" };
  if (img.productId !== productId) return { ok: false, error: "Image does not belong to this product" };
  assertTenant(img.product.tenantId, session.tenantId);

  await prisma.$transaction(async (tx) => {
    const all = await tx.productImage.findMany({
      where: { productId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    let i = 1;
    for (const row of all) {
      const newOrder = row.id === imageId ? 0 : i++;
      await tx.productImage.update({ where: { id: row.id }, data: { order: newOrder } });
    }
  });

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true, data: null };
}
