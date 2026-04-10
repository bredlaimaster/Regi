import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatNzd, formatNzDate } from "@/lib/utils";
import { PoActions } from "./po-actions";

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: true, lines: { include: { product: true } } },
  });
  if (!po) notFound();
  assertTenant(po.tenantId, session.tenantId);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{po.poNumber}</h1>
          <div className="text-sm text-muted-foreground">{po.supplier.name} · {formatNzDate(po.orderDate)}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{po.status}</Badge>
          <Button asChild variant="outline"><Link href={`/api/purchase-orders/${po.id}/pdf`} target="_blank">Print PDF</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>SKU</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit cost</TableHead><TableHead className="text-right">Line total</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.product.sku}</TableCell>
                  <TableCell>{l.product.name}</TableCell>
                  <TableCell className="text-right">{l.qtyOrdered}</TableCell>
                  <TableCell className="text-right">{formatNzd(l.unitCostNzd as unknown as number)}</TableCell>
                  <TableCell className="text-right">{formatNzd(l.qtyOrdered * Number(l.unitCostNzd))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-6 text-sm pt-4">
            <div>Freight: {formatNzd(po.freightNzd as unknown as number)}</div>
            <div className="font-semibold">Total: {formatNzd(po.totalCostNzd as unknown as number)}</div>
          </div>
        </CardContent>
      </Card>

      <PoActions poId={po.id} status={po.status} />
    </div>
  );
}
