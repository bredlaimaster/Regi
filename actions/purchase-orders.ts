"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";
import { applyStockMovement } from "@/lib/inventory";
import { formatDocNumber } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";
import { enqueueQboSync } from "@/lib/quickbooks/sync";

const LineSchema = z.object({
  productId: z.string(),
  qtyOrdered: z.coerce.number().int().positive(),
  unitCostNzd: z.coerce.number().nonnegative(),
});

const PoSchema = z.object({
  id: z.string().optional(),
  supplierId: z.string(),
  expectedDate: z.string().optional().nullable(),
  freightNzd: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(LineSchema).min(1),
});

export async function upsertPurchaseOrder(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = PoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid PO" };
  const { id, supplierId, expectedDate, freightNzd, notes, lines } = parsed.data;

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return { ok: false, error: "Supplier not found" };
  assertTenant(supplier.tenantId, session.tenantId);

  const total = lines.reduce((s, l) => s + l.qtyOrdered * l.unitCostNzd, 0) + Number(freightNzd ?? 0);

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
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          freightNzd: freightNzd ?? null,
          notes,
          totalCostNzd: total,
          lines: { create: lines },
        },
      });
    } else {
      const count = await tx.purchaseOrder.count({ where: { tenantId: session.tenantId } });
      return tx.purchaseOrder.create({
        data: {
          poNumber: formatDocNumber("PO", count),
          supplierId,
          tenantId: session.tenantId,
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          freightNzd: freightNzd ?? null,
          notes,
          totalCostNzd: total,
          lines: { create: lines },
        },
      });
    }
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
 * Receive a PO: create stock movements for each line (with landed cost allocated
 * pro-rata from freight), mark PO RECEIVED, enqueue a QBO Bill sync job.
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

  const freight = Number(po.freightNzd ?? 0);
  const subtotal = po.lines.reduce((s, l) => s + l.qtyOrdered * Number(l.unitCostNzd), 0);

  await prisma.$transaction(async (tx) => {
    for (const line of po.lines) {
      const lineSubtotal = line.qtyOrdered * Number(line.unitCostNzd);
      const freightAlloc = subtotal > 0 ? (lineSubtotal / subtotal) * freight : 0;
      const landedUnit = Number(line.unitCostNzd) + freightAlloc / line.qtyOrdered;
      await applyStockMovement(tx, {
        tenantId: session.tenantId,
        productId: line.productId,
        qtyChange: line.qtyOrdered,
        type: "PO_RECEIPT",
        referenceId: po.id,
        notes: `PO ${po.poNumber} @ landed ${landedUnit.toFixed(4)}`,
        userId: session.userId,
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
