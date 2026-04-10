"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";
import { applyStockMovement } from "@/lib/inventory";
import { formatDocNumber } from "@/lib/utils";
import { enqueueQboSync } from "@/lib/quickbooks/sync";
import type { ActionResult } from "@/lib/types";

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

  const so = await prisma.$transaction(async (tx) => {
    if (id) {
      const existing = await tx.salesOrder.findUnique({ where: { id } });
      if (!existing) throw new Error("Not found");
      assertTenant(existing.tenantId, session.tenantId);
      if (existing.status !== "DRAFT") throw new Error("Only DRAFT SOs can be edited");
      await tx.salesOrderLine.deleteMany({ where: { soId: id } });
      return tx.salesOrder.update({
        where: { id },
        data: { customerId, notes, lines: { create: lines } },
      });
    }
    const count = await tx.salesOrder.count({ where: { tenantId: session.tenantId } });
    return tx.salesOrder.create({
      data: {
        soNumber: formatDocNumber("SO", count),
        customerId,
        tenantId: session.tenantId,
        notes,
        lines: { create: lines },
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
  const so = await prisma.salesOrder.findUnique({ where: { id }, include: { lines: true } });
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
  const so = await prisma.salesOrder.findUnique({ where: { id: parsed.data.id } });
  if (!so) return { ok: false, error: "Not found" };
  assertTenant(so.tenantId, session.tenantId);
  if (so.status !== "PICKED") return { ok: false, error: "SO must be PICKED" };

  await prisma.salesOrder.update({
    where: { id: so.id },
    data: { status: "SHIPPED", shippedDate: new Date(), trackingRef: parsed.data.trackingRef },
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
