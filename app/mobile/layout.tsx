import type { Metadata, Viewport } from "next";
import { requireSession } from "@/lib/auth";

/**
 * Mobile layout. Outside the `(app)` group so we don't inherit the desktop
 * sidebar/topbar. Auth is still enforced via `requireSession()`.
 */
export const metadata: Metadata = {
  title: "NZ Inventory — Mobile",
  applicationName: "NZ Inventory",
  appleWebApp: { capable: true, title: "NZ Inventory", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1220",
};

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  await requireSession(); // redirects to /login if no session cookie
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
