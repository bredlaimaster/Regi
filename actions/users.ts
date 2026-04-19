"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  requireRole,
  signInWithPassword as signInHelper,
  signOut as signOutHelper,
  hashPassword,
} from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const CreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional().nullable(),
  role: z.enum(["ADMIN", "SALES", "WAREHOUSE"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const SetPasswordSchema = z.object({
  id: z.string(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Create a user with an immediate password — they can log in right away.
 * ADMIN only.
 */
export async function createUser(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "A user with that email already exists" };

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.create({
    data: {
      email,
      name: parsed.data.name ?? null,
      role: parsed.data.role,
      passwordHash,
      tenantId: session.tenantId,
    },
  });
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}

/** Admin: set or reset a user's password. */
export async function setUserPassword(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const parsed = SetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const user = await prisma.user.findUnique({ where: { id: parsed.data.id } });
  if (!user || user.tenantId !== session.tenantId) return { ok: false, error: "Not found" };
  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({ where: { id: parsed.data.id }, data: { passwordHash } });
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}

export async function updateUserRole(
  id: string,
  role: "ADMIN" | "SALES" | "WAREHOUSE",
): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.tenantId !== session.tenantId) return { ok: false, error: "Forbidden" };
  await prisma.user.update({ where: { id }, data: { role } });
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.tenantId !== session.tenantId) return { ok: false, error: "Forbidden" };
  if (user.id === session.userId) return { ok: false, error: "Cannot delete yourself" };
  await prisma.user.delete({ where: { id } });
  revalidatePath("/settings/users");
  return { ok: true, data: null };
}

// ─── Login / Logout ──────────────────────────────────────────────────────────

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signInAction(input: unknown): Promise<ActionResult> {
  const parsed = SignInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid email or password" };
  const res = await signInHelper(parsed.data.email, parsed.data.password);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: null };
}

export async function signOutAction(): Promise<void> {
  await signOutHelper();
  redirect("/login");
}
