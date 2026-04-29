/**
 * Pure Zod schemas for mobile — extracted from `actions/mobile.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const BarcodeSchema = z.object({
  code: z.string().trim().min(1, "Empty barcode"),
});

export const IdSchema = z.object({ id: z.string().min(1) });
