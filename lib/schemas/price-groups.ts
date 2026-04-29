/**
 * Pure Zod schemas for price-groups — extracted from `actions/price-groups.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const GroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  isDefault: z.boolean().default(false),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
});
