import { requireRole } from "@/lib/auth";
import { currentFiscalYear, getSalesByRep } from "@/lib/reports/margin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";
import { FySelector } from "@/components/reports/fy-selector";
import { RepPerformanceChart } from "./chart";

export default async function RepPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const session = await requireRole(["ADMIN", "SALES"]);
  const sp = await searchParams;
  const fy = sp.fy ? parseInt(sp.fy) : currentFiscalYear();
  const rows = await getSalesByRep(session.tenantId, fy);

  const totalSales = rows.reduce((s, r) => s + r.salesNzd, 0);
  const chartData = rows.map((r) => ({
    name: r.repName,
    Sales: Math.round(r.salesNzd),
    Margin: Math.round(r.grossMarginNzd),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rep Performance</h1>
          <p className="text-sm text-muted-foreground">Report 16 · FY{fy}</p>
        </div>
        <FySelector current={fy} />
      </div>

      <RepPerformanceChart data={chartData} />

      <Card>
        <CardHeader><CardTitle className="text-base">By Sales Rep</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Share %</TableHead>
                <TableHead className="text-right">Gross Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-right">Customers</TableHead>
                <TableHead className="text-right">Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No shipped orders yet — assign reps to customers to see breakdown
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.repId}>
                  <TableCell className="font-medium">{r.repName}</TableCell>
                  <TableCell className="text-right">{formatNzd(r.salesNzd)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {totalSales > 0 ? ((r.salesNzd / totalSales) * 100).toFixed(1) : "0.0"}%
                  </TableCell>
                  <TableCell className="text-right">{formatNzd(r.grossMarginNzd)}</TableCell>
                  <TableCell className="text-right">{r.grossMarginPct.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{r.customerCount}</TableCell>
                  <TableCell className="text-right">{r.orderCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
