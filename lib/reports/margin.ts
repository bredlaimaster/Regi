/**
 * Margin & P&L primitives for Regional Health Ltd.
 *
 * Fiscal year: April–March (period 1 = April, period 12 = March)
 *
 * All monetary values in NZD.
 */

import { prisma } from "@/lib/prisma";

// ─── Fiscal-year helpers ─────────────────────────────────────────────────────

/** Convert a calendar date to { fiscalYear, period } where period 1 = April. */
export function toFiscalPeriod(date: Date): { fiscalYear: number; period: number } {
  const m = date.getMonth() + 1; // 1–12
  const y = date.getFullYear();
  const period = m >= 4 ? m - 3 : m + 9; // Apr=1 … Mar=12
  const fiscalYear = m >= 4 ? y : y - 1;
  return { fiscalYear, period };
}

/** Return the calendar month boundaries for a fiscal period. */
export function fiscalPeriodToDates(fiscalYear: number, period: number): { start: Date; end: Date } {
  const calMonth = period <= 9 ? period + 3 : period - 9; // 1→Apr, 12→Mar
  const calYear = period <= 9 ? fiscalYear : fiscalYear + 1;
  const start = new Date(calYear, calMonth - 1, 1);
  const end = new Date(calYear, calMonth, 0, 23, 59, 59, 999);
  return { start, end };
}

/** All 12 periods for a fiscal year, as { period, start, end } */
export function fiscalYearPeriods(fiscalYear: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    period: i + 1,
    ...fiscalPeriodToDates(fiscalYear, i + 1),
  }));
}

/** Current fiscal year */
export function currentFiscalYear(): number {
  return toFiscalPeriod(new Date()).fiscalYear;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PeriodActuals {
  fiscalYear: number;
  period: number;
  label: string;          // e.g. "Apr 2025"
  salesNzd: number;
  cogsNzd: number;
  grossMarginNzd: number;
  grossMarginPct: number;
  freightInNzd: number;
}

export interface BudgetRow {
  fiscalYear: number;
  period: number;
  salesNzd: number;
  cogsNzd: number;
  grossMarginNzd: number;
}

export interface PLRow extends PeriodActuals {
  budgetSalesNzd: number;
  budgetGrossMarginNzd: number;
  varianceSalesNzd: number;
  varianceGrossMarginNzd: number;
}

export interface Filters {
  tenantId: string;
  brandId?: string;
  channelId?: string;
  territoryId?: string;
  repId?: string;
}

// ─── Actuals ─────────────────────────────────────────────────────────────────

/**
 * Compute actual sales + COGS per fiscal period for a given year.
 *
 * COGS = sum(sol.qtyOrdered * p.costNzd) for shipped orders.
 * Sales = sum(sol.qtyOrdered * sol.unitPrice) for shipped orders.
 */
export async function getActualsByPeriod(
  filters: Filters,
  fiscalYear: number
): Promise<PeriodActuals[]> {
  const periods = fiscalYearPeriods(fiscalYear);

  const results = await Promise.all(
    periods.map(async ({ period, start, end }) => {
      // Build dynamic where clause for dimensions
      const soWhere: Record<string, unknown> = {
        tenantId: filters.tenantId,
        status: "SHIPPED",
        shippedDate: { gte: start, lte: end },
      };
      if (filters.repId) soWhere.customer = { salesRepId: filters.repId };
      if (filters.channelId) soWhere.customer = { ...(soWhere.customer as object ?? {}), channelId: filters.channelId };
      if (filters.territoryId) soWhere.customer = { ...(soWhere.customer as object ?? {}), territoryId: filters.territoryId };

      const lineWhere: Record<string, unknown> = {};
      if (filters.brandId) lineWhere.product = { brandId: filters.brandId };

      const lines = await prisma.salesOrderLine.findMany({
        where: {
          salesOrder: soWhere,
          ...lineWhere,
        },
        include: {
          product: { select: { costNzd: true } },
        },
      });

      let salesNzd = 0;
      let cogsNzd = 0;

      for (const l of lines) {
        salesNzd += l.qtyOrdered * Number(l.unitPrice);
        cogsNzd += l.qtyOrdered * Number(l.product.costNzd ?? 0);
      }

      // Freight-in: sum of freightNzd from received POs in this period
      const poFreight = await prisma.purchaseOrder.aggregate({
        where: {
          tenantId: filters.tenantId,
          status: "RECEIVED",
          updatedAt: { gte: start, lte: end },
          ...(filters.brandId ? { lines: { some: { product: { brandId: filters.brandId } } } } : {}),
        },
        _sum: { freightNzd: true },
      });
      const freightInNzd = Number(poFreight._sum.freightNzd ?? 0);

      const grossMarginNzd = salesNzd - cogsNzd;
      const grossMarginPct = salesNzd > 0 ? (grossMarginNzd / salesNzd) * 100 : 0;

      const calMonth = period <= 9 ? period + 3 : period - 9;
      const calYear = period <= 9 ? fiscalYear : fiscalYear + 1;
      const label = new Date(calYear, calMonth - 1, 1).toLocaleString("en-NZ", { month: "short", year: "numeric" });

      return {
        fiscalYear,
        period,
        label,
        salesNzd,
        cogsNzd,
        grossMarginNzd,
        grossMarginPct,
        freightInNzd,
      };
    })
  );

  return results;
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function getBudgetsByPeriod(
  filters: Filters,
  fiscalYear: number
): Promise<BudgetRow[]> {
  const budgets = await prisma.budget.findMany({
    where: {
      tenantId: filters.tenantId,
      fiscalYear,
      ...(filters.brandId ? { brandId: filters.brandId } : {}),
      ...(filters.channelId ? { channelId: filters.channelId } : {}),
      ...(filters.territoryId ? { territoryId: filters.territoryId } : {}),
      ...(filters.repId ? { repId: filters.repId } : {}),
    },
  });

  const rows: Record<number, BudgetRow> = {};
  for (let p = 1; p <= 12; p++) {
    rows[p] = { fiscalYear, period: p, salesNzd: 0, cogsNzd: 0, grossMarginNzd: 0 };
  }

  for (const b of budgets) {
    const r = rows[b.period];
    if (!r) continue;
    const amt = Number(b.amountNzd);
    if (b.lineType === "SALES") r.salesNzd += amt;
    else if (b.lineType === "COGS") r.cogsNzd += amt;
    else if (b.lineType === "GROSS_MARGIN") r.grossMarginNzd += amt;
  }

  // Derive gross margin from sales - cogs if not explicitly budgeted
  for (const r of Object.values(rows)) {
    if (r.grossMarginNzd === 0 && (r.salesNzd !== 0 || r.cogsNzd !== 0)) {
      r.grossMarginNzd = r.salesNzd - r.cogsNzd;
    }
  }

  return Object.values(rows).sort((a, b) => a.period - b.period);
}

// ─── Combined P&L ─────────────────────────────────────────────────────────────

export async function getPLByPeriod(filters: Filters, fiscalYear: number): Promise<PLRow[]> {
  const [actuals, budgets] = await Promise.all([
    getActualsByPeriod(filters, fiscalYear),
    getBudgetsByPeriod(filters, fiscalYear),
  ]);

  return actuals.map((a) => {
    const b = budgets.find((x) => x.period === a.period)!;
    return {
      ...a,
      budgetSalesNzd: b.salesNzd,
      budgetGrossMarginNzd: b.grossMarginNzd,
      varianceSalesNzd: a.salesNzd - b.salesNzd,
      varianceGrossMarginNzd: a.grossMarginNzd - b.grossMarginNzd,
    };
  });
}

// ─── Dimension summaries ──────────────────────────────────────────────────────

/** Sales by brand for a fiscal year (used in Report 15 drill-down) */
export async function getSalesByBrand(tenantId: string, fiscalYear: number) {
  const { start } = fiscalPeriodToDates(fiscalYear, 1);
  const { end } = fiscalPeriodToDates(fiscalYear, 12);

  const lines = await prisma.salesOrderLine.findMany({
    where: {
      salesOrder: { tenantId, status: "SHIPPED", shippedDate: { gte: start, lte: end } },
    },
    include: {
      product: { include: { brand: true } },
    },
  });

  const map = new Map<string, { name: string; salesNzd: number; cogsNzd: number }>();
  for (const l of lines) {
    const key = l.product.brandId ?? "__none__";
    const label = l.product.brand?.name ?? "Unbranded";
    const existing = map.get(key) ?? { name: label, salesNzd: 0, cogsNzd: 0 };
    existing.salesNzd += l.qtyOrdered * Number(l.unitPrice);
    existing.cogsNzd += l.qtyOrdered * Number(l.product.costNzd ?? 0);
    map.set(key, existing);
  }

  return [...map.values()]
    .map((v) => ({ ...v, grossMarginNzd: v.salesNzd - v.cogsNzd, grossMarginPct: v.salesNzd > 0 ? ((v.salesNzd - v.cogsNzd) / v.salesNzd) * 100 : 0 }))
    .sort((a, b) => b.salesNzd - a.salesNzd);
}

/** Sales by customer for a period range (Reports 2, 7, 8, 9) */
export async function getSalesByCustomer(
  tenantId: string,
  start: Date,
  end: Date,
  filters: Partial<Filters> = {}
) {
  const soWhere: Record<string, unknown> = {
    tenantId,
    status: "SHIPPED",
    shippedDate: { gte: start, lte: end },
  };
  const customerFilter: Record<string, unknown> = {};
  if (filters.repId) customerFilter.salesRepId = filters.repId;
  if (filters.channelId) customerFilter.channelId = filters.channelId;
  if (filters.territoryId) customerFilter.territoryId = filters.territoryId;
  if (Object.keys(customerFilter).length) soWhere.customer = customerFilter;

  const lineWhere: Record<string, unknown> = {};
  if (filters.brandId) lineWhere.product = { brandId: filters.brandId };

  const lines = await prisma.salesOrderLine.findMany({
    where: { salesOrder: soWhere, ...lineWhere },
    include: {
      product: { select: { costNzd: true } },
      salesOrder: { include: { customer: true } },
    },
  });

  const map = new Map<string, { customerId: string; customerName: string; salesNzd: number; cogsNzd: number; orderCount: Set<string> }>();
  for (const l of lines) {
    const c = l.salesOrder.customer;
    const existing = map.get(c.id) ?? { customerId: c.id, customerName: c.name, salesNzd: 0, cogsNzd: 0, orderCount: new Set() };
    existing.salesNzd += l.qtyOrdered * Number(l.unitPrice);
    existing.cogsNzd += l.qtyOrdered * Number(l.product.costNzd ?? 0);
    existing.orderCount.add(l.soId);
    map.set(c.id, existing);
  }

  return [...map.values()]
    .map((v) => ({
      customerId: v.customerId,
      customerName: v.customerName,
      salesNzd: v.salesNzd,
      cogsNzd: v.cogsNzd,
      grossMarginNzd: v.salesNzd - v.cogsNzd,
      grossMarginPct: v.salesNzd > 0 ? ((v.salesNzd - v.cogsNzd) / v.salesNzd) * 100 : 0,
      orderCount: v.orderCount.size,
    }))
    .sort((a, b) => b.salesNzd - a.salesNzd);
}

/** Sales by rep for a fiscal year (Report 16) */
export async function getSalesByRep(tenantId: string, fiscalYear: number) {
  const { start } = fiscalPeriodToDates(fiscalYear, 1);
  const { end } = fiscalPeriodToDates(fiscalYear, 12);

  const lines = await prisma.salesOrderLine.findMany({
    where: {
      salesOrder: { tenantId, status: "SHIPPED", shippedDate: { gte: start, lte: end } },
    },
    include: {
      product: { select: { costNzd: true } },
      salesOrder: {
        include: {
          customer: {
            include: { salesRep: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });

  const map = new Map<string, { repId: string; repName: string; salesNzd: number; cogsNzd: number; customerCount: Set<string>; orderCount: Set<string> }>();
  for (const l of lines) {
    const rep = l.salesOrder.customer.salesRep;
    const key = rep?.id ?? "__none__";
    const label = rep?.name ?? rep?.email ?? "Unassigned";
    const existing = map.get(key) ?? { repId: key, repName: label, salesNzd: 0, cogsNzd: 0, customerCount: new Set(), orderCount: new Set() };
    existing.salesNzd += l.qtyOrdered * Number(l.unitPrice);
    existing.cogsNzd += l.qtyOrdered * Number(l.product.costNzd ?? 0);
    existing.customerCount.add(l.salesOrder.customerId);
    existing.orderCount.add(l.soId);
    map.set(key, existing);
  }

  return [...map.values()]
    .map((v) => ({
      repId: v.repId,
      repName: v.repName,
      salesNzd: v.salesNzd,
      cogsNzd: v.cogsNzd,
      grossMarginNzd: v.salesNzd - v.cogsNzd,
      grossMarginPct: v.salesNzd > 0 ? ((v.salesNzd - v.cogsNzd) / v.salesNzd) * 100 : 0,
      customerCount: v.customerCount.size,
      orderCount: v.orderCount.size,
    }))
    .sort((a, b) => b.salesNzd - a.salesNzd);
}
