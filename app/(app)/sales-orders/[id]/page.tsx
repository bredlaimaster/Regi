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
import { SoProformaButton } from "./so-proforma-button";
import { PartialPickForm } from "./partial-pick-form";

export default async function SoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const so = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: { include: { channel: true, territory: true, salesRep: true } },
      lines: { include: { product: true } },
      proforma: true,
      creditNotes: { orderBy: { issuedAt: "desc" } },
    },
  });
  if (!so) notFound();
  assertTenant(so.tenantId, session.tenantId);

  const orderDiscount = Number(so.discountPct ?? 0);
  let subtotal = 0;
  const lineRows = so.lines.map((l) => {
    const linePrice = Number(l.unitPrice) || Number(l.product.sellPriceNzd);
    const lineDiscount = Math.max(Number(l.discountPct ?? 0), orderDiscount);
    const lineTotal = l.qtyOrdered * linePrice * (1 - lineDiscount / 100);
    subtotal += lineTotal;
    return { ...l, linePrice, lineDiscount, lineTotal };
  });
  const gst = subtotal * 0.15;
  const grandTotal = subtotal + gst;

  const shipTo = so.selectedShipTo as { label?: string; line1?: string; city?: string } | null;
  const hasOutstandingPicks = so.lines.some((l) => l.qtyPicked < l.qtyOrdered);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{so.soNumber}</h1>
          <div className="text-sm text-muted-foreground space-x-2">
            <span>{so.customer.name}</span>
            <span>·</span>
            <span>{formatNzDate(so.orderDate)}</span>
            {so.customer.channel && <><span>·</span><span>{so.customer.channel.name}</span></>}
            {so.customer.territory && <><span>·</span><span>{so.customer.territory.name}</span></>}
            {so.customer.salesRep && <><span>·</span><span>Rep: {so.customer.salesRep.name ?? so.customer.salesRep.email}</span></>}
          </div>
          {shipTo && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Ship to: {[shipTo.label, shipTo.line1, shipTo.city].filter(Boolean).join(", ")}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge>{so.status}</Badge>
          {so.isProforma && <Badge variant="outline" className="text-blue-600 border-blue-300">Proforma issued</Badge>}
          <Button asChild variant="outline" size="sm">
            <Link href={`/api/sales-orders/${so.id}/pick-list`} target="_blank">Pick list</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/api/sales-orders/${so.id}/packing-slip`} target="_blank">Packing slip</Link>
          </Button>
          {so.proforma ? (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/reports/pdf/proforma/${so.proforma.id}`} target="_blank">
                View Proforma ({so.proforma.pfNumber})
              </a>
            </Button>
          ) : (
            <SoProformaButton soId={so.id} />
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Lines</span>
            {orderDiscount > 0 && (
              <span className="text-sm font-normal text-amber-600">
                Order discount: {orderDiscount}%
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Picked</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Disc %</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineRows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.product.sku}</TableCell>
                  <TableCell>{l.product.name}</TableCell>
                  <TableCell className="text-right">{l.qtyOrdered}</TableCell>
                  <TableCell className={`text-right ${l.qtyPicked > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {l.qtyPicked > 0 ? l.qtyPicked : "—"}
                  </TableCell>
                  <TableCell className="text-right">{formatNzd(l.linePrice)}</TableCell>
                  <TableCell className={`text-right ${l.lineDiscount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                    {l.lineDiscount > 0 ? `${l.lineDiscount}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatNzd(l.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-6 text-sm pt-4">
            <div>Subtotal (ex GST): {formatNzd(subtotal)}</div>
            <div>GST (15%): {formatNzd(gst)}</div>
            <div className="font-semibold text-base">Total: {formatNzd(grandTotal)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Partial pick form — CONFIRMED status, outstanding picks */}
      {so.status === "CONFIRMED" && hasOutstandingPicks && (
        <PartialPickForm
          soId={so.id}
          lines={so.lines.map((l) => ({
            id: l.id,
            sku: l.product.sku,
            name: l.product.name,
            qtyOrdered: l.qtyOrdered,
            qtyPicked: l.qtyPicked,
          }))}
        />
      )}

      {/* Credit notes */}
      {so.creditNotes.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Credit Notes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CN #</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {so.creditNotes.map((cn) => (
                  <TableRow key={cn.id}>
                    <TableCell className="font-mono text-xs">{cn.cnNumber}</TableCell>
                    <TableCell>{cn.reason.replace("_", " ")}</TableCell>
                    <TableCell className="text-right text-emerald-700 font-medium">
                      {formatNzd(Number(cn.amountNzd))}
                    </TableCell>
                    <TableCell>{formatNzDate(cn.issuedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <SoActions soId={so.id} status={so.status} trackingRef={so.trackingRef} />
    </div>
  );
}
