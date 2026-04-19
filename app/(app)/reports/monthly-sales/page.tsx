import { requireSession } from "@/lib/auth";
import {
  currentFiscalYear,
  getActualsByPeriod,
  getSalesByBrand,
  getBudgetsByPeriod,
} from "@/lib/reports/margin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";
import { MonthlySalesChart } from "./chart";
import { FySelector } from "@/components/reports/fy-selector";
import { ExportButton } from "@/components/reports/export-button";
import { LastSentBadge } from "@/components/reports/last-sent-badge";

export default async function MonthlySalesPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const fy = sp.fy ? parseInt(sp.fy) : currentFiscalYear();

  const [actuals, byBrand, budgets] = await Promise.all([
    getActualsByPeriod({ tenantId: session.tenantId }, fy),
    getSalesByBrand(session.tenantId, fy),
    getBudgetsByPeriod({ tenantId: session.tenantId }, fy),
  ]);

  const totalSales = actuals.reduce((s, r) => s + r.salesNzd, 0);
  const totalMargin = actuals.reduce((s, r) => s + r.grossMarginNzd, 0);
  const totalMarginPct = totalSales > 0 ? (totalMargin / totalSales) * 100 : 0;
  const totalBudgetSales = budgets.reduce((s, r) => s + r.salesNzd, 0);
  const varianceSales = totalSales - totalBudgetSales;

  const chartData = actuals.map((r) => ({
    name: r.label,
    Actual: Math.round(r.salesNzd),
    Budget: Math.round(budgets.find((b) => b.period === r.period)?.salesNzd ?? 0),
    Margin: Math.round(r.grossMarginNzd),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Monthly Sales Analysis</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">Report 15 · FY{fy} (Apr {fy} – Mar {fy + 1})</p>
            <LastSentBadge tenantId={session.tenantId} reportKey="monthly-sales" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href={`/api/reports/xlsx/monthly-sales?fy=${fy}`} />
          <FySelector current={fy} />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "FY Sales", value: formatNzd(totalSales) },
          { label: "Gross Margin", value: formatNzd(totalMargin) },
          { label: "Margin %", value: `${totalMarginPct.toFixed(1)}%` },
          {
            label: "vs Budget",
            value: (varianceSales >= 0 ? "+" : "") + formatNzd(varianceSales),
            highlight: varianceSales >= 0 ? "positive" : "negative",
          },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardDescription className="text-xs">{k.label}</CardDescription>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <p
                className={`text-xl font-bold tabular-nums ${
                  k.highlight === "positive"
                    ? "text-emerald-600"
                    : k.highlight === "negative"
                    ? "text-rose-600"
                    : ""
                }`}
              >
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <MonthlySalesChart data={chartData} />

      {/* Monthly table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Month-by-Month Detail</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Gross Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-right">Freight-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actuals.map((r) => {
                const bud = budgets.find((b) => b.period === r.period);
                const variance = r.salesNzd - (bud?.salesNzd ?? 0);
                return (
                  <TableRow key={r.period}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right">{formatNzd(r.salesNzd)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNzd(bud?.salesNzd ?? 0)}</TableCell>
                    <TableCell className={`text-right font-medium ${variance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {(variance >= 0 ? "+" : "") + formatNzd(variance)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNzd(r.cogsNzd)}</TableCell>
                    <TableCell className="text-right">{formatNzd(r.grossMarginNzd)}</TableCell>
                    <TableCell className="text-right">{r.grossMarginPct.toFixed(1)}%</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNzd(r.freightInNzd)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 font-semibold bg-muted/30">
                <TableCell>FY Total</TableCell>
                <TableCell className="text-right">{formatNzd(totalSales)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatNzd(totalBudgetSales)}</TableCell>
                <TableCell className={`text-right ${varianceSales >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {(varianceSales >= 0 ? "+" : "") + formatNzd(varianceSales)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{formatNzd(actuals.reduce((s, r) => s + r.cogsNzd, 0))}</TableCell>
                <TableCell className="text-right">{formatNzd(totalMargin)}</TableCell>
                <TableCell className="text-right">{totalMarginPct.toFixed(1)}%</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatNzd(actuals.reduce((s, r) => s + r.freightInNzd, 0))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Brand breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Brand</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Gross Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byBrand.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No shipped orders yet — assign brands to products to see breakdown
                  </TableCell>
                </TableRow>
              )}
              {byBrand.map((b) => (
                <TableRow key={b.name}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-right">{formatNzd(b.salesNzd)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatNzd(b.cogsNzd)}</TableCell>
                  <TableCell className="text-right">{formatNzd(b.grossMarginNzd)}</TableCell>
                  <TableCell className="text-right">{b.grossMarginPct.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
