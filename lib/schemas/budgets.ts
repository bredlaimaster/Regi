/**
 * Pure Zod schemas for budgets — extracted from `actions/budgets.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const UploadSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2099),
  tsv: z.string().min(1),
});
