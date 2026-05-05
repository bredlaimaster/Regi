import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { Role } from "@prisma/client";

export type SessionContext = {
  userId: string;
  email: string;
  tenantId: string;
  role: Role;
  name: string | null;
};

/**
 * Get the current session + tenant. Redirects to /login if unauthenticated.
 *
 * Dev bypass: if DEV_AUTH_BYPASS=true, loads the user named by DEV_USER_EMAIL.
 * Used for local development only; never enable in prod.
 */
export async function requireSession(): Promise<SessionContext> {
  let userId: string | null = null;

  if (process.env.DEV_AUTH_BYPASS === "true") {
    const email = process.env.DEV_USER_EMAIL ?? "owner@example.co.nz";
    const dev = await prisma.user.findUnique({ where: { email } });
    if (!dev) redirect("/login");
    return {
      userId: dev.id,
      email: dev.email,
      tenantId: dev.tenantId,
      role: dev.role,
      name: dev.name,
    };
  }

  const session = await getSession();
  userId = session.userId ?? null;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    // session references a deleted user — clear it
    session.destroy();
    redirect("/login");
  }

  return {
    userId: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
    name: user.name,
  };
}

/**
 * Require one of the allowed roles. On role mismatch, redirects to /403 (a
 * friendly forbidden page that lists what the user *can* access).
 *
 * Was previously a throw, which surfaced as the generic Next.js error boundary
 * ("Something went wrong / An error occurred in the Server Components render")
 * — looks like a crash to the user, even though the gate was working as
 * intended. `redirect()` from `next/navigation` works in both server
 * components and server actions, so all 30+ existing call sites are unchanged.
 */
export async function requireRole(allowed: Role[]): Promise<SessionContext> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) {
    redirect("/403");
  }
  return session;
}

/** Guarantees that a resource belongs to the active tenant. */
export function assertTenant(resourceTenantId: string, sessionTenantId: string) {
  if (resourceTenantId !== sessionTenantId) {
    throw new Error("Forbidden: cross-tenant access");
  }
}

/**
 * Verify email + password and (on success) write the session cookie.
 * Returns { ok: true } on success, or { ok: false, error } on failure.
 * Kept generic to avoid leaking whether the email exists.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !user.passwordHash) return { ok: false, error: "Invalid email or password" };
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { ok: false, error: "Invalid email or password" };

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  return { ok: true };
}

/** Clear the session cookie. */
export async function signOut(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

/** Hash a plaintext password for storage. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
