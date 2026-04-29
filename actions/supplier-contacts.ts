"use server";
import { z } from "zod";
import { ContactSchema } from "@/lib/schemas/supplier-contacts";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

export async function upsertSupplierContact(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole(["ADMIN"]);
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid contact data" };
  const { id, supplierId, ...data } = parsed.data;

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return { ok: false, error: "Supplier not found" };
  assertTenant(supplier.tenantId, session.tenantId);

  // Normalize empty strings to null
  const clean = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
  ) as typeof data;

  let contactId: string;
  if (id) {
    const existing = await prisma.supplierContact.findUnique({ where: { id } });
    if (!existing || existing.supplierId !== supplierId) return { ok: false, error: "Contact not found" };
    const updated = await prisma.supplierContact.update({ where: { id }, data: clean });
    contactId = updated.id;
  } else {
    const created = await prisma.supplierContact.create({ data: { supplierId, ...clean } });
    contactId = created.id;
  }

  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true, data: { id: contactId } };
}

export async function deleteSupplierContact(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const contact = await prisma.supplierContact.findUnique({
    where: { id },
    include: { supplier: true },
  });
  if (!contact) return { ok: false, error: "Contact not found" };
  assertTenant(contact.supplier.tenantId, session.tenantId);
  await prisma.supplierContact.delete({ where: { id } });
  revalidatePath(`/suppliers/${contact.supplierId}`);
  return { ok: true, data: null };
}
