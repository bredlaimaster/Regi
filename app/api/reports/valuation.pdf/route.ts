import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocPdf, renderPdf } from "@/lib/pdf";

export async function GET() {
  const session = await requireSession();
  const products = await prisma.product.findMany({
    where: { tenantId: session.tenantId },
    include: { stockLevel: true },
    orderBy: { name: "asc" },
  });
  const stream = await renderPdf(
    <DocPdf
      title="Stock Valuation (at sell price)"
      subtitle="Snapshot"
      showPrice
      lines={products.map((p) => ({
        sku: p.sku,
        name: p.name,
        qty: p.stockLevel?.qty ?? 0,
        unit: Number(p.sellPriceNzd),
      }))}
    />
  );
  return new Response(stream as any, { headers: { "Content-Type": "application/pdf" } });
}
