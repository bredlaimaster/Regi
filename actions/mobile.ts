"use server";
/**
 * Server actions for the mobile app.
 *
 * Design goals:
 *  - Reuse the existing web-app server actions (`partialPickSalesOrder`,
 *    `partialReceivePurchaseOrder`, `adjustStock`) for all *writes*. This file
 *    only adds *reads* tailored to a phone: small payloads, bin-sorted, and
 *    a barcode resolver.
 *  - Every query is tenant-scoped via `requireSession().tenantId`.
 *  - Zero schema changes beyond two indexes on Product (added in schema.prisma).
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { sortLinesByBin } from "@/lib/mobile/sort-by-bin";
import type { ActionResult } from "@/lib/types";

// ─── Barcode resolver ────────────────────────────────────────────────────────

const BarcodeSchema = z.object({
  code: z.string().trim().min(1, "Empty barcode"),
});

export type ResolvedBarcode = {
  productId: string;
  sku: string;
  name: string;
  binLocation: string | null;
  caseQty: number;
  /** Which field the code matched — lets the caller decide unit vs case qty. */
  matched: "unit" | "case";
  stockQty: number;
};

/**
 * Resolve a scanned code to a product. Tries `unitBarcode` first, then
 * `caseBarcode`. Returns ok:false if no match (so the UI can show a toast).
 */
export async function resolveBarcode(input: unknown): Promise<ActionResult<ResolvedBarcode>> {
  const session = await requireSession();
  const parsed = BarcodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Empty barcode" };
  const { code } = parsed.data;

  const product = await prisma.product.findFirst({
    where: {
      tenantId: session.tenantId,
      active: true,
      OR: [{ unitBarcode: code }, { caseBarcode: code }],
    },
    include: { stockLevel: true },
  });
  if (!product) return { ok: false, error: `No product for barcode ${code}` };

  return {
    ok: true,
    data: {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      binLocation: product.binLocation,
      caseQty: product.caseQty,
      matched: product.unitBarcode === code ? "unit" : "case",
      stockQty: product.stockLevel?.qty ?? 0,
    },
  };
}

// ─── Pick list (sales orders) ────────────────────────────────────────────────

export type PickableSo = {
  id: string;
  soNumber: string;
  customerName: string;
  orderDate: string;
  linesOutstanding: number;
};

/** All CONFIRMED sales orders with at least one line still to pick. */
export async function pickableSalesOrders(): Promise<ActionResult<PickableSo[]>> {
  const session = await requireSession();
  const rows = await prisma.salesOrder.findMany({
    where: { tenantId: session.tenantId, status: "CONFIRMED" },
    include: { customer: { select: { name: true } }, lines: true },
    orderBy: { orderDate: "asc" },
  });
  const data: PickableSo[] = rows
    .map((so) => {
      const linesOutstanding = so.lines.reduce(
        (n, l) => n + Math.max(0, l.qtyOrdered - l.qtyPicked),
        0,
      );
      return {
        id: so.id,
        soNumber: so.soNumber,
        customerName: so.customer.name,
        orderDate: so.orderDate.toISOString(),
        linesOutstanding,
      };
    })
    .filter((r) => r.linesOutstanding > 0);
  return { ok: true, data };
}

export type PickSheetLine = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  binLocation: string | null;
  unitBarcode: string | null;
  caseBarcode: string | null;
  caseQty: number;
  qtyOrdered: number;
  qtyPicked: number;
};

export type PickSheet = {
  id: string;
  soNumber: string;
  customerName: string;
  status: string;
  lines: PickSheetLine[];
};

const IdSchema = z.object({ id: z.string().min(1) });

/** Single SO with lines ordered by bin — this is the pick path. */
export async function getPickSheet(input: unknown): Promise<ActionResult<PickSheet>> {
  const session = await requireSession();
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id" };

  const so = await prisma.salesOrder.findUnique({
    where: { id: parsed.data.id },
    include: { customer: true, lines: { include: { product: true } } },
  });
  if (!so || so.tenantId !== session.tenantId) return { ok: false, error: "Not found" };

  const lines = so.lines.map((l) => ({
    id: l.id,
    productId: l.productId,
    sku: l.product.sku,
    name: l.product.name,
    binLocation: l.product.binLocation,
    unitBarcode: l.product.unitBarcode,
    caseBarcode: l.product.caseBarcode,
    caseQty: l.product.caseQty,
    qtyOrdered: l.qtyOrdered,
    qtyPicked: l.qtyPicked,
  }));

  return {
    ok: true,
    data: {
      id: so.id,
      soNumber: so.soNumber,
      customerName: so.customer.name,
      status: so.status,
      lines: sortLinesByBin(lines),
    },
  };
}

// ─── Receive list (purchase orders) ──────────────────────────────────────────

export type ReceivablePo = {
  id: string;
  poNumber: string;
  supplierName: string;
  orderDate: string;
  linesOutstanding: number;
};

/** All ORDERED POs with at least one line still to receive. */
export async function receivablePurchaseOrders(): Promise<ActionResult<ReceivablePo[]>> {
  const session = await requireSession();
  const rows = await prisma.purchaseOrder.findMany({
    where: { tenantId: session.tenantId, status: "ORDERED" },
    include: { supplier: { select: { name: true } }, lines: true },
    orderBy: { orderDate: "asc" },
  });
  const data: ReceivablePo[] = rows
    .map((po) => {
      const linesOutstanding = po.lines.reduce(
        (n, l) => n + Math.max(0, l.qtyOrdered - l.qtyReceived),
        0,
      );
      return {
        id: po.id,
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        orderDate: po.orderDate.toISOString(),
        linesOutstanding,
      };
    })
    .filter((r) => r.linesOutstanding > 0);
  return { ok: true, data };
}

export type ReceiveSheetLine = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  binLocation: string | null;
  unitBarcode: string | null;
  caseBarcode: string | null;
  caseQty: number;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: string;
};

export type ReceiveSheet = {
  id: string;
  poNumber: string;
  supplierName: string;
  status: string;
  currency: string;
  lines: ReceiveSheetLine[];
};

/** Single PO with lines ordered by bin (bin-sort is the putaway path). */
export async function getReceiveSheet(input: unknown): Promise<ActionResult<ReceiveSheet>> {
  const session = await requireSession();
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id" };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parsed.data.id },
    include: { supplier: true, lines: { include: { product: true } } },
  });
  if (!po || po.tenantId !== session.tenantId) return { ok: false, error: "Not found" };

  const lines = po.lines.map((l) => ({
    id: l.id,
    productId: l.productId,
    sku: l.product.sku,
    name: l.product.name,
    binLocation: l.product.binLocation,
    unitBarcode: l.product.unitBarcode,
    caseBarcode: l.product.caseBarcode,
    caseQty: l.product.caseQty,
    qtyOrdered: l.qtyOrdered,
    qtyReceived: l.qtyReceived,
    unitCost: l.unitCost.toString(),
  }));

  return {
    ok: true,
    data: {
      id: po.id,
      poNumber: po.poNumber,
      supplierName: po.supplier.name,
      status: po.status,
      currency: po.currency,
      lines: sortLinesByBin(lines),
    },
  };
}
