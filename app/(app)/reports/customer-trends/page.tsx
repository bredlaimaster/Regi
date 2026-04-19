import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAllCustomerRollingTrends, getCustomerRollingTrend, rollingMonths } from "@/lib/reports/trends";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";
import { CustomerTrendChart } from "./chart";
import Link from "next/link";

export default async function CustomerTrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; months?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const nMonths = Math.min(36, Math.max(6, parseInt(sp.months ?? "19")));
  const months = rollingMonths(nMonths);

  if (sp.customerId) {
    // Single customer drill-down
    const { rows, customerName } = await getCustomerRollingTrend(
      session.tenantId,
      sp.customerId,
      nMonths
    );

    const totalSales = rows.reduce((s, r) => s + r.salesNzd, 0);
    const totalUnits = rows.reduce((s, r) => s + r.units, 0);
    const totalMargin = rows.reduce((s, r) => s + r.grossMarginNzd, 0);

    const chartData = rows.map((r) => ({
      name: r.month,
      Sales: Math.round(r.salesNzd),
      Units: r.units,
      Margin: Math.round(r.grossMarginNzd),
    }));

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/reports/customer-trends" className="text-xs text-primary hover:underline">← All customers</Link>
            <h1 className="text-2xl font-semibold mt-1">{customerName}</h1>
            <p className="text-sm text-muted-foreground">Report 14 · {nMonths}-month rolling trend</p>
          </div>
          <div className="flex gap-2 text-sm">
            {[12, 19, 24].map((n) => (
              <a key={n} href={`?customerId=${sp.customerId}&months=${n}`}
                className={`px-3 py-1 rounded-full border ${n === nMonths ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                {n}mo
              </a>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: `${nMonths}-Mo Sales`, value: formatNzd(totalSales) },
            { label: "Units Shipped", value: totalUnits.toLocaleString() },
            { label: "Gross Margin", value: formatNzd(totalMargin) },
          ].map((k) => (
            <Card key={k.label}>
              <CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground">{k.label}</p></CardHeader>
              <CardContent className="pb-4 px-4"><p className="text-xl font-bold">{k.value}</p></CardContent>
            </Card>
          ))}
        </div>

        <CustomerTrendChart data={chartData} />

        <Card>
          <CardHeader><CardTitle className="text-base">Month-by-Month</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Gross Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.month} className={r.salesNzd === 0 ? "opacity-40" : ""}>
                    <TableCell>{r.month}</TableCell>
                    <TableCell className="text-right">{r.salesNzd > 0 ? formatNzd(r.salesNzd) : "—"}</TableCell>
                    <TableCell className="text-right">{r.units > 0 ? r.units : "—"}</TableCell>
                    <TableCell className="text-right">{r.orderCount > 0 ? r.orderCount : "—"}</TableCell>
                    <TableCell className="text-right">{r.grossMarginNzd > 0 ? formatNzd(r.grossMarginNzd) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Customer list view
  const allTrends = await getAllCustomerRollingTrends(session.tenantId, nMonths);
  const totalSales = allTrends.reduce((s, c) => s + c.totalSalesNzd, 0);

  // Heatmap data: months × customers (top 10)
  const top10 = allTrends.slice(0, 10);
  const maxMonthSales = Math.max(...top10.flatMap((c) => c.months.map((m) => m.salesNzd)));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customer Rolling Trends</h1>
          <p className="text-sm text-muted-foreground">Report 14 · {nMonths}-month rolling · {allTrends.length} active customers</p>
        </div>
        <div className="flex gap-2 text-sm">
          {[12, 19, 24].map((n) => (
            <a key={n} href={`?months=${n}`}
              className={`px-3 py-1 rounded-full border ${n === nMonths ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              {n}mo
            </a>
          ))}
        </div>
      </div>

      {/* Summary list */}
      <Card>
        <CardHeader><CardTitle className="text-base">All Customers — {nMonths}-Month Rolling</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total Sales</TableHead>
                <TableHead className="text-right">Share %</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Avg/Month</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTrends.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No shipped orders in the last {nMonths} months
                  </TableCell>
                </TableRow>
              )}
              {allTrends.map((c) => (
                <TableRow key={c.customerId}>
                  <TableCell className="font-medium">{c.customerName}</TableCell>
                  <TableCell className="text-right">{formatNzd(c.totalSalesNzd)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {totalSales > 0 ? ((c.totalSalesNzd / totalSales) * 100).toFixed(1) : "0.0"}%
                  </TableCell>
                  <TableCell className="text-right">{c.totalUnits.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatNzd(c.totalSalesNzd / nMonths)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`?customerId=${c.customerId}&months=${nMonths}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Drill down →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sparkline heatmap for top 10 */}
      {top10.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales Heatmap — Top 10 Customers</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium w-40">Customer</th>
                  {months.map((m) => (
                    <th key={m.label} className="text-center p-1 font-normal text-muted-foreground whitespace-nowrap">
                      {m.label.split(" ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top10.map((c) => (
                  <tr key={c.customerId} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2 font-medium truncate max-w-[10rem]">
                      <Link href={`?customerId=${c.customerId}&months=${nMonths}`} className="hover:underline">
                        {c.customerName}
                      </Link>
                    </td>
                    {c.months.map((m) => {
                      const intensity = maxMonthSales > 0 ? m.salesNzd / maxMonthSales : 0;
                      const opacity = intensity > 0 ? 0.15 + intensity * 0.75 : 0;
                      return (
                        <td
                          key={m.label}
                          className="p-1 text-center"
                          title={m.salesNzd > 0 ? `${m.label}: ${formatNzd(m.salesNzd)}` : `${m.label}: no sales`}
                          style={{
                            backgroundColor: opacity > 0 ? `hsl(210 80% 56% / ${opacity})` : "transparent",
                          }}
                        >
                          {m.salesNzd > 0 ? `$${Math.round(m.salesNzd / 1000)}k` : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
