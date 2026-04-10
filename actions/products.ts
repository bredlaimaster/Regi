"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";
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
});

export async function upsertProduct(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
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
  const session = await requireSession();
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);
  await prisma.product.delete({ where: { id } });
  revalidatePath("/products");
  return { ok: true, data: null };
}

/** Upload a product image to Supabase Storage and return the public URL. */
export async function uploadProductImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const session = await requireSession();
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "No file" };
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from("product-images").upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };
  const { data } = supabaseAdmin.storage.from("product-images").getPublicUrl(path);
  return { ok: true, data: { url: data.publicUrl } };
}
