import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const session = await requireSession();
  const txs = await prisma.inventoryTransaction.findMany({
    where: { tenantId: session.tenantId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const rows = txs.map((t) => ({
    date: t.createdAt.toISOString(),
    sku: t.product.sku,
    product: t.product.name,
    type: t.type,
    qty_change: t.qtyChange,
    reference: t.referenceId ?? "",
    notes: t.notes ?? "",
  }));
  return csvResponse("transactions.csv", toCsv(rows));
}
