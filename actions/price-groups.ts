"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const GroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  isDefault: z.boolean().default(false),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
});

export async function upsertPriceGroup(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = GroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid price group" };
  const { id, ...data } = parsed.data;

  // Enforce single default group per tenant.
  if (data.isDefault) {
    await prisma.priceGroup.updateMany({
      where: { tenantId: session.tenantId, isDefault: true, NOT: id ? { id } : undefined },
      data: { isDefault: false },
    });
  }

  let resultId: string;
  if (id) {
    const existing = await prisma.priceGroup.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Price group not found" };
    assertTenant(existing.tenantId, session.tenantId);
    // Name uniqueness — Prisma will throw on the (tenantId, name) unique key;
    // do a friendlier pre-check so the error message is readable.
    if (existing.name !== data.name) {
      const clash = await prisma.priceGroup.findUnique({
        where: { tenantId_name: { tenantId: session.tenantId, name: data.name } },
      });
      if (clash) return { ok: false, error: "A price group with that name already exists" };
    }
    await prisma.priceGroup.update({ where: { id }, data });
    resultId = id;
  } else {
    const clash = await prisma.priceGroup.findUnique({
      where: { tenantId_name: { tenantId: session.tenantId, name: data.name } },
    });
    if (clash) return { ok: false, error: "A price group with that name already exists" };
    const created = await prisma.priceGroup.create({
      data: { ...data, tenantId: session.tenantId },
    });
    resultId = created.id;
  }

  revalidatePath("/settings/price-groups");
  return { ok: true, data: { id: resultId } };
}

export async function deletePriceGroup(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const existing = await prisma.priceGroup.findUnique({
    where: { id },
    include: { _count: { select: { customers: true, prices: true } } },
  });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);

  if (existing.isDefault) {
    return { ok: false, error: "Cannot delete the default price group" };
  }
  if (existing._count.customers > 0) {
    return {
      ok: false,
      error: `Cannot delete — ${existing._count.customers} customer(s) still use this group. Reassign them first.`,
    };
  }

  // Deleting the group also removes its ProductPrice rows via onDelete: Cascade.
  await prisma.priceGroup.delete({ where: { id } });
  revalidatePath("/settings/price-groups");
  return { ok: true, data: null };
}

export async function setDefaultPriceGroup(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const existing = await prisma.priceGroup.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);

  await prisma.$transaction([
    prisma.priceGroup.updateMany({
      where: { tenantId: session.tenantId, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.priceGroup.update({ where: { id }, data: { isDefault: true } }),
  ]);

  revalidatePath("/settings/price-groups");
  return { ok: true, data: null };
}
