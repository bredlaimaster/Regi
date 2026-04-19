"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const ContactSchema = z.object({
  id: z.string().optional(),
  customerId: z.string(),
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

export async function upsertCustomerContact(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid contact data" };
  const { id, customerId, ...data } = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Customer not found" };
  assertTenant(customer.tenantId, session.tenantId);

  const clean = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
  ) as typeof data;

  let contactId: string;
  if (id) {
    const existing = await prisma.customerContact.findUnique({ where: { id } });
    if (!existing || existing.customerId !== customerId) return { ok: false, error: "Contact not found" };
    const updated = await prisma.customerContact.update({ where: { id }, data: clean });
    contactId = updated.id;
  } else {
    const created = await prisma.customerContact.create({ data: { customerId, ...clean } });
    contactId = created.id;
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: true, data: { id: contactId } };
}

export async function deleteCustomerContact(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const contact = await prisma.customerContact.findUnique({
    where: { id },
    include: { customer: true },
  });
  if (!contact) return { ok: false, error: "Contact not found" };
  assertTenant(contact.customer.tenantId, session.tenantId);
  await prisma.customerContact.delete({ where: { id } });
  revalidatePath(`/customers/${contact.customerId}`);
  return { ok: true, data: null };
}
