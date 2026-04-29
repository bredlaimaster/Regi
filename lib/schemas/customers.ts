/**
 * Pure Zod schemas for customers — extracted from `actions/customers.ts` so they
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

export const ShipToSchema = z.object({
  label: z.string().optional().nullable(),
  line1: z.string().optional().nullable(),
  line2: z.string().optional().nullable(),
  suburb: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
  obsolete: z.boolean().optional(),
});

export const Schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  // Phase A
  channelId: z.string().optional().nullable(),
  territoryId: z.string().optional().nullable(),
  salesRepId: z.string().optional().nullable(),
  // Phase B — financial / pricing
  creditLimit: z.number().positive().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  priceGroupId: z.string().optional().nullable(),
  // Phase D — Unleashed-style fields
  acctCode: z.string().optional().nullable(),
  currency: z.string().default("NZD"),
  taxNumber: z.string().optional().nullable(),
  taxRule: z.string().default("GST15"),
  notes: z.string().optional().nullable(),
  postalAddress: AddressSchema,
  physicalAddress: AddressSchema,
  shipTos: z.array(ShipToSchema).optional().nullable(),
});
