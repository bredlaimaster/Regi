"use server";
import { z } from "zod";
import { NameSchema } from "@/lib/schemas/dimensions";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

// ─── Brands ───────────────────────────────────────────────────────────────────

export async function upsertBrand(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const session = await requireRole(["ADMIN"]);
  const parsed = NameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };
  const { id, name } = parsed.data;
  if (id) {
    const existing = await prisma.brand.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Not found" };
    assertTenant(existing.tenantId, session.tenantId);
    const updated = await prisma.brand.update({ where: { id }, data: { name } });
    revalidatePath("/settings/dimensions");
    return { ok: true, data: updated };
  }
  const created = await prisma.brand.create({ data: { name, tenantId: session.tenantId } });
  revalidatePath("/settings/dimensions");
  return { ok: true, data: created };
}

export async function deleteBrand(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);
  await prisma.brand.delete({ where: { id } });
  revalidatePath("/settings/dimensions");
  return { ok: true, data: null };
}

// ─── Channels ─────────────────────────────────────────────────────────────────

export async function upsertChannel(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const session = await requireRole(["ADMIN"]);
  const parsed = NameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };
  const { id, name } = parsed.data;
  if (id) {
    const existing = await prisma.channel.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Not found" };
    assertTenant(existing.tenantId, session.tenantId);
    const updated = await prisma.channel.update({ where: { id }, data: { name } });
    revalidatePath("/settings/dimensions");
    return { ok: true, data: updated };
  }
  const created = await prisma.channel.create({ data: { name, tenantId: session.tenantId } });
  revalidatePath("/settings/dimensions");
  return { ok: true, data: created };
}

export async function deleteChannel(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const existing = await prisma.channel.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);
  await prisma.channel.delete({ where: { id } });
  revalidatePath("/settings/dimensions");
  return { ok: true, data: null };
}

// ─── Territories ──────────────────────────────────────────────────────────────

export async function upsertTerritory(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const session = await requireRole(["ADMIN"]);
  const parsed = NameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };
  const { id, name } = parsed.data;
  if (id) {
    const existing = await prisma.territory.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Not found" };
    assertTenant(existing.tenantId, session.tenantId);
    const updated = await prisma.territory.update({ where: { id }, data: { name } });
    revalidatePath("/settings/dimensions");
    return { ok: true, data: updated };
  }
  const created = await prisma.territory.create({ data: { name, tenantId: session.tenantId } });
  revalidatePath("/settings/dimensions");
  return { ok: true, data: created };
}

export async function deleteTerritory(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const existing = await prisma.territory.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);
  await prisma.territory.delete({ where: { id } });
  revalidatePath("/settings/dimensions");
  return { ok: true, data: null };
}
