import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNzd, formatNzDate } from "@/lib/utils";
import Link from "next/link";

export default async function ProformaListPage() {
  const session = await requireSession();
  const proformas = await prisma.proformaInvoice.findMany({
    where: { tenantId: session.tenantId },
    include: {
      salesOrder: {
        include: {
          customer: true,
          lines: { include: { product: { select: { name: true } } } },
        },
      },
    },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Proforma Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Proformas are issued before shipment for customer pre-payment
          </p>
        </div>
        <Button asChild>
          <Link href="/proforma/new">New proforma</Link>
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{proformas.length} Proforma Invoice{proformas.length !== 1 ? "s" : ""}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PF #</TableHead>
                <TableHead>SO #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>SO Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proformas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No proforma invoices yet — create one from a sales order
                  </TableCell>
                </TableRow>
              )}
              {proformas.map((pf) => {
                const isExpired = pf.expiresAt && pf.expiresAt < new Date();
                return (
                  <TableRow key={pf.id}>
                    <TableCell className="font-mono text-sm font-semibold">{pf.pfNumber}</TableCell>
                    <TableCell className="font-mono text-sm">
                      <Link href={`/sales-orders/${pf.soId}`} className="text-primary hover:underline">
                        {pf.salesOrder?.soNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{pf.salesOrder?.customer.name}</TableCell>
                    <TableCell className="text-muted-foreground">{pf.salesOrder?.lines.length ?? 0}</TableCell>
                    <TableCell>{formatNzDate(pf.issuedAt)}</TableCell>
                    <TableCell>
                      {pf.expiresAt ? (
                        <span className={isExpired ? "text-rose-600 font-medium" : ""}>
                          {formatNzDate(pf.expiresAt)}
                          {isExpired && " (expired)"}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        pf.salesOrder?.status === "SHIPPED" ? "success" :
                        pf.salesOrder?.status === "CANCELLED" ? "destructive" : "secondary"
                      }>
                        {pf.salesOrder?.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <a
                        href={`/api/reports/pdf/proforma/${pf.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        PDF
                      </a>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
