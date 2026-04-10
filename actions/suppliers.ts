"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const Schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  currency: z.string().default("NZD"),
});

export async function upsertSupplier(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { id, ...data } = parsed.data;
  if (id) {
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Not found" };
    assertTenant(existing.tenantId, session.tenantId);
    await prisma.supplier.update({ where: { id }, data });
  } else {
    await prisma.supplier.create({ data: { ...data, tenantId: session.tenantId } });
  }
  revalidatePath("/suppliers");
  return { ok: true, data: null };
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) return { ok: false, error: "Not found" };
  assertTenant(s.tenantId, session.tenantId);
  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/suppliers");
  return { ok: true, data: null };
}
