import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const session = await requireSession();
  const products = await prisma.product.findMany({
    where: { tenantId: session.tenantId },
    include: { stockLevel: true, supplier: true },
    orderBy: { sku: "asc" },
  });
  const rows = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    supplier: p.supplier?.name ?? "",
    on_hand: p.stockLevel?.qty ?? 0,
    reorder_point: p.reorderPoint,
    sell_price_nzd: Number(p.sellPriceNzd),
  }));
  return csvResponse("stock-on-hand.csv", toCsv(rows));
}
