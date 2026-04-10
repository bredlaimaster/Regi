import type { Prisma, TransactionType } from "@prisma/client";

/**
 * Apply a stock movement inside a Prisma transaction.
 * Always pairs a StockLevel upsert with an immutable InventoryTransaction row.
 */
export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    productId: string;
    qtyChange: number; // positive = in, negative = out
    type: TransactionType;
    referenceId?: string | null;
    notes?: string | null;
    userId?: string | null;
  }
) {
  const { tenantId, productId, qtyChange, type, referenceId, notes, userId } = args;

  await tx.stockLevel.upsert({
    where: { productId },
    create: { productId, qty: qtyChange },
    update: { qty: { increment: qtyChange } },
  });

  await tx.inventoryTransaction.create({
    data: { tenantId, productId, qtyChange, type, referenceId, notes, userId },
  });
}
