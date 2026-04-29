/**
 * Pure Zod schemas for sales-orders — extracted from `actions/sales-orders.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const LineSchema = z.object({
  productId: z.string(),
  qtyOrdered: z.coerce.number().int().positive(),
});

export const SoSchema = z.object({
  id: z.string().optional(),
  customerId: z.string(),
  notes: z.string().optional().nullable(),
  lines: z.array(LineSchema).min(1),
});

export const ShipSchema = z.object({ id: z.string(), trackingRef: z.string().min(1) });

export const PartialPickSchema = z.object({
  soId: z.string(),
  lines: z.array(z.object({
    lineId: z.string(),
    qtyPicking: z.coerce.number().int().min(1),
  })).min(1),
});
