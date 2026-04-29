/**
 * Pure Zod schemas for inventory — extracted from `actions/inventory.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const AdjustSchema = z.object({
  productId: z.string(),
  qtyChange: z.coerce.number().int(),
  notes: z.string().min(1, "Reason required"),
});
