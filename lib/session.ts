import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type AppSession = {
  userId?: string;
};

const DEV_FALLBACK = "dev-only-session-secret-never-use-in-production-32bytes";

function getSecret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length >= 32) return s;
  // At runtime in prod, refuse to proceed with a weak secret.
  // (Build-time static analysis / page-data collection won't hit this because
  // it never actually reads/writes the session.)
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return DEV_FALLBACK;
}

export const sessionOptions: SessionOptions = {
  password: getSecret(),
  cookieName: "nz_inv_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<AppSession>(cookieStore, sessionOptions);
}
