/**
 * Rolling-period trend primitives.
 *
 * "19-month rolling" = the 19 calendar months ending at (and including) the
 * current month. Each month is represented as { year, month, label }.
 *
 * Used by Reports 12 (channel trends) and 14 (customer rolling sales).
 */

import { prisma } from "@/lib/prisma";

// ─── Period helpers ────────────────────────────────────────────────────────────

export interface CalMonth {
  year: number;
  month: number; // 1–12
  label: string; // "Apr 2025"
  start: Date;
  end: Date;
}

/** Build n calendar months ending at (and including) a reference date. */
export function rollingMonths(n = 19, ref: Date = new Date()): CalMonth[] {
  const months: CalMonth[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const label = d.toLocaleString("en-NZ", { month: "short", year: "numeric" });
    months.push({ year, month, label, start, end });
  }
  return months;
}

// ─── Report 12 — Channel trends ───────────────────────────────────────────────

export interface ChannelTrendRow {
  channelId: string | null;
  channelName: string;
  months: { label: string; salesNzd: number; units: number }[];
  totalSalesNzd: number;
  totalUnits: number;
}

export async function getChannelTrends(tenantId: string, nMonths = 19): Promise<ChannelTrendRow[]> {
  const months = rollingMonths(nMonths);
  const start = months[0].start;
  const end = months[months.length - 1].end;

  const lines = await prisma.salesOrderLine.findMany({
    where: {
      salesOrder: {
        tenantId,
        status: "SHIPPED",
        shippedDate: { gte: start, lte: end },
      },
    },
    include: {
      salesOrder: {
        include: {
          customer: { include: { channel: true } },
        },
      },
    },
  });

  // channelId → month-label → {sales, units}
  const map = new Map<string, {
    channelId: string | null;
    channelName: string;
    byMonth: Map<string, { salesNzd: number; units: number }>;
  }>();

  for (const l of lines) {
    const ch = l.salesOrder.customer.channel;
    const key = ch?.id ?? "__none__";
    const label = ch?.name ?? "Unassigned";
    const shippedDate = l.salesOrder.shippedDate ?? l.salesOrder.createdAt;
    const monthLabel = new Date(shippedDate).toLocaleString("en-NZ", { month: "short", year: "numeric" });

    if (!map.has(key)) {
      map.set(key, { channelId: ch?.id ?? null, channelName: label, byMonth: new Map() });
    }
    const ch_ = map.get(key)!;
    const existing = ch_.byMonth.get(monthLabel) ?? { salesNzd: 0, units: 0 };
    existing.salesNzd += l.qtyOrdered * Number(l.unitPrice);
    existing.units += l.qtyOrdered;
    ch_.byMonth.set(monthLabel, existing);
  }

  return [...map.values()]
    .map((ch) => {
      const monthData = months.map((m) => ({
        label: m.label,
        ...(ch.byMonth.get(m.label) ?? { salesNzd: 0, units: 0 }),
      }));
      return {
        channelId: ch.channelId,
        channelName: ch.channelName,
        months: monthData,
        totalSalesNzd: monthData.reduce((s, r) => s + r.salesNzd, 0),
        totalUnits: monthData.reduce((s, r) => s + r.units, 0),
      };
    })
    .sort((a, b) => b.totalSalesNzd - a.totalSalesNzd);
}

// ─── Report 14 — Customer rolling trend ───────────────────────────────────────

export interface CustomerTrendRow {
  month: string;
  salesNzd: number;
  units: number;
  orderCount: number;
  grossMarginNzd: number;
}

export async function getCustomerRollingTrend(
  tenantId: string,
  customerId: string,
  nMonths = 19
): Promise<{ months: CalMonth[]; rows: CustomerTrendRow[]; customerName: string }> {
  const months = rollingMonths(nMonths);
  const start = months[0].start;
  const end = months[months.length - 1].end;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { months, rows: months.map((m) => ({ month: m.label, salesNzd: 0, units: 0, orderCount: 0, grossMarginNzd: 0 })), customerName: "Unknown" };

  const lines = await prisma.salesOrderLine.findMany({
    where: {
      salesOrder: {
        tenantId,
        customerId,
        status: "SHIPPED",
        shippedDate: { gte: start, lte: end },
      },
    },
    include: {
      product: { select: { costNzd: true } },
      salesOrder: { select: { id: true, shippedDate: true, createdAt: true } },
    },
  });

  // month-label → aggregates
  const byMonth = new Map<string, { salesNzd: number; units: number; orders: Set<string>; cogs: number }>();

  for (const l of lines) {
    const date = l.salesOrder.shippedDate ?? l.salesOrder.createdAt;
    const label = new Date(date).toLocaleString("en-NZ", { month: "short", year: "numeric" });
    const existing = byMonth.get(label) ?? { salesNzd: 0, units: 0, orders: new Set(), cogs: 0 };
    existing.salesNzd += l.qtyOrdered * Number(l.unitPrice);
    existing.units += l.qtyOrdered;
    existing.orders.add(l.salesOrder.id);
    existing.cogs += l.qtyOrdered * Number(l.product.costNzd ?? 0);
    byMonth.set(label, existing);
  }

  const rows: CustomerTrendRow[] = months.map((m) => {
    const d = byMonth.get(m.label) ?? { salesNzd: 0, units: 0, orders: new Set(), cogs: 0 };
    return {
      month: m.label,
      salesNzd: d.salesNzd,
      units: d.units,
      orderCount: d.orders.size,
      grossMarginNzd: d.salesNzd - d.cogs,
    };
  });

  return { months, rows, customerName: customer.name };
}

// ─── All-customers rolling summary (for list view) ────────────────────────────

export async function getAllCustomerRollingTrends(tenantId: string, nMonths = 19) {
  const months = rollingMonths(nMonths);
  const start = months[0].start;
  const end = months[months.length - 1].end;

  const lines = await prisma.salesOrderLine.findMany({
    where: {
      salesOrder: { tenantId, status: "SHIPPED", shippedDate: { gte: start, lte: end } },
    },
    include: {
      product: { select: { costNzd: true } },
      salesOrder: {
        select: {
          id: true,
          shippedDate: true,
          createdAt: true,
          customerId: true,
          customer: { select: { name: true } },
        },
      },
    },
  });

  const map = new Map<string, {
    customerId: string;
    customerName: string;
    byMonth: Map<string, { salesNzd: number; units: number; cogs: number; orders: Set<string> }>;
  }>();

  for (const l of lines) {
    const { customerId, customer, shippedDate, createdAt, id } = l.salesOrder;
    const date = shippedDate ?? createdAt;
    const label = new Date(date).toLocaleString("en-NZ", { month: "short", year: "numeric" });

    if (!map.has(customerId)) {
      map.set(customerId, { customerId, customerName: customer.name, byMonth: new Map() });
    }
    const cust = map.get(customerId)!;
    const existing = cust.byMonth.get(label) ?? { salesNzd: 0, units: 0, cogs: 0, orders: new Set() };
    existing.salesNzd += l.qtyOrdered * Number(l.unitPrice);
    existing.units += l.qtyOrdered;
    existing.cogs += l.qtyOrdered * Number(l.product.costNzd ?? 0);
    existing.orders.add(id);
    cust.byMonth.set(label, existing);
  }

  return [...map.values()].map((c) => {
    const monthData = months.map((m) => ({
      label: m.label,
      ...(c.byMonth.get(m.label) ?? { salesNzd: 0, units: 0, cogs: 0, orders: new Set() }),
    }));
    return {
      customerId: c.customerId,
      customerName: c.customerName,
      months: monthData,
      totalSalesNzd: monthData.reduce((s, r) => s + r.salesNzd, 0),
      totalUnits: monthData.reduce((s, r) => s + r.units, 0),
    };
  }).sort((a, b) => b.totalSalesNzd - a.totalSalesNzd);
}
