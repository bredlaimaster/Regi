/**
 * Pure Zod schemas for purchase-orders — extracted from `actions/purchase-orders.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

export const LineSchema = z.object({
  productId: z.string(),
  qtyOrdered: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().nonnegative(),
});

export const PoSchema = z.object({
  id: z.string().optional(),
  supplierId: z.string(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  expectedDate: z.string().optional().nullable(),
  freight: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(LineSchema).min(1),
});

export const PartialReceiveLineSchema = z.object({
  lineId: z.string(),
  productId: z.string(),
  qtyReceiving: z.coerce.number().int().positive(),
  batchCode: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(), // ISO date string or null
});

export const ReceiveChargeSchema = z.object({
  label: z.string().min(1),
  amount: z.coerce.number().nonnegative(),
  currency: z.string().default("NZD"),
  taxRate: z.coerce.number().nonnegative().default(0), // 0 or 15
  invoiceRef: z.string().nullable().optional(),
});

export const PartialReceiveSchema = z.object({
  poId: z.string(),
  lines: z.array(PartialReceiveLineSchema).min(1),
  freightOverride: z.coerce.number().nonnegative().nullable().optional(),
  charges: z.array(ReceiveChargeSchema).optional(),
});
