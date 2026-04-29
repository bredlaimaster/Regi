import type { Metadata, Viewport } from "next";
import { requireRole } from "@/lib/auth";

/**
 * Mobile layout. Outside the `(app)` group so we don't inherit the desktop
 * sidebar/topbar. Mobile flows (pick / receive / stocktake) are warehouse
 * tools — gated to ADMIN + WAREHOUSE.
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
  await requireRole(["ADMIN", "WAREHOUSE"]);
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
