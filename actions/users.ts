"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const Schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "SALES", "WAREHOUSE"]),
});

export async function inviteUser(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, error: "User already exists" };
  await prisma.user.create({ data: { ...parsed.data, tenantId: session.tenantId } });
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}

export async function updateUserRole(id: string, role: "ADMIN" | "SALES" | "WAREHOUSE"): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.tenantId !== session.tenantId) return { ok: false, error: "Forbidden" };
  await prisma.user.update({ where: { id }, data: { role } });
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}
