import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatNzd, formatNzDate } from "@/lib/utils";
import { formatCurrency, CURRENCY_META, type Currency } from "@/lib/currency";
import { PoActions } from "./po-actions";
import { PartialReceiveForm } from "./partial-receive-form";

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["ADMIN", "WAREHOUSE"]);
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: { include: { product: true } },
      receiveCharges: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!po) notFound();
  assertTenant(po.tenantId, session.tenantId);

  const ccy = po.currency as Currency;
  const fxRate = Number(po.fxRate);
  const isForeign = ccy !== "NZD";
  const hasOutstanding = po.lines.some((l) => l.qtyOrdered > l.qtyReceived);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{po.poNumber}</h1>
          <div className="text-sm text-muted-foreground">
            {po.supplier.name} · {formatNzDate(po.orderDate)}
            {" · "}
            {CURRENCY_META[ccy]?.flag} {ccy}
            {isForeign && (
              <> · rate 1 {ccy} = {fxRate.toFixed(4)} NZD
                {po.fxRateDate && <> ({formatNzDate(po.fxRateDate)})</>}</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{po.status}</Badge>
          <Button asChild variant="outline" size="sm"><Link href={`/api/purchase-orders/${po.id}/pdf`} target="_blank">Print PDF</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Unit cost ({ccy})</TableHead>
                <TableHead className="text-right">Line total ({ccy})</TableHead>
                {isForeign && <TableHead className="text-right">NZD</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((l) => {
                const lineSrc = l.qtyOrdered * Number(l.unitCost);
                const outstanding = l.qtyOrdered - l.qtyReceived;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.product.sku}</TableCell>
                    <TableCell>{l.product.name}</TableCell>
                    <TableCell className="text-right">{l.qtyOrdered}</TableCell>
                    <TableCell className="text-right text-emerald-600">{l.qtyReceived > 0 ? l.qtyReceived : "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${outstanding > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {outstanding > 0 ? outstanding : "✓"}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(l.unitCost as unknown as number, ccy)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(lineSrc, ccy)}</TableCell>
                    {isForeign && <TableCell className="text-right text-muted-foreground">{formatNzd(lineSrc * fxRate)}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {(() => {
            const subtotal = po.lines.reduce((s, l) => s + l.qtyOrdered * Number(l.unitCost), 0);
            const freightAmt = Number(po.freight ?? 0);
            const chargesNzd = po.receiveCharges.reduce((s, ch) => s + Number(ch.amountNzd), 0);
            const chargesTaxNzd = po.receiveCharges.reduce((s, ch) => s + Number(ch.taxAmountNzd), 0);
            const grandTotalNzd = Math.round(subtotal * fxRate * 100) / 100
              + Math.round(freightAmt * fxRate * 100) / 100
              + chargesNzd;
            return (
              <div className="flex flex-col items-end gap-1 text-sm pt-4">
                <div>Subtotal: {formatCurrency(subtotal, ccy)}</div>
                {freightAmt > 0 && <div>Freight: {formatCurrency(freightAmt, ccy)}</div>}
                {po.receiveCharges.length > 0 && (
                  <>
                    {po.receiveCharges.map((ch) => (
                      <div key={ch.id} className="text-muted-foreground">
                        {ch.label}: {formatCurrency(Number(ch.amount), ch.currency as Currency)}
                        {Number(ch.taxRate) > 0 && ` + ${Number(ch.taxRate)}% GST (${formatNzd(Number(ch.taxAmountNzd))})`}
                        {ch.currency !== "NZD" && ` → ${formatNzd(Number(ch.amountNzd))}`}
                        {ch.invoiceRef && ` — Inv: ${ch.invoiceRef}`}
                      </div>
                    ))}
                  </>
                )}
                <div className="font-semibold text-base border-t pt-1 mt-1">
                  Total (NZD): {formatNzd(grandTotalNzd)}
                  {chargesTaxNzd > 0 && (
                    <span className="text-xs font-normal text-muted-foreground ml-2">
                      (incl. {formatNzd(chargesTaxNzd)} GST)
                    </span>
                  )}
                </div>
                {isForeign && (
                  <div className="text-xs text-muted-foreground">
                    Product subtotal: {formatCurrency(subtotal, ccy)} @ {fxRate.toFixed(4)} = {formatNzd(subtotal * fxRate)}
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Partial receive form (ORDERED POs with outstanding lines) */}
      {po.status === "ORDERED" && hasOutstanding && (
        <PartialReceiveForm
          poId={po.id}
          currency={ccy}
          currentFreight={Number(po.freight ?? 0)}
          supplierTaxRule={po.supplier.taxRule}
          lines={po.lines.map((l) => ({
            id: l.id,
            productId: l.productId,
            sku: l.product.sku,
            name: l.product.name,
            qtyOrdered: l.qtyOrdered,
            qtyReceived: l.qtyReceived,
          }))}
        />
      )}

      <PoActions poId={po.id} status={po.status} />
    </div>
  );
}
