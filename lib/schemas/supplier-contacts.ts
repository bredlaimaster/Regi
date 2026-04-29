/**
 * Pure Zod schemas for supplier-contacts — extracted from `actions/supplier-contacts.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const ContactSchema = z.object({
  id: z.string().optional(),
  supplierId: z.string(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  website: z.string().optional().nullable(),
  tollFreeNo: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  fax: z.string().optional().nullable(),
  mobilePhone: z.string().optional().nullable(),
  officePhone: z.string().optional().nullable(),
  ddi: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
  isPurchasing: z.boolean().default(false),
});
