import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatNzd, formatNzDate } from "@/lib/utils";
import { SoActions } from "./so-actions";

export default async function SoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const so = await prisma.salesOrder.findUnique({
    where: { id },
    include: { customer: true, lines: { include: { product: true } } },
  });
  if (!so) notFound();
  assertTenant(so.tenantId, session.tenantId);

  const subtotal = so.lines.reduce((s, l) => s + Number(l.product.sellPriceNzd) * l.qtyOrdered, 0);
  const gst = subtotal * 0.15;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{so.soNumber}</h1>
          <div className="text-sm text-muted-foreground">{so.customer.name} · {formatNzDate(so.orderDate)}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{so.status}</Badge>
          <Button asChild variant="outline"><Link href={`/api/sales-orders/${so.id}/pick-list`} target="_blank">Pick list</Link></Button>
          <Button asChild variant="outline"><Link href={`/api/sales-orders/${so.id}/packing-slip`} target="_blank">Packing slip</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>SKU</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Line total</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {so.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.product.sku}</TableCell>
                  <TableCell>{l.product.name}</TableCell>
                  <TableCell className="text-right">{l.qtyOrdered}</TableCell>
                  <TableCell className="text-right">{formatNzd(l.product.sellPriceNzd as unknown as number)}</TableCell>
                  <TableCell className="text-right">{formatNzd(l.qtyOrdered * Number(l.product.sellPriceNzd))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-6 text-sm pt-4">
            <div>Subtotal: {formatNzd(subtotal)}</div>
            <div>GST: {formatNzd(gst)}</div>
            <div className="font-semibold">Total: {formatNzd(subtotal + gst)}</div>
          </div>
        </CardContent>
      </Card>

      <SoActions soId={so.id} status={so.status} trackingRef={so.trackingRef} />
    </div>
  );
}
