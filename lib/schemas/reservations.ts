/**
 * Pure Zod schemas for reservations — extracted from `actions/reservations.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const CreateReservationSchema = z.object({
  productId: z.string(),
  customerId: z.string().optional().nullable(),
  repId: z.string().optional().nullable(),
  qtyReserved: z.coerce.number().int().positive(),
  expiresAt: z.string().optional().nullable(), // ISO date string
  notes: z.string().optional().nullable(),
});
