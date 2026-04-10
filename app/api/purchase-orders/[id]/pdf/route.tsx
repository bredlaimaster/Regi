import { NextResponse } from "next/server";
import { requireSession, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocPdf, renderPdf } from "@/lib/pdf";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: true, lines: { include: { product: true } } },
  });
  if (!po) return NextResponse.json({ error: "not found" }, { status: 404 });
  assertTenant(po.tenantId, session.tenantId);

  const stream = await renderPdf(
    <DocPdf
      title={`Purchase Order · ${po.poNumber}`}
      subtitle={po.supplier.name}
      lines={po.lines.map((l) => ({
        sku: l.product.sku,
        name: l.product.name,
        qty: l.qtyOrdered,
        unit: Number(l.unitCostNzd),
      }))}
      showPrice
    />
  );
  return new Response(stream as any, { headers: { "Content-Type": "application/pdf" } });
}
