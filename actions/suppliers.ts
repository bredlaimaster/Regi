"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const AddressSchema = z.object({
  name: z.string().optional().nullable(),
  line1: z.string().optional().nullable(),
  line2: z.string().optional().nullable(),
  suburb: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
}).nullable().optional();

const Schema = z.object({
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

export async function upsertSupplier(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole(["ADMIN"]);
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { id, postalAddress, physicalAddress, ...rest } = parsed.data;
  // Prisma Json fields need `JsonNull` to clear, not null.
  const data = {
    ...rest,
    postalAddress: postalAddress === null ? Prisma.JsonNull : (postalAddress as Prisma.InputJsonValue | undefined),
    physicalAddress: physicalAddress === null ? Prisma.JsonNull : (physicalAddress as Prisma.InputJsonValue | undefined),
  };
  let resultId: string;
  if (id) {
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Not found" };
    assertTenant(existing.tenantId, session.tenantId);
    await prisma.supplier.update({ where: { id }, data });
    resultId = id;
  } else {
    const created = await prisma.supplier.create({ data: { ...data, tenantId: session.tenantId } });
    resultId = created.id;
  }
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${resultId}`);
  return { ok: true, data: { id: resultId } };
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) return { ok: false, error: "Not found" };
  assertTenant(s.tenantId, session.tenantId);
  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/suppliers");
  return { ok: true, data: null };
}
