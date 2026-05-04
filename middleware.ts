import { NextResponse, type NextRequest } from "next/server";
import { sessionOptions } from "@/lib/session";

const PUBLIC_PATHS = [
  "/login",
  "/api/qbo/callback",
  "/api/cron",
  "/api/health",
  // Bug-report intake for external testers (Playwright MCP etc.). The route
  // gates on Authorization: Bearer <BUG_REPORT_API_TOKEN> internally.
  "/api/bug-reports",
  // Static documentation (testing guides, tester walkthroughs). These are
  // public pages, not gated by login — the URL is shareable.
  "/docs",
  // PWA shell assets need to load before sign-in (so the install prompt works).
  "/manifest.webmanifest",
  "/icons",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Dev bypass: skip auth when running locally.
  if (process.env.DEV_AUTH_BYPASS === "true") return NextResponse.next();

  // Cheap cookie-presence check. The seal is verified in lib/auth.ts (requireSession)
  // on every server render; forging a cookie here only gets you past the redirect
  // and straight into a 500 on the next page.
  const cookie = request.cookies.get(sessionOptions.cookieName);
  if (!cookie?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp)).*)"],
};
