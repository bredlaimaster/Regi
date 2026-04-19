import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const REPORT_NAV = [
  { label: "Overview", href: "/reports" },
  { label: "Monthly Sales Analysis", href: "/reports/monthly-sales" },
  { label: "Actual vs Budget", href: "/reports/actual-vs-budget" },
  { label: "Customer Sales", href: "/reports/customer-sales" },
  { label: "Rep Performance", href: "/reports/rep-performance" },
  { label: "Brand Breakdown", href: "/reports/brand-breakdown" },
  { label: "Channel Trends", href: "/reports/channel-trends" },
  { label: "Customer Trends", href: "/reports/customer-trends" },
  { label: "Stock on Hand", href: "/reports/stock-on-hand" },
  { label: "Tester Tracker", href: "/reports/tester-tracker" },
  { label: "Stock Turn", href: "/reports/stock-turn" },
  { label: "Overstock & Slow Movers", href: "/reports/overstock" },
  { label: "Expiry Tracker", href: "/reports/expiry-tracker" },
  { label: "Re-order Planner", href: "/reports/reorder-planner" },
  { label: "Container Planning", href: "/reports/container-planning" },
  { label: "Supplier ETA", href: "/reports/supplier-eta" },
];

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requireSession();

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-52 shrink-0">
        <div className="sticky top-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2">
            Reports
          </p>
          {REPORT_NAV.map((item) => (
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
