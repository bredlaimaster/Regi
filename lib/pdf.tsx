import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import { formatNzDate, formatNzd } from "@/lib/utils";

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 18, marginBottom: 4, fontWeight: 700 },
  meta: { color: "#555", marginBottom: 12 },
  row: { flexDirection: "row", borderBottom: "1 solid #ddd", paddingVertical: 4 },
  th: { fontWeight: 700, backgroundColor: "#f3f4f6" },
  c1: { flex: 1 },
  c2: { flex: 3 },
  c3: { flex: 1, textAlign: "right" },
  c4: { flex: 2, textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end" },
});

type Line = { sku: string; name: string; qty: number; unit?: number };

export function DocPdf({
  title,
  subtitle,
  lines,
  showPrice,
  footer,
}: {
  title: string;
  subtitle: string;
  lines: Line[];
  showPrice?: boolean;
  footer?: string;
}) {
  const subtotal = lines.reduce((s, l) => s + (l.unit ?? 0) * l.qty, 0);
  const gst = subtotal * 0.15;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.meta}>{subtitle} · {formatNzDate(new Date())}</Text>
        <View style={[s.row, s.th]}>
          <Text style={s.c1}>SKU</Text>
          <Text style={s.c2}>Name</Text>
          <Text style={s.c3}>Qty</Text>
          {showPrice && <Text style={s.c4}>Line</Text>}
        </View>
        {lines.map((l, i) => (
          <View key={i} style={s.row}>
            <Text style={s.c1}>{l.sku}</Text>
            <Text style={s.c2}>{l.name}</Text>
            <Text style={s.c3}>{l.qty}</Text>
            {showPrice && <Text style={s.c4}>{formatNzd((l.unit ?? 0) * l.qty)}</Text>}
          </View>
        ))}
        {showPrice && (
          <View style={s.totals}>
            <Text>Subtotal: {formatNzd(subtotal)}</Text>
            <Text>GST (15%): {formatNzd(gst)}</Text>
            <Text>Total: {formatNzd(subtotal + gst)}</Text>
          </View>
        )}
        {footer && <Text style={{ marginTop: 20, color: "#555" }}>{footer}</Text>}
      </Page>
    </Document>
  );
}

export async function renderPdf(element: React.ReactElement): Promise<ReadableStream> {
  const stream = await renderToStream(element);
  // @ts-expect-error node stream -> web stream in runtime
  return stream;
}
