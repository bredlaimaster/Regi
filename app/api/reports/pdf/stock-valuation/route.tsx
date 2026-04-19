import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getStockOnHand } from "@/lib/reports/inventory";
import { ReportDocument } from "@/lib/reports/pdf";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

export async function GET() {
  const session = await requireSession();
  const rows = await getStockOnHand(session.tenantId);

  const totalValue = rows.reduce((s, r) => s + r.valueNzd, 0);
  const totalRetail = rows.reduce((s, r) => s + r.retailValueNzd, 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  function fmt(n: number) {
    return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", minimumFractionDigits: 2 }).format(n);
  }

  const pdfRows = rows.map((r) => ({
    sku: r.sku,
    name: r.name,
    brand: r.brandName ?? "—",
    qty: r.qty,
    unitCost: r.costNzd > 0 ? fmt(r.costNzd) : "—",
    value: fmt(r.valueNzd),
    sellPrice: fmt(r.sellPriceNzd),
    retailValue: fmt(r.retailValueNzd),
    flag: r.belowReorder ? "⚠ Low" : "",
  }));

  const buf = await renderToBuffer(
    <ReportDocument
      title="Stock Valuation Report"
      subtitle={`Live SOH — ${new Date().toLocaleDateString("en-NZ")}`}
      kpis={[
        { label: "Total SKUs", value: rows.length.toString() },
        { label: "Total Units", value: totalQty.toLocaleString() },
        { label: "Cost Value (NZD)", value: fmt(totalValue) },
        { label: "Retail Value (NZD)", value: fmt(totalRetail) },
      ]}
      cols={[
        { header: "SKU", key: "sku", flex: 1.2 },
        { header: "Product Name", key: "name", flex: 3 },
        { header: "Brand", key: "brand", flex: 1.2 },
        { header: "QOH", key: "qty", flex: 0.7, align: "right" },
        { header: "Unit Cost", key: "unitCost", flex: 1, align: "right", style: "muted" },
        { header: "Stock Value", key: "value", flex: 1.2, align: "right", style: "bold" },
        { header: "Sell Price", key: "sellPrice", flex: 1, align: "right", style: "muted" },
        { header: "Retail Value", key: "retailValue", flex: 1.2, align: "right" },
        { header: "", key: "flag", flex: 0.7, align: "center", style: "amber" },
      ]}
      rows={pdfRows}
      totalsRow={{
        sku: "TOTAL",
        qty: totalQty,
        value: fmt(totalValue),
        retailValue: fmt(totalRetail),
      }}
    />
  );

  return new NextResponse(Buffer.from(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="stock-valuation-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
