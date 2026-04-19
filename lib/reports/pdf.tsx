/**
 * RHL-branded PDF template components.
 * Uses @react-pdf/renderer.
 *
 * Brand palette:
 *   Dark navy:   #1e3a5f
 *   Primary blue: #2563eb
 *   Light blue:   #dbeafe
 *   White:        #ffffff
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1a1a1a",
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
  },
  // Header
  headerBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#1e3a5f",
    paddingBottom: 8,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
  },
  companySubline: {
    fontSize: 8,
    color: "#666",
    marginTop: 2,
  },
  reportTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
    textAlign: "right",
  },
  reportSubtitle: {
    fontSize: 8,
    color: "#666",
    textAlign: "right",
    marginTop: 2,
  },
  // KPI strip
  kpiRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#f0f6ff",
    borderRadius: 4,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#2563eb",
  },
  kpiLabel: {
    fontSize: 7,
    color: "#666",
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
  },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1e3a5f",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    fontSize: 7.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableRowAlt: {
    backgroundColor: "#f0f6ff",
  },
  tableRowTotal: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: "#dbeafe",
    borderTopWidth: 1.5,
    borderTopColor: "#2563eb",
  },
  tableCell: {
    fontSize: 8,
    color: "#1a1a1a",
  },
  tableCellBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  tableCellRight: {
    textAlign: "right",
  },
  tableCellMuted: {
    color: "#666",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 4,
  },
  footerText: {
    fontSize: 7,
    color: "#999",
  },
  // Positive/negative
  positive: { color: "#16a34a" },
  negative: { color: "#dc2626" },
  amber: { color: "#d97706" },
});

// ─── Components ───────────────────────────────────────────────────────────────

export function ReportHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={S.headerBlock}>
      <View>
        <Text style={S.companyName}>Regional Health Ltd</Text>
        <Text style={S.companySubline}>NZ Inventory Management System</Text>
      </View>
      <View>
        <Text style={S.reportTitle}>{title}</Text>
        <Text style={S.reportSubtitle}>{subtitle}</Text>
        <Text style={S.reportSubtitle}>
          Generated: {new Date().toLocaleString("en-NZ")}
        </Text>
      </View>
    </View>
  );
}

export function KpiStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={S.kpiRow}>
      {items.map((k) => (
        <View key={k.label} style={S.kpiCard}>
          <Text style={S.kpiLabel}>{k.label}</Text>
          <Text style={S.kpiValue}>{k.value}</Text>
        </View>
      ))}
    </View>
  );
}

export interface PdfColDef {
  header: string;
  key: string;
  flex?: number;
  align?: "left" | "right" | "center";
  style?: "normal" | "muted" | "bold" | "positive" | "negative" | "amber";
}

export function DataTable({
  cols,
  rows,
  totalsRow,
}: {
  cols: PdfColDef[];
  rows: Record<string, unknown>[];
  totalsRow?: Record<string, unknown>;
}) {
  return (
    <View>
      {/* Header */}
      <View style={S.tableHeader}>
        {cols.map((c) => (
          <Text
            key={c.key}
            style={[S.tableHeaderCell, { flex: c.flex ?? 1, textAlign: c.align ?? "left" }]}
          >
            {c.header}
          </Text>
        ))}
      </View>
      {/* Rows */}
      {rows.map((r, i) => (
        <View key={i} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
          {cols.map((c) => {
            const val = r[c.key];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cellStyle: any[] = [
              S.tableCell,
              { flex: c.flex ?? 1, textAlign: c.align ?? "left" },
            ];
            if (c.style === "muted") cellStyle.push(S.tableCellMuted);
            if (c.style === "bold") cellStyle.push(S.tableCellBold);
            if (c.style === "positive") cellStyle.push(S.positive);
            if (c.style === "negative") cellStyle.push(S.negative);
            if (c.style === "amber") cellStyle.push(S.amber);
            return (
              <Text key={c.key} style={cellStyle}>
                {val == null ? "" : String(val)}
              </Text>
            );
          })}
        </View>
      ))}
      {/* Totals */}
      {totalsRow && (
        <View style={S.tableRowTotal}>
          {cols.map((c) => (
            <Text
              key={c.key}
              style={[S.tableCellBold, { flex: c.flex ?? 1, textAlign: c.align ?? "left" }]}
            >
              {totalsRow[c.key] == null ? "" : String(totalsRow[c.key])}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export function PageFooter() {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>Regional Health Ltd — Confidential</Text>
      <Text
        style={S.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

// ─── Standard report document wrapper ─────────────────────────────────────────

export function ReportDocument({
  title,
  subtitle,
  kpis,
  cols,
  rows,
  totalsRow,
}: {
  title: string;
  subtitle: string;
  kpis?: { label: string; value: string }[];
  cols: PdfColDef[];
  rows: Record<string, unknown>[];
  totalsRow?: Record<string, unknown>;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={S.page}>
        <ReportHeader title={title} subtitle={subtitle} />
        {kpis && kpis.length > 0 && <KpiStrip items={kpis} />}
        <DataTable cols={cols} rows={rows} totalsRow={totalsRow} />
        <PageFooter />
      </Page>
    </Document>
  );
}
