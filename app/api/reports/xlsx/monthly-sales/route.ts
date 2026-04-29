import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { currentFiscalYear, getActualsByPeriod, getBudgetsByPeriod } from "@/lib/reports/margin";
import { buildWorkbook, workbookToBuffer } from "@/lib/reports/xlsx";

export async function GET(req: NextRequest) {
  const session = await requireRole(["ADMIN", "SALES"]);
  const fy = parseInt(req.nextUrl.searchParams.get("fy") ?? String(currentFiscalYear()));

  const [actuals, budgets] = await Promise.all([
    getActualsByPeriod({ tenantId: session.tenantId }, fy),
    getBudgetsByPeriod({ tenantId: session.tenantId }, fy),
  ]);

  const rows = actuals.map((a) => {
    const b = budgets.find((x) => x.period === a.period);
    return {
      period: a.label,
      salesNzd: a.salesNzd,
      budgetSalesNzd: b?.salesNzd ?? 0,
      varianceSalesNzd: a.salesNzd - (b?.salesNzd ?? 0),
      cogsNzd: a.cogsNzd,
      grossMarginNzd: a.grossMarginNzd,
      grossMarginPct: a.grossMarginPct / 100,
      freightInNzd: a.freightInNzd,
    };
  });

  const totalSales = rows.reduce((s, r) => s + r.salesNzd, 0);
  const totals = {
    period: "TOTAL",
    salesNzd: totalSales,
    budgetSalesNzd: rows.reduce((s, r) => s + r.budgetSalesNzd, 0),
    varianceSalesNzd: rows.reduce((s, r) => s + r.varianceSalesNzd, 0),
    cogsNzd: rows.reduce((s, r) => s + r.cogsNzd, 0),
    grossMarginNzd: rows.reduce((s, r) => s + r.grossMarginNzd, 0),
    grossMarginPct: totalSales > 0 ? rows.reduce((s, r) => s + r.grossMarginNzd, 0) / totalSales : 0,
    freightInNzd: rows.reduce((s, r) => s + r.freightInNzd, 0),
  };

  const wb = buildWorkbook(
    "Monthly Sales Analysis",
    `FY${fy} · Apr ${fy} – Mar ${fy + 1}`,
    [
      { header: "Period", key: "period", width: 14, align: "left" },
      { header: "Actual Sales", key: "salesNzd", width: 14, numFmt: '"$"#,##0.00' },
      { header: "Budget Sales", key: "budgetSalesNzd", width: 14, numFmt: '"$"#,##0.00' },
      { header: "Variance $", key: "varianceSalesNzd", width: 14, numFmt: '"$"#,##0.00' },
      { header: "COGS", key: "cogsNzd", width: 14, numFmt: '"$"#,##0.00' },
      { header: "Gross Margin", key: "grossMarginNzd", width: 14, numFmt: '"$"#,##0.00' },
      { header: "Margin %", key: "grossMarginPct", width: 10, numFmt: '0.0%' },
      { header: "Freight In", key: "freightInNzd", width: 12, numFmt: '"$"#,##0.00' },
    ],
    rows as Record<string, unknown>[],
    totals as Record<string, unknown>
  );

  const buf = await workbookToBuffer(wb);
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="monthly-sales-fy${fy}.xlsx"`,
    },
  });
}
