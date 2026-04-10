import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const session = await requireSession();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const grouped = await prisma.inventoryTransaction.groupBy({
    by: ["productId"],
    where: { tenantId: session.tenantId, type: "SO_PICK", createdAt: { gte: since } },
    _sum: { qtyChange: true },
  });
  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
  });
  const m = Object.fromEntries(products.map((p) => [p.id, p]));
  const rows = grouped.map((g) => ({
    sku: m[g.productId]?.sku ?? "",
    name: m[g.productId]?.name ?? "",
    units_sold: Math.abs(g._sum.qtyChange ?? 0),
  }));
  return csvResponse("sales-30d.csv", toCsv(rows));
}
