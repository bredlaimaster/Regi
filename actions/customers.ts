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

const ShipToSchema = z.object({
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

const Schema = z.object({
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

export async function upsertCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { id, postalAddress, physicalAddress, shipTos, ...rest } = parsed.data;
  // Validate priceGroupId belongs to this tenant before writing.
  if (rest.priceGroupId) {
    const pg = await prisma.priceGroup.findUnique({
      where: { id: rest.priceGroupId },
      select: { tenantId: true },
    });
    if (!pg || pg.tenantId !== session.tenantId) {
      return { ok: false, error: "Unknown price group" };
    }
  }
  const cleanData = {
    ...rest,
    channelId: rest.channelId || null,
    territoryId: rest.territoryId || null,
    salesRepId: rest.salesRepId || null,
    priceGroupId: rest.priceGroupId || null,
    postalAddress: postalAddress === null ? Prisma.JsonNull : (postalAddress as Prisma.InputJsonValue | undefined),
    physicalAddress: physicalAddress === null ? Prisma.JsonNull : (physicalAddress as Prisma.InputJsonValue | undefined),
    shipTos: shipTos === null ? Prisma.JsonNull : (shipTos as Prisma.InputJsonValue | undefined),
  };
  let resultId: string;
  if (id) {
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Not found" };
    assertTenant(existing.tenantId, session.tenantId);
    await prisma.customer.update({ where: { id }, data: cleanData });
    resultId = id;
  } else {
    const created = await prisma.customer.create({ data: { ...cleanData, tenantId: session.tenantId } });
    resultId = created.id;
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${resultId}`);
  return { ok: true, data: { id: resultId } };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) return { ok: false, error: "Not found" };
  assertTenant(c.tenantId, session.tenantId);
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
  return { ok: true, data: null };
}
