import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

type ReportNavItem = { label: string; href: string; roles: Role[] };

const REPORT_NAV: ReportNavItem[] = [
  // Sales-side reports — ADMIN + SALES
  { label: "Overview", href: "/reports", roles: ["ADMIN", "SALES"] },
  { label: "Monthly Sales Analysis", href: "/reports/monthly-sales", roles: ["ADMIN", "SALES"] },
  { label: "Actual vs Budget", href: "/reports/actual-vs-budget", roles: ["ADMIN", "SALES"] },
  { label: "Customer Sales", href: "/reports/customer-sales", roles: ["ADMIN", "SALES"] },
  { label: "Rep Performance", href: "/reports/rep-performance", roles: ["ADMIN", "SALES"] },
  { label: "Brand Breakdown", href: "/reports/brand-breakdown", roles: ["ADMIN", "SALES"] },
  { label: "Channel Trends", href: "/reports/channel-trends", roles: ["ADMIN", "SALES"] },
  { label: "Customer Trends", href: "/reports/customer-trends", roles: ["ADMIN", "SALES"] },
  { label: "Tester Tracker", href: "/reports/tester-tracker", roles: ["ADMIN", "SALES"] },
  // Stock-side reports — ADMIN only
  { label: "Stock on Hand", href: "/reports/stock-on-hand", roles: ["ADMIN"] },
  { label: "Stock Turn", href: "/reports/stock-turn", roles: ["ADMIN"] },
  { label: "Overstock & Slow Movers", href: "/reports/overstock", roles: ["ADMIN"] },
  { label: "Expiry Tracker", href: "/reports/expiry-tracker", roles: ["ADMIN"] },
  { label: "Re-order Planner", href: "/reports/reorder-planner", roles: ["ADMIN"] },
  { label: "Container Planning", href: "/reports/container-planning", roles: ["ADMIN"] },
  { label: "Supplier ETA", href: "/reports/supplier-eta", roles: ["ADMIN"] },
];

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["ADMIN", "SALES"]);
  const items = REPORT_NAV.filter((n) => n.roles.includes(session.role));

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-52 shrink-0">
        <div className="sticky top-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2">
            Reports
          </p>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
