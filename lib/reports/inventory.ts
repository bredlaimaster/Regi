/**
 * Inventory report primitives.
 */

import { prisma } from "@/lib/prisma";
import { toFiscalPeriod, fiscalPeriodToDates } from "./margin";

export interface SohRow {
  productId: string;
  sku: string;
  name: string;
  brandName: string | null;
  active: boolean;
  isTester: boolean;
  qty: number;
  costNzd: number;
  valueNzd: number;
  sellPriceNzd: number;
  retailValueNzd: number;
  reorderPoint: number;
  belowReorder: boolean;
}

/** Report 11 — Stock on Hand */
export async function getStockOnHand(tenantId: string): Promise<SohRow[]> {
  const products = await prisma.product.findMany({
    where: { tenantId, active: true },
    include: {
      brand: { select: { name: true } },
      stockLevel: true,
    },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  });

  return products.map((p) => {
    const qty = p.stockLevel?.qty ?? 0;
    const costNzd = Number(p.costNzd ?? 0);
    const sellPriceNzd = Number(p.sellPriceNzd);
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      brandName: p.brand?.name ?? null,
      active: p.active,
      isTester: p.isTester,
      qty,
      costNzd,
      valueNzd: qty * costNzd,
      sellPriceNzd,
      retailValueNzd: qty * sellPriceNzd,
      reorderPoint: p.reorderPoint,
      belowReorder: qty <= p.reorderPoint,
    };
  });
}

/** Report 4 — Tester inventory (active testers and their stock levels) */
export async function getTesterStock(tenantId: string) {
  const products = await prisma.product.findMany({
    where: { tenantId, isTester: true },
    include: {
      brand: { select: { name: true } },
      stockLevel: true,
    },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  });

  return products.map((p) => ({
    productId: p.id,
    sku: p.sku,
    name: p.name,
    brandName: p.brand?.name ?? null,
    qty: p.stockLevel?.qty ?? 0,
    costNzd: Number(p.costNzd ?? 0),
    valueNzd: (p.stockLevel?.qty ?? 0) * Number(p.costNzd ?? 0),
  }));
}

// ─── Report 5 — Stock turn ─────────────────────────────────────────────────────

export interface StockTurnRow {
  productId: string;
  sku: string;
  name: string;
  brandName: string | null;
  qtyOnHand: number;
  qtySoldFy: number;
  avgMonthlyUsage: number;
  stockTurnRatio: number;
  weeksOfStock: number;
  costNzd: number;
  valueOnHand: number;
}

export async function getStockTurn(tenantId: string, fiscalYear: number): Promise<StockTurnRow[]> {
  const { start } = fiscalPeriodToDates(fiscalYear, 1);
  const { end } = fiscalPeriodToDates(fiscalYear, 12);
  const now = new Date();
  const periodsElapsed = Math.max(1, toFiscalPeriod(now).period);

  const products = await prisma.product.findMany({
    where: { tenantId, active: true },
    include: {
      brand: { select: { name: true } },
      stockLevel: true,
    },
  });

  const soldMap = new Map<string, number>();
  const lines = await prisma.salesOrderLine.findMany({
    where: {
      salesOrder: { tenantId, status: "SHIPPED", shippedDate: { gte: start, lte: end } },
    },
    select: { productId: true, qtyOrdered: true },
  });
  for (const l of lines) {
    soldMap.set(l.productId, (soldMap.get(l.productId) ?? 0) + l.qtyOrdered);
  }

  return products
    .map((p) => {
      const qtyOnHand = p.stockLevel?.qty ?? 0;
      const qtySoldFy = soldMap.get(p.id) ?? 0;
      const avgMonthlyUsage = qtySoldFy / periodsElapsed;
      const costNzd = Number(p.costNzd ?? 0);
      const avgInventory = qtyOnHand > 0 ? qtyOnHand : 1;
      const stockTurnRatio = qtySoldFy > 0 ? qtySoldFy / avgInventory : 0;
      const weeksOfStock = avgMonthlyUsage > 0 ? (qtyOnHand / avgMonthlyUsage) * 4.33 : 999;

      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brandName: p.brand?.name ?? null,
        qtyOnHand,
        qtySoldFy,
        avgMonthlyUsage: Math.round(avgMonthlyUsage * 10) / 10,
        stockTurnRatio: Math.round(stockTurnRatio * 10) / 10,
        weeksOfStock: Math.round(weeksOfStock * 10) / 10,
        costNzd,
        valueOnHand: qtyOnHand * costNzd,
      };
    })
    .sort((a, b) => b.valueOnHand - a.valueOnHand);
}

// ─── Report 13 — Overstock & slow movers ─────────────────────────────────────

export async function getOverstock(tenantId: string, fiscalYear: number, slowMoverWeeks = 26) {
  const rows = await getStockTurn(tenantId, fiscalYear);
  return rows.filter((r) => r.weeksOfStock > slowMoverWeeks || (r.qtyOnHand > 0 && r.qtySoldFy === 0));
}

// ─── Report 17 — Expiry tracker ───────────────────────────────────────────────

export type ExpiryRag = "RED" | "AMBER" | "GREEN";

export interface ExpiryRow {
  batchId: string;
  productId: string;
  sku: string;
  name: string;
  brandName: string | null;
  batchCode: string | null;
  expiryDate: Date | null;
  qtyOnHand: number;
  daysToExpiry: number | null;
  rag: ExpiryRag;
  valueNzd: number;
}

export async function getExpiryTracker(tenantId: string): Promise<ExpiryRow[]> {
  const batches = await prisma.batch.findMany({
    where: { tenantId, qtyOnHand: { gt: 0 } },
    include: {
      product: {
        include: { brand: { select: { name: true } } },
      },
    },
    orderBy: { expiryDate: "asc" },
  });

  const now = new Date();

  return batches.map((b) => {
    const daysToExpiry = b.expiryDate
      ? Math.round((b.expiryDate.getTime() - now.getTime()) / 86_400_000)
      : null;

    let rag: ExpiryRag = "GREEN";
    if (daysToExpiry !== null) {
      if (daysToExpiry <= 60) rag = "RED";
      else if (daysToExpiry <= 180) rag = "AMBER";
    }

    return {
      batchId: b.id,
      productId: b.productId,
      sku: b.product.sku,
      name: b.product.name,
      brandName: b.product.brand?.name ?? null,
      batchCode: b.batchCode,
      expiryDate: b.expiryDate,
      qtyOnHand: b.qtyOnHand,
      daysToExpiry,
      rag,
      valueNzd: b.qtyOnHand * Number(b.costNzd ?? 0),
    };
  });
}
