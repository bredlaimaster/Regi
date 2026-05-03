/**
 * Pure Zod schemas for products — extracted from `actions/products.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const ProductSchema = z.object({
  id: z.string().optional(),
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  unit: z.string().default("EA"),
  sellPriceNzd: z.coerce.number().nonnegative(),
  reorderPoint: z.coerce.number().int().nonnegative().default(0),
  // imageUrl deprecated — product images now live in the ProductImage table
  // and are served from /api/product-images/[id]. The column stays for now to
  // avoid a destructive migration, but the form no longer reads or writes it.
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

export const GroupPriceSchema = z.object({
  priceGroupId: z.string().min(1),
  unitPrice: z.coerce.number().nonnegative(),
  minQty: z.coerce.number().int().positive().default(1),
});

export const SavePricesSchema = z.object({
  productId: z.string(),
  prices: z.array(GroupPriceSchema),
});

// ─── Product images ───────────────────────────────────────────────────────────

export const ProductImageIdSchema = z.object({
  id: z.string().min(1),
});

export const SetPrimaryImageSchema = z.object({
  productId: z.string().min(1),
  imageId: z.string().min(1),
});
