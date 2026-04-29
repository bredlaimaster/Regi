import { requireRole } from "@/lib/auth";
import { currentFiscalYear, getPLByPeriod } from "@/lib/reports/margin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";
import { FySelector } from "@/components/reports/fy-selector";
import { ActualVsBudgetChart } from "./chart";

export default async function ActualVsBudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const session = await requireRole(["ADMIN", "SALES"]);
  const sp = await searchParams;
  const fy = sp.fy ? parseInt(sp.fy) : currentFiscalYear();
  const rows = await getPLByPeriod({ tenantId: session.tenantId }, fy);

  const fyActual = rows.reduce((s, r) => s + r.salesNzd, 0);
  const fyBudget = rows.reduce((s, r) => s + r.budgetSalesNzd, 0);
  const fyVariance = fyActual - fyBudget;
  const fyVariancePct = fyBudget > 0 ? (fyVariance / fyBudget) * 100 : 0;

  const chartData = rows.map((r) => ({
    name: r.label,
    Actual: Math.round(r.salesNzd),
    Budget: Math.round(r.budgetSalesNzd),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Actual vs Budget</h1>
          <p className="text-sm text-muted-foreground">Reports 3 & 6 · FY{fy}</p>
        </div>
        <FySelector current={fy} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "FY Actual Sales", value: formatNzd(fyActual) },
          { label: "FY Budget Sales", value: formatNzd(fyBudget) },
          {
            label: "Variance $",
            value: (fyVariance >= 0 ? "+" : "") + formatNzd(fyVariance),
            color: fyVariance >= 0 ? "text-emerald-600" : "text-rose-600",
          },
          {
            label: "Variance %",
            value: (fyVariancePct >= 0 ? "+" : "") + fyVariancePct.toFixed(1) + "%",
            color: fyVariancePct >= 0 ? "text-emerald-600" : "text-rose-600",
          },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <p className={`text-xl font-bold tabular-nums ${k.color ?? ""}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ActualVsBudgetChart data={chartData} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Period Detail</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Actual Sales</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Variance $</TableHead>
                <TableHead className="text-right">Variance %</TableHead>
                <TableHead className="text-right">Actual Margin</TableHead>
                <TableHead className="text-right">Budget Margin</TableHead>
                <TableHead className="text-right">Margin Var</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const varPct = r.budgetSalesNzd > 0 ? (r.varianceSalesNzd / r.budgetSalesNzd) * 100 : 0;
                return (
                  <TableRow key={r.period}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right">{formatNzd(r.salesNzd)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNzd(r.budgetSalesNzd)}</TableCell>
                    <TableCell className={`text-right font-medium ${r.varianceSalesNzd >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {(r.varianceSalesNzd >= 0 ? "+" : "") + formatNzd(r.varianceSalesNzd)}
                    </TableCell>
                    <TableCell className={`text-right ${r.varianceSalesNzd >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {(varPct >= 0 ? "+" : "") + varPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">{formatNzd(r.grossMarginNzd)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNzd(r.budgetGrossMarginNzd)}</TableCell>
                    <TableCell className={`text-right ${r.varianceGrossMarginNzd >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {(r.varianceGrossMarginNzd >= 0 ? "+" : "") + formatNzd(r.varianceGrossMarginNzd)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
