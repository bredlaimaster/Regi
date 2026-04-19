import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getStockOnHand } from "@/lib/reports/inventory";
import { buildWorkbook, workbookToBuffer } from "@/lib/reports/xlsx";

export async function GET() {
  const session = await requireSession();
  const rows = await getStockOnHand(session.tenantId);

  const totals = {
    sku: "TOTAL",
    name: "",
    brandName: "",
    qty: rows.reduce((s, r) => s + r.qty, 0),
    costNzd: null,
    valueNzd: rows.reduce((s, r) => s + r.valueNzd, 0),
    sellPriceNzd: null,
    retailValueNzd: rows.reduce((s, r) => s + r.retailValueNzd, 0),
    reorderPoint: null,
  };

  const wb = buildWorkbook(
    "Stock on Hand",
    `Live SOH — Generated ${new Date().toLocaleDateString("en-NZ")}`,
    [
      { header: "SKU", key: "sku", width: 16, align: "left" },
      { header: "Product Name", key: "name", width: 30, align: "left" },
      { header: "Brand", key: "brandName", width: 16, align: "left" },
      { header: "QOH", key: "qty", width: 10, numFmt: '#,##0' },
      { header: "Re-order Pt", key: "reorderPoint", width: 12, numFmt: '#,##0' },
      { header: "Unit Cost", key: "costNzd", width: 12, numFmt: '"$"#,##0.0000' },
      { header: "Stock Value", key: "valueNzd", width: 14, numFmt: '"$"#,##0.00' },
      { header: "Sell Price", key: "sellPriceNzd", width: 12, numFmt: '"$"#,##0.00' },
      { header: "Retail Value", key: "retailValueNzd", width: 14, numFmt: '"$"#,##0.00' },
    ],
    rows as unknown as Record<string, unknown>[],
    totals as unknown as Record<string, unknown>
  );

  const buf = await workbookToBuffer(wb);
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="stock-on-hand-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
