"use server";
import { z } from "zod";
import { ContactSchema } from "@/lib/schemas/customer-contacts";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

export async function upsertCustomerContact(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole(["ADMIN", "SALES"]);
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
  const session = await requireRole(["ADMIN", "SALES"]);
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
