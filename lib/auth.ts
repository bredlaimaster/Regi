import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export type SessionContext = {
  userId: string;
  email: string;
  tenantId: string;
  role: Role;
  name: string | null;
};

/** Get the current session + tenant. Redirects to /login if unauthenticated. */
export async function requireSession(): Promise<SessionContext> {
  let email: string | undefined;

  if (process.env.DEV_AUTH_BYPASS === "true") {
    email = process.env.DEV_USER_EMAIL ?? "owner@example.co.nz";
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) redirect("/login");
    email = user.email;
  }

  const dbUser = await prisma.user.findUnique({ where: { email: email! } });
  if (!dbUser) redirect("/onboarding");

  return {
    userId: dbUser.id,
    email: dbUser.email,
    tenantId: dbUser.tenantId,
    role: dbUser.role,
    name: dbUser.name,
  };
}

/** Require one of the allowed roles. Throws if not authorized. */
export async function requireRole(allowed: Role[]): Promise<SessionContext> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) {
    throw new Error("Forbidden: insufficient role");
  }
  return session;
}

/** Guarantees that a resource belongs to the active tenant. */
export function assertTenant(resourceTenantId: string, sessionTenantId: string) {
  if (resourceTenantId !== sessionTenantId) {
    throw new Error("Forbidden: cross-tenant access");
  }
}
