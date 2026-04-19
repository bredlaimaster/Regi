"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";
import { applyStockMovement } from "@/lib/inventory";
import { formatDocNumber } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";
import { enqueueQboSync } from "@/lib/quickbooks/sync";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { getLatestRate } from "@/lib/fx";

const LineSchema = z.object({
  productId: z.string(),
  qtyOrdered: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().nonnegative(),
});

const PoSchema = z.object({
  id: z.string().optional(),
  supplierId: z.string(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  expectedDate: z.string().optional().nullable(),
  freight: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(LineSchema).min(1),
});

export async function upsertPurchaseOrder(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = PoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid PO" };
  const { id, supplierId, currency, expectedDate, freight, notes, lines } = parsed.data;

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return { ok: false, error: "Supplier not found" };
  assertTenant(supplier.tenantId, session.tenantId);

  // Snapshot the exchange rate at PO creation/edit time so downstream
  // conversions (landed cost, QBO bill) use a stable figure.
  const { nzdPerUnit: fxRate, date: fxRateDate } = await getLatestRate(currency);

  const subtotal = lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0);
  const freightAmt = Number(freight ?? 0);
  const totalSrc = subtotal + freightAmt;
  const totalNzd = Math.round(totalSrc * fxRate * 100) / 100;
  const freightNzd = Math.round(freightAmt * fxRate * 100) / 100;

  const po = await prisma.$transaction(async (tx) => {
    if (id) {
      const existing = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!existing) throw new Error("PO not found");
      assertTenant(existing.tenantId, session.tenantId);
      if (existing.status !== "DRAFT") throw new Error("Only DRAFT POs can be edited");
      await tx.purchaseOrderLine.deleteMany({ where: { poId: id } });
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId,
          currency,
          fxRate,
          fxRateDate,
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          freight: freight ?? null,
          freightNzd: freight != null ? freightNzd : null,
          notes,
          totalCost: totalSrc,
          totalCostNzd: totalNzd,
          lines: { create: lines },
        },
      });
    }
    const count = await tx.purchaseOrder.count({ where: { tenantId: session.tenantId } });
    return tx.purchaseOrder.create({
      data: {
        poNumber: formatDocNumber("PO", count),
        supplierId,
        tenantId: session.tenantId,
        currency,
        fxRate,
        fxRateDate,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        freight: freight ?? null,
        freightNzd: freight != null ? freightNzd : null,
        notes,
        totalCost: totalSrc,
        totalCostNzd: totalNzd,
        lines: { create: lines },
      },
    });
  });

  revalidatePath("/purchase-orders");
  return { ok: true, data: { id: po.id } };
}

export async function setPoStatus(id: string, status: "ORDERED" | "CANCELLED"): Promise<ActionResult> {
  const session = await requireSession();
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) return { ok: false, error: "Not found" };
  assertTenant(po.tenantId, session.tenantId);
  if (po.status !== "DRAFT") return { ok: false, error: "Only DRAFT can change" };
  await prisma.purchaseOrder.update({ where: { id }, data: { status } });
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  return { ok: true, data: null };
}

/**
 * Receive a PO: create stock movements for each line with landed cost
 * allocated pro-rata from freight. All amounts are converted to NZD using
 * the exchange rate snapshotted on the PO at creation time. PO is marked
 * RECEIVED and a QBO Bill sync job is enqueued.
 */
export async function receivePurchaseOrder(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!po) return { ok: false, error: "Not found" };
  assertTenant(po.tenantId, session.tenantId);
  if (po.status !== "ORDERED") return { ok: false, error: "PO must be ORDERED" };

  const fxRate = Number(po.fxRate);
  const freight = Number(po.freight ?? 0);
  const subtotal = po.lines.reduce((s, l) => s + l.qtyOrdered * Number(l.unitCost), 0);

  await prisma.$transaction(async (tx) => {
    for (const line of po.lines) {
      const lineSubtotal = line.qtyOrdered * Number(line.unitCost);
      const freightAlloc = subtotal > 0 ? (lineSubtotal / subtotal) * freight : 0;
      const landedUnitSrc = Number(line.unitCost) + freightAlloc / line.qtyOrdered;
      const landedUnitNzd = landedUnitSrc * fxRate;

      // Read existing qty & cost BEFORE the stock movement so weighted average is correct
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { costNzd: true, stockLevel: { select: { qty: true } } },
      });
      const existingQty = Math.max(0, product?.stockLevel?.qty ?? 0);
      const currentCost = Number(product?.costNzd ?? landedUnitNzd);

      await applyStockMovement(tx, {
        tenantId: session.tenantId,
        productId: line.productId,
        qtyChange: line.qtyOrdered,
        type: "PO_RECEIPT",
        referenceId: po.id,
        notes: `PO ${po.poNumber} @ landed ${po.currency} ${landedUnitSrc.toFixed(4)} (NZD ${landedUnitNzd.toFixed(4)})`,
        userId: session.userId,
      });

      // Update rolling average landed cost on the product
      {
        const newTotalQty = existingQty + line.qtyOrdered;
        const newAvgCost = newTotalQty > 0
          ? (currentCost * existingQty + landedUnitNzd * line.qtyOrdered) / newTotalQty
          : landedUnitNzd;
        await tx.product.update({
          where: { id: line.productId },
          data: { costNzd: Math.round(newAvgCost * 10000) / 10000 },
        });
      }

      // Create batch record for lot/expiry tracking
      await tx.batch.create({
        data: {
          tenantId: session.tenantId,
          productId: line.productId,
          supplierId: po.supplierId,
          poId: po.id,
          qtyReceived: line.qtyOrdered,
          qtyOnHand: line.qtyOrdered,
          costNzd: Math.round(landedUnitNzd * 10000) / 10000,
        },
      });

      // Mark qty received on the line
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { qtyReceived: line.qtyOrdered },
      });
    }
    await tx.purchaseOrder.update({ where: { id }, data: { status: "RECEIVED" } });
  });

  await enqueueQboSync({ tenantId: session.tenantId, entityType: "BILL", entityId: po.id });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/inventory");
  return { ok: true, data: null };
}

// ─── Partial PO receive ───────────────────────────────────────────────────────

const PartialReceiveLineSchema = z.object({
  lineId: z.string(),
  productId: z.string(),
  qtyReceiving: z.coerce.number().int().positive(),
  batchCode: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(), // ISO date string or null
});

const ReceiveChargeSchema = z.object({
  label: z.string().min(1),
  amount: z.coerce.number().nonnegative(),
  currency: z.string().default("NZD"),
  taxRate: z.coerce.number().nonnegative().default(0), // 0 or 15
  invoiceRef: z.string().nullable().optional(),
});

const PartialReceiveSchema = z.object({
  poId: z.string(),
  lines: z.array(PartialReceiveLineSchema).min(1),
  freightOverride: z.coerce.number().nonnegative().nullable().optional(),
  charges: z.array(ReceiveChargeSchema).optional(),
});

export async function partialReceivePurchaseOrder(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = PartialReceiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { poId, lines: receiveLines, freightOverride, charges } = parsed.data;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { lines: true },
  });
  if (!po) return { ok: false, error: "PO not found" };
  assertTenant(po.tenantId, session.tenantId);
  if (po.status !== "ORDERED") return { ok: false, error: "PO must be ORDERED" };

  const poFxRate = Number(po.fxRate);
  // Use freight override from receive form if provided, else fall back to PO header
  const freight = freightOverride != null ? freightOverride : Number(po.freight ?? 0);

  // Convert each charge to NZD using its own currency's FX rate
  const chargeRates: Record<string, number> = {};
  for (const c of charges ?? []) {
    if (!chargeRates[c.currency]) {
      if (c.currency === "NZD") {
        chargeRates[c.currency] = 1;
      } else if (c.currency === po.currency) {
        chargeRates[c.currency] = poFxRate;
      } else {
        const { nzdPerUnit } = await getLatestRate(c.currency as any);
        chargeRates[c.currency] = nzdPerUnit;
      }
    }
  }

  // Total charges in NZD for pro-rata allocation
  const freightNzd = Math.round(freight * poFxRate * 100) / 100;
  const extraChargesNzd = (charges ?? []).reduce((s, c) => {
    const rate = chargeRates[c.currency] ?? 1;
    return s + Math.round(c.amount * rate * 100) / 100;
  }, 0);
  const totalChargesNzd = freightNzd + extraChargesNzd;

  const subtotal = po.lines.reduce((s, l) => s + l.qtyOrdered * Number(l.unitCost), 0);
  const subtotalNzd = Math.round(subtotal * poFxRate * 100) / 100;

  // Convert extra charges back to source currency for totalCost display
  const extraChargesSrc = (charges ?? []).reduce((s, c) => {
    const rate = chargeRates[c.currency] ?? 1;
    // Convert charge from its currency → NZD → PO source currency
    const amtNzd = c.amount * rate;
    const amtSrc = poFxRate > 0 ? amtNzd / poFxRate : amtNzd;
    return s + Math.round(amtSrc * 100) / 100;
  }, 0);

  // Always update PO total to include freight + all custom charges
  {
    const updatedFreight = freightOverride != null ? freightOverride : Number(po.freight ?? 0);
    const updatedFreightNzd = Math.round(updatedFreight * poFxRate * 100) / 100;
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        ...(freightOverride != null ? { freight: freightOverride, freightNzd: updatedFreightNzd } : {}),
        totalCost: subtotal + updatedFreight + extraChargesSrc,
        totalCostNzd: subtotalNzd + updatedFreightNzd + extraChargesNzd,
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    // Store custom charges with their own currency/fx/tax info
    if (charges && charges.length > 0) {
      await tx.poReceiveCharge.createMany({
        data: charges.map((c) => {
          const rate = chargeRates[c.currency] ?? 1;
          const amtNzd = Math.round(c.amount * rate * 100) / 100;
          const taxAmtNzd = Math.round(amtNzd * (c.taxRate / 100) * 100) / 100;
          return {
            poId,
            label: c.label,
            amount: c.amount,
            currency: c.currency,
            fxRate: rate,
            amountNzd: amtNzd,
            taxRate: c.taxRate,
            taxAmountNzd: taxAmtNzd,
            invoiceRef: c.invoiceRef ?? null,
          };
        }),
      });
    }

    for (const rl of receiveLines) {
      const poLine = po.lines.find((l) => l.id === rl.lineId);
      if (!poLine) continue;

      const outstanding = poLine.qtyOrdered - poLine.qtyReceived;
      const qtyReceiving = Math.min(rl.qtyReceiving, outstanding);
      if (qtyReceiving <= 0) continue;

      const lineSubtotal = qtyReceiving * Number(poLine.unitCost);
      // Pro-rata allocation of all charges (already converted to NZD)
      const chargeAllocNzd = subtotal > 0 ? (lineSubtotal / subtotal) * totalChargesNzd : 0;
      const lineUnitNzd = Number(poLine.unitCost) * poFxRate;
      const landedUnitNzd = lineUnitNzd + chargeAllocNzd / qtyReceiving;

      // Read existing qty & cost BEFORE the stock movement so weighted average is correct
      const product = await tx.product.findUnique({
        where: { id: rl.productId },
        select: { costNzd: true, stockLevel: { select: { qty: true } } },
      });
      const existingQty = Math.max(0, product?.stockLevel?.qty ?? 0);
      const currentCost = Number(product?.costNzd ?? landedUnitNzd);

      await applyStockMovement(tx, {
        tenantId: session.tenantId,
        productId: rl.productId,
        qtyChange: qtyReceiving,
        type: "PO_RECEIPT",
        referenceId: po.id,
        notes: `PO ${po.poNumber} partial @ NZD ${landedUnitNzd.toFixed(4)}/ea`,
        userId: session.userId,
      });

      // Rolling average cost update
      {
        const newTotalQty = existingQty + qtyReceiving;
        const newAvgCost = newTotalQty > 0
          ? (currentCost * existingQty + landedUnitNzd * qtyReceiving) / newTotalQty
          : landedUnitNzd;
        await tx.product.update({
          where: { id: rl.productId },
          data: { costNzd: Math.round(newAvgCost * 10000) / 10000 },
        });
      }

      // Batch record with optional batch code + expiry
      await tx.batch.create({
        data: {
          tenantId: session.tenantId,
          productId: rl.productId,
          supplierId: po.supplierId,
          poId: po.id,
          batchCode: rl.batchCode ?? null,
          expiryDate: rl.expiryDate ? new Date(rl.expiryDate) : null,
          qtyReceived: qtyReceiving,
          qtyOnHand: qtyReceiving,
          costNzd: Math.round(landedUnitNzd * 10000) / 10000,
        },
      });

      // Update line qtyReceived
      await tx.purchaseOrderLine.update({
        where: { id: rl.lineId },
        data: { qtyReceived: poLine.qtyReceived + qtyReceiving },
      });
    }

    // Check if all lines are now fully received → auto-close
    const updatedLines = await tx.purchaseOrderLine.findMany({ where: { poId } });
    const allReceived = updatedLines.every((l) => l.qtyReceived >= l.qtyOrdered);
    if (allReceived) {
      await tx.purchaseOrder.update({ where: { id: poId }, data: { status: "RECEIVED" } });
    }
  });

  await enqueueQboSync({ tenantId: session.tenantId, entityType: "BILL", entityId: po.id });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/inventory");
  return { ok: true, data: null };
}
