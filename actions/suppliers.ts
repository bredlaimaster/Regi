"use server";
import { z } from "zod";
import { AddressSchema, Schema } from "@/lib/schemas/suppliers";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

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
