import { requireSession } from "@/lib/auth";
import { currentFiscalYear, getSalesByBrand } from "@/lib/reports/margin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";
import { FySelector } from "@/components/reports/fy-selector";
import { BrandChart } from "./chart";

export default async function BrandBreakdownPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const fy = sp.fy ? parseInt(sp.fy) : currentFiscalYear();
  const rows = await getSalesByBrand(session.tenantId, fy);

  const totalSales = rows.reduce((s, r) => s + r.salesNzd, 0);
  const chartData = rows.map((r) => ({
    name: r.name,
    Sales: Math.round(r.salesNzd),
    Margin: Math.round(r.grossMarginNzd),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brand Breakdown</h1>
          <p className="text-sm text-muted-foreground">Reports 1, 7, 8, 9 · FY{fy}</p>
        </div>
        <FySelector current={fy} />
      </div>

      <BrandChart data={chartData} />

      <Card>
        <CardHeader><CardTitle className="text-base">Sales by Brand</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Share %</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Gross Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No shipped orders yet — assign brands to products to see breakdown
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{formatNzd(r.salesNzd)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {totalSales > 0 ? ((r.salesNzd / totalSales) * 100).toFixed(1) : "0.0"}%
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatNzd(r.cogsNzd)}</TableCell>
                  <TableCell className="text-right">{formatNzd(r.grossMarginNzd)}</TableCell>
                  <TableCell className="text-right">{r.grossMarginPct.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
