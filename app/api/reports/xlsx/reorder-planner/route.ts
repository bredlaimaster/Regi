import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { currentFiscalYear } from "@/lib/reports/margin";
import { getReorderPlanner } from "@/lib/reports/supplier";
import { buildWorkbook, workbookToBuffer } from "@/lib/reports/xlsx";

export async function GET() {
  const session = await requireSession();
  const fy = currentFiscalYear();
  const rows = await getReorderPlanner(session.tenantId, fy);

  const totals = {
    sku: "TOTAL",
    name: "",
    brandName: "",
    supplierName: "",
    qtyOnHand: rows.reduce((s, r) => s + r.qtyOnHand, 0),
    reorderPoint: null,
    openOrderQty: rows.reduce((s, r) => s + r.openOrderQty, 0),
    avgMonthlyUsage: null,
    caseQty: null,
    suggestedCases: rows.reduce((s, r) => s + r.suggestedCases, 0),
    suggestedOrderQty: rows.reduce((s, r) => s + r.suggestedOrderQty, 0),
    suggestedOrderValueNzd: rows.reduce((s, r) => s + r.suggestedOrderValueNzd, 0),
  };

  const wb = buildWorkbook(
    "Re-order Planner",
    `FY${fy} — Generated ${new Date().toLocaleDateString("en-NZ")}`,
    [
      { header: "SKU", key: "sku", width: 16, align: "left" },
      { header: "Product", key: "name", width: 30, align: "left" },
      { header: "Brand", key: "brandName", width: 16, align: "left" },
      { header: "Supplier", key: "supplierName", width: 20, align: "left" },
      { header: "QOH", key: "qtyOnHand", width: 8, numFmt: '#,##0' },
      { header: "Re-order Pt", key: "reorderPoint", width: 10, numFmt: '#,##0' },
      { header: "On Order", key: "openOrderQty", width: 10, numFmt: '#,##0' },
      { header: "Avg/Mo", key: "avgMonthlyUsage", width: 10, numFmt: '#,##0.0' },
      { header: "Case Qty", key: "caseQty", width: 10, numFmt: '#,##0' },
      { header: "Sug. Cases", key: "suggestedCases", width: 10, numFmt: '#,##0' },
      { header: "Sug. Units", key: "suggestedOrderQty", width: 10, numFmt: '#,##0' },
      { header: "Est. Value NZD", key: "suggestedOrderValueNzd", width: 15, numFmt: '"$"#,##0.00' },
    ],
    rows as unknown as Record<string, unknown>[],
    totals as unknown as Record<string, unknown>
  );

  const buf = await workbookToBuffer(wb);
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reorder-planner-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
