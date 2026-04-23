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

// Only mark the cookie Secure when the app is actually served over HTTPS.
// The ALB here is HTTP, so Secure=true would cause browsers to silently drop
// the Set-Cookie and the user would bounce back to /login on every sign-in.
const SECURE_COOKIE = (process.env.APP_URL ?? "").startsWith("https://");

export const sessionOptions: SessionOptions = {
  password: getSecret(),
  cookieName: "nz_inv_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<AppSession>(cookieStore, sessionOptions);
}
