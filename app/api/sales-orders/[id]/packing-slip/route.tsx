import { NextResponse } from "next/server";
import { requireSession, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocPdf, renderPdf } from "@/lib/pdf";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const so = await prisma.salesOrder.findUnique({
    where: { id },
    include: { customer: true, lines: { include: { product: true } } },
  });
  if (!so) return NextResponse.json({ error: "not found" }, { status: 404 });
  assertTenant(so.tenantId, session.tenantId);

  const stream = await renderPdf(
    <DocPdf
      title={`Packing Slip · ${so.soNumber}`}
      subtitle={`${so.customer.name}${so.trackingRef ? " · " + so.trackingRef : ""}`}
      lines={so.lines.map((l) => ({
        sku: l.product.sku,
        name: l.product.name,
        qty: l.qtyOrdered,
        unit: Number(l.product.sellPriceNzd),
      }))}
      showPrice
      footer="Thank you for your business."
    />
  );
  return new Response(stream as any, { headers: { "Content-Type": "application/pdf" } });
}
