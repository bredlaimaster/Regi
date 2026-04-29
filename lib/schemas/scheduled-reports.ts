/**
 * Pure Zod schemas for scheduled-reports — extracted from `actions/scheduled-reports.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const CreateSchema = z.object({
  reportKey: z.string().min(1),
  cronExpr: z.string().min(1).regex(/^[\d*\/,\- ]+$/, "Invalid cron expression"),
  recipients: z.array(z.string().email()).min(1).max(20),
});
