/**
 * XLSX report generation using exceljs.
 *
 * All workbooks share an RHL brand style:
 *   - Header row: dark blue bg (#1e3a5f), white text, bold
 *   - Data rows: alternating white / light-blue (#f0f6ff)
 *   - Number columns right-aligned, currency formatted
 *   - Company header block on row 1
 */

import ExcelJS from "exceljs";

// ─── Brand constants ────────────────────────────────────────────────────────

const BRAND_DARK = "1e3a5f";   // dark navy
const BRAND_MID  = "2563eb";   // primary blue
const BRAND_LIGHT = "f0f6ff";  // very light blue stripe
const WHITE = "FFFFFF";

export interface ColDef {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;        // e.g. '"$"#,##0.00' or '0.0%'
  align?: "left" | "right" | "center";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function brandHeader(ws: ExcelJS.Worksheet, title: string, subtitle: string) {
  ws.spliceRows(1, 0,
    ["Regional Health Ltd", "", "", ""],
    [title],
    [subtitle, "", "", `Generated: ${new Date().toLocaleString("en-NZ")}`],
    []
  );

  ws.getRow(1).font = { name: "Calibri", bold: true, size: 14, color: { argb: BRAND_DARK } };
  ws.getRow(2).font = { name: "Calibri", bold: true, size: 12 };
  ws.getRow(3).font = { name: "Calibri", size: 10, color: { argb: "777777" } };
}

function applyHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
    cell.font = { color: { argb: WHITE }, bold: true, size: 10, name: "Calibri" };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: BRAND_MID } },
    };
  });
  row.height = 20;
}

function applyDataRow(row: ExcelJS.Row, index: number, cols: ColDef[]) {
  const isEven = index % 2 === 0;
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const col = cols[colNumber - 1];
    if (isEven) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
    }
    cell.font = { name: "Calibri", size: 10 };
    if (col?.numFmt) cell.numFmt = col.numFmt;
    cell.alignment = {
      horizontal: col?.align ?? (col?.numFmt ? "right" : "left"),
      vertical: "middle",
    };
  });
  row.height = 16;
}

/** Create a full report workbook with branding + data */
export function buildWorkbook(
  title: string,
  subtitle: string,
  cols: ColDef[],
  rows: Record<string, unknown>[],
  totalsRow?: Record<string, unknown>
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Regional Health Ltd";
  wb.created = new Date();

  const ws = wb.addWorksheet(title.slice(0, 31));

  // Column definitions
  ws.columns = cols.map((c) => ({
    key: c.key,
    width: c.width ?? 16,
    header: c.header,
  }));

  // Brand header block (inserts 4 rows before data header)
  brandHeader(ws, title, subtitle);

  // Header row (now at row 5)
  const headerRow = ws.getRow(5);
  headerRow.values = cols.map((c) => c.header);
  applyHeaderRow(headerRow);

  // Data rows
  rows.forEach((r, i) => {
    const row = ws.addRow(cols.map((c) => r[c.key]));
    applyDataRow(row, i, cols);
  });

  // Totals row
  if (totalsRow) {
    const trow = ws.addRow(cols.map((c) => totalsRow[c.key] ?? ""));
    trow.eachCell((cell, colNumber) => {
      const col = cols[colNumber - 1];
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "dbeafe" } };
      cell.font = { bold: true, name: "Calibri", size: 10 };
      if (col?.numFmt) cell.numFmt = col.numFmt;
      cell.border = { top: { style: "medium", color: { argb: BRAND_MID } } };
    });
    trow.getCell(1).value = "TOTAL";
  }

  // Freeze panes below header
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 5 }];

  // Auto-filter on header row
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: cols.length } };

  return wb;
}

/** Serialize workbook to Buffer for HTTP response */
export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
