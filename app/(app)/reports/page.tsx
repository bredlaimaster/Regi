import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNzd } from "@/lib/utils";
import { currentFiscalYear, toFiscalPeriod, getActualsByPeriod } from "@/lib/reports/margin";
import { ReportsOverviewChart } from "./overview-chart";
import type { Role } from "@prisma/client";

type ReportCard = { title: string; desc: string; href: string; roles: Role[] };

const REPORT_CARDS: ReportCard[] = [
  // Sales-side — ADMIN + SALES
  { title: "Monthly Sales Analysis", desc: "Report 15 · Flagship KPI", href: "/reports/monthly-sales", roles: ["ADMIN", "SALES"] },
  { title: "Actual vs Budget", desc: "Reports 3 & 6", href: "/reports/actual-vs-budget", roles: ["ADMIN", "SALES"] },
  { title: "Rep Performance", desc: "Report 16", href: "/reports/rep-performance", roles: ["ADMIN", "SALES"] },
  { title: "Customer Sales", desc: "Report 2", href: "/reports/customer-sales", roles: ["ADMIN", "SALES"] },
  { title: "Brand Breakdown", desc: "Reports 1, 7, 8, 9", href: "/reports/brand-breakdown", roles: ["ADMIN", "SALES"] },
  { title: "Tester Tracker", desc: "Report 4", href: "/reports/tester-tracker", roles: ["ADMIN", "SALES"] },
  // Stock-side — ADMIN only
  { title: "Stock on Hand", desc: "Report 11", href: "/reports/stock-on-hand", roles: ["ADMIN"] },
  { title: "Stock Turn", desc: "Report 5", href: "/reports/stock-turn", roles: ["ADMIN"] },
  { title: "Expiry Tracker", desc: "Report 17 · RAG alerts", href: "/reports/expiry-tracker", roles: ["ADMIN"] },
  { title: "Overstock", desc: "Report 13", href: "/reports/overstock", roles: ["ADMIN"] },
  { title: "Container Planning", desc: "Report 19", href: "/reports/container-planning", roles: ["ADMIN"] },
  { title: "Supplier ETA", desc: "Report 20", href: "/reports/supplier-eta", roles: ["ADMIN"] },
];

export default async function ReportsOverviewPage() {
  const session = await requireRole(["ADMIN", "SALES"]);
  const fy = currentFiscalYear();
  const { period } = toFiscalPeriod(new Date());

  const [actuals, soCount, poCount] = await Promise.all([
    getActualsByPeriod({ tenantId: session.tenantId }, fy),
    prisma.salesOrder.count({ where: { tenantId: session.tenantId, status: "SHIPPED" } }),
    prisma.purchaseOrder.count({ where: { tenantId: session.tenantId, status: { in: ["ORDERED", "RECEIVED"] } } }),
  ]);

  const ytd = actuals.slice(0, period);
  const ytdSales = ytd.reduce((s, r) => s + r.salesNzd, 0);
  const ytdMargin = ytd.reduce((s, r) => s + r.grossMarginNzd, 0);
  const ytdMarginPct = ytdSales > 0 ? (ytdMargin / ytdSales) * 100 : 0;

  const chartData = actuals.map((r) => ({
    name: r.label,
    Sales: Math.round(r.salesNzd),
    Margin: Math.round(r.grossMarginNzd),
  }));

  const kpis = [
    { label: "YTD Sales", value: formatNzd(ytdSales) },
    { label: "YTD Gross Margin", value: formatNzd(ytdMargin) },
    { label: "YTD Margin %", value: `${ytdMarginPct.toFixed(1)}%` },
    { label: "Shipped Orders", value: soCount.toLocaleString() },
    { label: "Active POs", value: poCount.toLocaleString() },
  ];

  const cards = REPORT_CARDS.filter((c) => c.roles.includes(session.role));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">FY{fy} · Apr {fy} – Mar {fy + 1}</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardDescription className="text-xs">{k.label}</CardDescription>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <p className="text-xl font-bold tabular-nums">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar chart — client component to use recharts */}
      <ReportsOverviewChart data={chartData} fy={fy} />

      {/* Quick-launch grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">{item.title}</CardTitle>
                <CardDescription className="text-xs">{item.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
