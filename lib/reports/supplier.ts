/**
 * Supplier ordering report primitives.
 * Report 19 — Container / consolidation planning
 * Report 20 — Multi-PO supplier ETA tracker
 * Report 18 — Re-order planner (Report 10 / bin-location crossover)
 */

import { prisma } from "@/lib/prisma";
import { toFiscalPeriod, fiscalPeriodToDates } from "./margin";

// ─── Report 19 — Container planning ──────────────────────────────────────────

export interface ContainerLine {
  supplierId: string;
  supplierName: string;
  supplierCurrency: string;
  openPoCount: number;
  totalValueSrc: number;    // in supplier currency
  totalValueNzd: number;
  expectedDates: (Date | null)[];
  earliestExpected: Date | null;
  latestExpected: Date | null;
  products: {
    sku: string;
    name: string;
    qtyOrdered: number;
    qtyReceived: number;
    outstanding: number;
  }[];
}

export async function getContainerPlanning(tenantId: string): Promise<ContainerLine[]> {
  const pos = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      status: { in: ["ORDERED"] },
    },
    include: {
      supplier: true,
      lines: { include: { product: { select: { sku: true, name: true } } } },
    },
    orderBy: { expectedDate: "asc" },
  });

  const supplierMap = new Map<string, ContainerLine>();

  for (const po of pos) {
    const key = po.supplierId;
    const existing: ContainerLine = supplierMap.get(key) ?? {
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      supplierCurrency: po.currency,
      openPoCount: 0,
      totalValueSrc: 0,
      totalValueNzd: 0,
      expectedDates: [],
      earliestExpected: null,
      latestExpected: null,
      products: [],
    };

    existing.openPoCount++;
    existing.totalValueSrc += Number(po.totalCost ?? 0);
    existing.totalValueNzd += Number(po.totalCostNzd ?? 0);
    existing.expectedDates.push(po.expectedDate);

    const allDates = existing.expectedDates.filter(Boolean) as Date[];
    existing.earliestExpected = allDates.length > 0
      ? new Date(Math.min(...allDates.map((d) => d.getTime())))
      : null;
    existing.latestExpected = allDates.length > 0
      ? new Date(Math.max(...allDates.map((d) => d.getTime())))
      : null;

    for (const l of po.lines) {
      const existingLine = existing.products.find((p) => p.sku === l.product.sku);
      const outstanding = l.qtyOrdered - l.qtyReceived;
      if (existingLine) {
        existingLine.qtyOrdered += l.qtyOrdered;
        existingLine.qtyReceived += l.qtyReceived;
        existingLine.outstanding += outstanding;
      } else {
        existing.products.push({
          sku: l.product.sku,
          name: l.product.name,
          qtyOrdered: l.qtyOrdered,
          qtyReceived: l.qtyReceived,
          outstanding,
        });
      }
    }

    supplierMap.set(key, existing);
  }

  return [...supplierMap.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}

// ─── Report 20 — Supplier ETA tracker ────────────────────────────────────────

export interface EtaRow {
  poId: string;
  poNumber: string;
  supplierName: string;
  currency: string;
  orderDate: Date;
  expectedDate: Date | null;
  daysUntilExpected: number | null;
  totalValueNzd: number;
  lineCount: number;
  status: string;
  isOverdue: boolean;
}

export async function getSupplierEta(tenantId: string): Promise<EtaRow[]> {
  const pos = await prisma.purchaseOrder.findMany({
    where: { tenantId, status: "ORDERED" },
    include: { supplier: true, lines: true },
    orderBy: { expectedDate: "asc" },
  });

  const now = new Date();

  return pos.map((po) => {
    const daysUntilExpected = po.expectedDate
      ? Math.round((po.expectedDate.getTime() - now.getTime()) / 86_400_000)
      : null;

    return {
      poId: po.id,
      poNumber: po.poNumber,
      supplierName: po.supplier.name,
      currency: po.currency,
      orderDate: po.orderDate,
      expectedDate: po.expectedDate,
      daysUntilExpected,
      totalValueNzd: Number(po.totalCostNzd ?? 0),
      lineCount: po.lines.length,
      status: po.status,
      isOverdue: daysUntilExpected !== null && daysUntilExpected < 0,
    };
  });
}

// ─── Report 18 — Re-order planner ────────────────────────────────────────────

export interface ReorderRow {
  productId: string;
  sku: string;
  name: string;
  brandName: string | null;
  supplierName: string | null;
  supplierCurrency: string;
  qtyOnHand: number;
  reorderPoint: number;
  avgMonthlyUsage: number;
  suggestedOrderQty: number;
  caseQty: number;
  suggestedCases: number;
  unitCostNzd: number;
  suggestedOrderValueNzd: number;
  openOrderQty: number;  // qty already on open POs
  netShortfall: number;
}

export async function getReorderPlanner(tenantId: string, fiscalYear: number): Promise<ReorderRow[]> {
  const now = new Date();
  const { period } = toFiscalPeriod(now);
  const { start: fyStart } = fiscalPeriodToDates(fiscalYear, 1);
  const periodsElapsed = Math.max(1, period);

  const products = await prisma.product.findMany({
    where: { tenantId, active: true },
    include: {
      brand: { select: { name: true } },
      supplier: { select: { name: true, currency: true } },
      stockLevel: true,
    },
  });

  // Qty sold this FY
  const soldLines = await prisma.salesOrderLine.findMany({
    where: {
      salesOrder: {
        tenantId,
        status: "SHIPPED",
        shippedDate: { gte: fyStart, lte: now },
      },
    },
    select: { productId: true, qtyOrdered: true },
  });
  const soldMap = new Map<string, number>();
  for (const l of soldLines) soldMap.set(l.productId, (soldMap.get(l.productId) ?? 0) + l.qtyOrdered);

  // Open PO qty
  const openLines = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrder: { tenantId, status: "ORDERED" } },
    select: { productId: true, qtyOrdered: true, qtyReceived: true },
  });
  const openMap = new Map<string, number>();
  for (const l of openLines) {
    openMap.set(l.productId, (openMap.get(l.productId) ?? 0) + (l.qtyOrdered - l.qtyReceived));
  }

  const rows: ReorderRow[] = [];

  for (const p of products) {
    const qtyOnHand = p.stockLevel?.qty ?? 0;
    const sold = soldMap.get(p.id) ?? 0;
    const avgMonthlyUsage = sold / periodsElapsed;
    const openOrderQty = openMap.get(p.id) ?? 0;
    const netStock = qtyOnHand + openOrderQty;

    // Only include if net stock is at or below reorder point
    if (netStock > p.reorderPoint) continue;

    // Suggest 3 months supply, rounded up to case qty
    const rawSuggest = Math.max(avgMonthlyUsage * 3, p.caseQty);
    const suggestedCases = Math.ceil(rawSuggest / Math.max(1, p.caseQty));
    const suggestedOrderQty = suggestedCases * p.caseQty;
    const netShortfall = Math.max(0, p.reorderPoint + suggestedOrderQty - netStock);

    rows.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      brandName: p.brand?.name ?? null,
      supplierName: p.supplier?.name ?? null,
      supplierCurrency: p.supplier?.currency ?? "NZD",
      qtyOnHand,
      reorderPoint: p.reorderPoint,
      avgMonthlyUsage: Math.round(avgMonthlyUsage * 10) / 10,
      suggestedOrderQty,
      caseQty: p.caseQty,
      suggestedCases,
      unitCostNzd: Number(p.costNzd ?? 0),
      suggestedOrderValueNzd: suggestedOrderQty * Number(p.costNzd ?? 0),
      openOrderQty,
      netShortfall,
    });
  }

  return rows.sort((a, b) => b.netShortfall - a.netShortfall);
}
