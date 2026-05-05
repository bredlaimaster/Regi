import Link from "next/link";
import { ShieldX, Home, ArrowRight } from "lucide-react";
import type { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";

// Mirror of the role gating in components/sidebar.tsx — kept inline (not
// imported) so the rules can drift independently if the sidebar ever does
// progressive disclosure. Keep these in sync.
const ROLE_LINKS: Record<Role, { href: string; label: string }[]> = {
  ADMIN: [
    { href: "/", label: "Dashboard" },
    { href: "/products", label: "Products" },
    { href: "/inventory", label: "Inventory" },
    { href: "/purchase-orders", label: "Purchase orders" },
    { href: "/sales-orders", label: "Sales orders" },
    { href: "/proforma", label: "Proforma invoices" },
    { href: "/reservations", label: "Reservations" },
    { href: "/suppliers", label: "Suppliers" },
    { href: "/customers", label: "Customers" },
    { href: "/reports", label: "Reports" },
    { href: "/settings", label: "Settings" },
  ],
  SALES: [
    { href: "/", label: "Dashboard" },
    { href: "/products", label: "Products" },
    { href: "/inventory", label: "Inventory" },
    { href: "/sales-orders", label: "Sales orders" },
    { href: "/proforma", label: "Proforma invoices" },
    { href: "/reservations", label: "Reservations" },
    { href: "/customers", label: "Customers" },
    { href: "/reports", label: "Reports" },
  ],
  WAREHOUSE: [
    { href: "/", label: "Dashboard" },
    { href: "/inventory", label: "Inventory" },
    { href: "/purchase-orders", label: "Purchase orders" },
    { href: "/mobile", label: "Mobile / barcode scanner" },
  ],
};

export default async function ForbiddenPage() {
  // No requireRole here — any signed-in user can land on this page. Unauthed
  // users are bounced to /login by middleware before they ever get here.
  const session = await requireSession();
  const links = ROLE_LINKS[session.role] ?? [];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-rose-50 via-background to-amber-50 dark:from-rose-950/20 dark:via-background dark:to-amber-950/20">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-3 ring-4 ring-rose-50 dark:ring-rose-950/40">
            <ShieldX className="h-7 w-7 text-rose-600 dark:text-rose-400" />
          </div>
          <CardTitle className="text-2xl">Access denied</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Sorry — your role{" "}
            <span className="font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
              {session.role}
            </span>{" "}
            doesn't include this page. Talk to an admin if you think you should
            have access.
          </p>

          {links.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                Pages you can use
              </p>
              <div className="grid gap-1.5">
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="flex items-center justify-between px-3 py-2 rounded-md border bg-background hover:bg-muted hover:border-foreground/20 transition-colors text-sm group"
                  >
                    <span>{l.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-3 border-t">
            <Button asChild className="flex-1">
              <Link href="/">
                <Home className="h-4 w-4 mr-1.5" />
                Back to dashboard
              </Link>
            </Button>
            <LogoutButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
