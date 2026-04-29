/**
 * Pure Zod schemas for dimensions — extracted from `actions/dimensions.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const NameSchema = z.object({ id: z.string().optional(), name: z.string().min(1).max(100) });
