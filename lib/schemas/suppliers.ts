/**
 * Pure Zod schemas for suppliers — extracted from `actions/suppliers.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const AddressSchema = z.object({
  name: z.string().optional().nullable(),
  line1: z.string().optional().nullable(),
  line2: z.string().optional().nullable(),
  suburb: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
}).nullable().optional();

export const Schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  currency: z.string().default("NZD"),
  acctCode: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  taxRule: z.enum(["GST15", "ZERO", "IMPORT_GST", "EXEMPT"]).default("GST15"),
  // Phase C — Unleashed-style
  gstVatNumber: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankBranch: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  minimumOrderValue: z.coerce.number().nonnegative().optional().nullable(),
  deliveryLeadDays: z.coerce.number().int().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  postalAddress: AddressSchema,
  physicalAddress: AddressSchema,
});
