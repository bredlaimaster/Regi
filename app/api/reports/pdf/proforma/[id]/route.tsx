import { NextRequest, NextResponse } from "next/server";
import { requireRole, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { ReportHeader, PageFooter } from "@/lib/reports/pdf";
import React from "react";

const S = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1a1a1a", padding: 36 },
  section: { marginBottom: 16 },
  label: { fontSize: 8, color: "#666", marginBottom: 2 },
  value: { fontSize: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#1e3a5f", padding: 6 },
  tableHeaderCell: { fontFamily: "Helvetica-Bold", color: "#fff", fontSize: 8 },
  tableRow: { flexDirection: "row", padding: 5, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  tableRowAlt: { backgroundColor: "#f0f6ff" },
  cell: { fontSize: 8.5 },
  cellRight: { textAlign: "right" },
  totalRow: {
    flexDirection: "row", padding: 6,
    backgroundColor: "#dbeafe",
    borderTopWidth: 1.5, borderTopColor: "#2563eb",
    marginTop: 2,
  },
  totalCell: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  terms: { marginTop: 16, padding: 12, backgroundColor: "#f8fafc", borderRadius: 4 },
  termsText: { fontSize: 8, color: "#555", lineHeight: 1.5 },
  proformaStamp: {
    position: "absolute", top: 80, right: 36,
    fontSize: 28, fontFamily: "Helvetica-Bold", color: "#2563eb",
    opacity: 0.15, transform: "rotate(-20deg)",
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["ADMIN", "SALES"]);
  const { id } = await params;

  const pf = await prisma.proformaInvoice.findUnique({
    where: { id },
    include: {
      salesOrder: {
        include: {
          customer: true,
          lines: {
            include: { product: { select: { name: true, sku: true } } },
          },
        },
      },
    },
  });

  if (!pf) return new NextResponse("Not found", { status: 404 });
  assertTenant(pf.tenantId, session.tenantId);

  const so = pf.salesOrder;
  if (!so) return new NextResponse("SO not found", { status: 404 });

  const orderDiscount = Number(so.discountPct ?? 0);
  let subtotal = 0;
  const lineRows = so.lines.map((l, i) => {
    const linePrice = Number(l.unitPrice);
    const lineDiscount = Math.max(Number(l.discountPct ?? 0), orderDiscount);
    const lineTotal = l.qtyOrdered * linePrice * (1 - lineDiscount / 100);
    subtotal += lineTotal;
    return {
      i,
      sku: l.product.sku,
      name: l.product.name,
      qty: l.qtyOrdered,
      unitPrice: linePrice,
      discount: lineDiscount,
      total: lineTotal,
    };
  });

  const gst = subtotal * 0.15;
  const grandTotal = subtotal + gst;

  function fmt(n: number) {
    return `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const billTo = so.customer;
  const shipTo = so.selectedShipTo as { line1?: string; city?: string; country?: string } | null;

  const buf = await renderToBuffer(
    <Document>
      <Page size="A4" style={S.page}>
        <Text style={S.proformaStamp}>PROFORMA</Text>
        <ReportHeader title="Proforma Invoice" subtitle={pf.pfNumber} />

        {/* Invoice details + addresses */}
        <View style={{ flexDirection: "row", marginBottom: 16, gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={S.label}>Bill To</Text>
            <Text style={[S.value, { fontFamily: "Helvetica-Bold" }]}>{billTo.name}</Text>
            {billTo.address && <Text style={S.value}>{billTo.address}</Text>}
            {billTo.email && <Text style={[S.value, { color: "#555" }]}>{billTo.email}</Text>}
          </View>
          {shipTo && (
            <View style={{ flex: 1 }}>
              <Text style={S.label}>Ship To</Text>
              <Text style={S.value}>{shipTo.line1 ?? ""}</Text>
              <Text style={S.value}>{[shipTo.city, shipTo.country].filter(Boolean).join(", ")}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={S.row}>
              <Text style={S.label}>Proforma #</Text>
              <Text style={[S.value, { fontFamily: "Helvetica-Bold" }]}>{pf.pfNumber}</Text>
            </View>
            <View style={S.row}>
              <Text style={S.label}>SO #</Text>
              <Text style={S.value}>{so.soNumber}</Text>
            </View>
            <View style={S.row}>
              <Text style={S.label}>Issued</Text>
              <Text style={S.value}>{new Date(pf.issuedAt).toLocaleDateString("en-NZ")}</Text>
            </View>
            {pf.expiresAt && (
              <View style={S.row}>
                <Text style={S.label}>Valid Until</Text>
                <Text style={S.value}>{new Date(pf.expiresAt).toLocaleDateString("en-NZ")}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Line items */}
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderCell, { flex: 1 }]}>SKU</Text>
          <Text style={[S.tableHeaderCell, { flex: 3 }]}>Description</Text>
          <Text style={[S.tableHeaderCell, { flex: 0.8, textAlign: "right" }]}>Qty</Text>
          <Text style={[S.tableHeaderCell, { flex: 1.2, textAlign: "right" }]}>Unit Price</Text>
          <Text style={[S.tableHeaderCell, { flex: 0.8, textAlign: "right" }]}>Disc %</Text>
          <Text style={[S.tableHeaderCell, { flex: 1.2, textAlign: "right" }]}>Amount</Text>
        </View>
        {lineRows.map((l) => (
          <View key={l.i} style={[S.tableRow, l.i % 2 === 1 ? S.tableRowAlt : {}]}>
            <Text style={[S.cell, { flex: 1, color: "#555" }]}>{l.sku}</Text>
            <Text style={[S.cell, { flex: 3 }]}>{l.name}</Text>
            <Text style={[S.cell, S.cellRight, { flex: 0.8 }]}>{l.qty}</Text>
            <Text style={[S.cell, S.cellRight, { flex: 1.2 }]}>{fmt(l.unitPrice)}</Text>
            <Text style={[S.cell, S.cellRight, { flex: 0.8, color: l.discount > 0 ? "#d97706" : "#888" }]}>
              {l.discount > 0 ? `${l.discount}%` : "—"}
            </Text>
            <Text style={[S.cell, S.cellRight, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>{fmt(l.total)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={{ alignItems: "flex-end", marginTop: 8 }}>
          <View style={{ width: 200 }}>
            <View style={S.row}><Text style={S.label}>Subtotal (ex GST)</Text><Text style={S.value}>{fmt(subtotal)}</Text></View>
            <View style={S.row}><Text style={S.label}>GST (15%)</Text><Text style={S.value}>{fmt(gst)}</Text></View>
            <View style={[S.totalRow, { borderRadius: 4 }]}>
              <Text style={[S.totalCell, { flex: 1 }]}>TOTAL (NZD)</Text>
              <Text style={[S.totalCell, { textAlign: "right" }]}>{fmt(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Terms */}
        <View style={S.terms}>
          <Text style={[S.termsText, { fontFamily: "Helvetica-Bold", marginBottom: 4 }]}>Payment Terms & Notes</Text>
          <Text style={S.termsText}>
            This is a proforma invoice only and is not a tax invoice. Payment is due within 30 days of receipt.
            Goods will be dispatched upon receipt of payment. Prices are in NZD and include GST unless stated otherwise.
            This proforma is valid until {pf.expiresAt ? new Date(pf.expiresAt).toLocaleDateString("en-NZ") : "30 days from issue"}.
          </Text>
          {so.notes && <Text style={[S.termsText, { marginTop: 6 }]}>Notes: {so.notes}</Text>}
        </View>

        <PageFooter />
      </Page>
    </Document>
  );

  return new NextResponse(Buffer.from(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="proforma-${pf.pfNumber}.pdf"`,
    },
  });
}
