"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";
import { applyStockMovement } from "@/lib/inventory";
import { formatDocNumber } from "@/lib/utils";
import { enqueueQboSync } from "@/lib/quickbooks/sync";
import type { ActionResult } from "@/lib/types";
import { AUTO_REBATE_PCT } from "@/lib/constants";

const LineSchema = z.object({
  productId: z.string(),
  qtyOrdered: z.coerce.number().int().positive(),
});

const SoSchema = z.object({
  id: z.string().optional(),
  customerId: z.string(),
  notes: z.string().optional().nullable(),
  lines: z.array(LineSchema).min(1),
});

export async function upsertSalesOrder(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = SoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid SO" };
  const { id, customerId, notes, lines } = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Customer not found" };
  assertTenant(customer.tenantId, session.tenantId);

  // Snapshot sell prices from product catalogue, applying the customer's price
  // group where available. Resolution: (productId, priceGroupId) with the
  // largest minQty <= ordered qty wins; otherwise fall back to product.sellPriceNzd.
  const productIds = lines.map((l) => l.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sellPriceNzd: true },
  });
  const basePriceMap = new Map(products.map((p) => [p.id, Number(p.sellPriceNzd)]));

  const groupPriceMap = new Map<string, { unitPrice: number; minQty: number }[]>();
  if (customer.priceGroupId) {
    const groupPrices = await prisma.productPrice.findMany({
      where: { productId: { in: productIds }, priceGroupId: customer.priceGroupId },
      orderBy: { minQty: "desc" },
    });
    for (const gp of groupPrices) {
      const existing = groupPriceMap.get(gp.productId) ?? [];
      existing.push({ unitPrice: Number(gp.unitPrice), minQty: gp.minQty });
      groupPriceMap.set(gp.productId, existing);
    }
  }

  const linesWithPrice = lines.map((l) => {
    const basePrice = basePriceMap.get(l.productId) ?? 0;
    // Pick the group price with the largest minQty <= ordered qty (desc sorted).
    const groupRows = groupPriceMap.get(l.productId);
    const groupPrice = groupRows?.find((gp) => l.qtyOrdered >= gp.minQty);
    return {
      ...l,
      unitPrice: groupPrice?.unitPrice ?? basePrice,
    };
  });

  const so = await prisma.$transaction(async (tx) => {
    if (id) {
      const existing = await tx.salesOrder.findUnique({ where: { id } });
      if (!existing) throw new Error("Not found");
      assertTenant(existing.tenantId, session.tenantId);
      if (existing.status !== "DRAFT") throw new Error("Only DRAFT SOs can be edited");
      await tx.salesOrderLine.deleteMany({ where: { soId: id } });
      return tx.salesOrder.update({
        where: { id },
        data: { customerId, notes, lines: { create: linesWithPrice } },
      });
    }
    const count = await tx.salesOrder.count({ where: { tenantId: session.tenantId } });
    return tx.salesOrder.create({
      data: {
        soNumber: formatDocNumber("SO", count),
        customerId,
        tenantId: session.tenantId,
        notes,
        lines: { create: linesWithPrice },
      },
    });
  });

  revalidatePath("/sales-orders");
  return { ok: true, data: { id: so.id } };
}

export async function setSoStatus(
  id: string,
  next: "CONFIRMED" | "PICKED" | "CANCELLED"
): Promise<ActionResult> {
  const session = await requireSession();
  const so = await prisma.salesOrder.findUnique({
    where: { id },
    include: { lines: true, customer: true },
  });
  if (!so) return { ok: false, error: "Not found" };
  assertTenant(so.tenantId, session.tenantId);

  // Legal transitions
  const allowed: Record<string, string[]> = {
    DRAFT: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PICKED", "CANCELLED"],
    PICKED: [],
    SHIPPED: [],
    CANCELLED: [],
  };
  if (!allowed[so.status].includes(next)) return { ok: false, error: `Cannot go ${so.status}→${next}` };

  // Credit limit check on confirmation
  if (next === "CONFIRMED" && so.customer.creditLimit) {
    const limit = Number(so.customer.creditLimit);
    // Sum outstanding (CONFIRMED + PICKED + SHIPPED-unpaid) SOs for this customer
    const outstandingSOs = await prisma.salesOrder.findMany({
      where: {
        customerId: so.customerId,
        status: { in: ["CONFIRMED", "PICKED", "SHIPPED"] },
        id: { not: so.id },
      },
      include: { lines: true },
    });
    const outstanding = outstandingSOs.reduce((total, o) =>
      total + o.lines.reduce((s, l) => s + Number(l.unitPrice) * l.qtyOrdered, 0), 0);
    const thisOrderTotal = so.lines.reduce((s, l) => s + Number(l.unitPrice) * l.qtyOrdered, 0);
    const newTotal = outstanding + thisOrderTotal;
    if (newTotal > limit) {
      const fmt = (n: number) => `$${n.toFixed(2)}`;
      return {
        ok: false,
        error: `Credit limit exceeded — limit ${fmt(limit)}, outstanding ${fmt(outstanding)}, this order ${fmt(thisOrderTotal)} (total ${fmt(newTotal)})`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    if (next === "PICKED") {
      // Decrement stock on pick (immutable transaction log).
      for (const line of so.lines) {
        await applyStockMovement(tx, {
          tenantId: session.tenantId,
          productId: line.productId,
          qtyChange: -line.qtyOrdered,
          type: "SO_PICK",
          referenceId: so.id,
          notes: `SO ${so.soNumber}`,
          userId: session.userId,
        });
      }
    }
    await tx.salesOrder.update({ where: { id }, data: { status: next } });
  });

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${id}`);
  revalidatePath("/inventory");
  return { ok: true, data: null };
}

const ShipSchema = z.object({ id: z.string(), trackingRef: z.string().min(1) });

export async function shipSalesOrder(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = ShipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Tracking reference required" };
  const so = await prisma.salesOrder.findUnique({
    where: { id: parsed.data.id },
    include: { lines: { include: { product: { select: { sellPriceNzd: true } } } }, customer: true },
  });
  if (!so) return { ok: false, error: "Not found" };
  assertTenant(so.tenantId, session.tenantId);
  if (so.status !== "PICKED") return { ok: false, error: "SO must be PICKED" };

  const orderDiscount = Number(so.discountPct ?? 0);
  let subtotal = 0;
  for (const line of so.lines) {
    const linePrice = Number(line.unitPrice) || Number(line.product.sellPriceNzd);
    const lineDiscount = Math.max(Number(line.discountPct ?? 0), orderDiscount);
    subtotal += line.qtyOrdered * linePrice * (1 - lineDiscount / 100);
  }

  await prisma.$transaction(async (tx) => {
    await tx.salesOrder.update({
      where: { id: so.id },
      data: { status: "SHIPPED", shippedDate: new Date(), trackingRef: parsed.data.trackingRef },
    });

    // Auto 2.5% rebate credit note on qualifying shipments (subtotal > 0)
    if (subtotal > 0) {
      const cnCount = await tx.creditNote.count({ where: { tenantId: session.tenantId } });
      await tx.creditNote.create({
        data: {
          tenantId: session.tenantId,
          cnNumber: formatDocNumber("CN", cnCount),
          soId: so.id,
          customerId: so.customerId,
          amountNzd: Math.round(subtotal * AUTO_REBATE_PCT * 100) / 100,
          reason: "AUTO_REBATE",
          notes: `${(AUTO_REBATE_PCT * 100).toFixed(1)}% auto-rebate on SO ${so.soNumber}`,
        },
      });
    }
  });

  await enqueueQboSync({
    tenantId: session.tenantId,
    entityType: "INVOICE",
    entityId: so.id,
  });

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${so.id}`);
  return { ok: true, data: null };
}

const PartialPickSchema = z.object({
  soId: z.string(),
  lines: z.array(z.object({
    lineId: z.string(),
    qtyPicking: z.coerce.number().int().min(1),
  })).min(1),
});

export async function partialPickSalesOrder(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = PartialPickSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid pick data" };
  const { soId, lines } = parsed.data;

  const so = await prisma.salesOrder.findUnique({
    where: { id: soId },
    include: { lines: true },
  });
  if (!so) return { ok: false, error: "Not found" };
  assertTenant(so.tenantId, session.tenantId);
  if (so.status !== "CONFIRMED") return { ok: false, error: "SO must be CONFIRMED to pick" };

  // Validate qtys don't exceed outstanding per line
  for (const pick of lines) {
    const soLine = so.lines.find((l) => l.id === pick.lineId);
    if (!soLine) return { ok: false, error: `Line ${pick.lineId} not found` };
    const outstanding = soLine.qtyOrdered - soLine.qtyPicked;
    if (pick.qtyPicking > outstanding) {
      return { ok: false, error: `Cannot pick ${pick.qtyPicking} — only ${outstanding} outstanding` };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const pick of lines) {
      await tx.salesOrderLine.update({
        where: { id: pick.lineId },
        data: { qtyPicked: { increment: pick.qtyPicking } },
      });
    }

    // Check if all lines are now fully picked — if so, advance to PICKED
    const updatedLines = await tx.salesOrderLine.findMany({ where: { soId } });
    const allPicked = updatedLines.every((l) => l.qtyPicked >= l.qtyOrdered);
    if (allPicked) {
      for (const line of updatedLines) {
        await applyStockMovement(tx, {
          tenantId: session.tenantId,
          productId: line.productId,
          qtyChange: -line.qtyOrdered,
          type: "SO_PICK",
          referenceId: soId,
          notes: `SO ${so.soNumber}`,
          userId: session.userId,
        });
      }
      await tx.salesOrder.update({ where: { id: soId }, data: { status: "PICKED" } });
    }
  });

  revalidatePath(`/sales-orders/${soId}`);
  revalidatePath("/sales-orders");
  revalidatePath("/inventory");
  return { ok: true, data: null };
}
