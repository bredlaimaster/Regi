import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNzDate } from "@/lib/utils";
import { NewReservationForm } from "./new-reservation-form";
import { ReleaseReservationButton } from "./release-reservation-button";

export default async function ReservationsPage() {
  const session = await requireRole(["ADMIN", "SALES"]);

  const [reservations, products, customers] = await Promise.all([
    prisma.stockReservation.findMany({
      where: { tenantId: session.tenantId, released: false },
      include: {
        product: { select: { sku: true, name: true } },
        customer: { select: { name: true } },
        rep: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { tenantId: session.tenantId, active: true },
      select: { id: true, sku: true, name: true },
      orderBy: { sku: "asc" },
    }),
    prisma.customer.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Stock Reservations</h1>
        <p className="text-sm text-muted-foreground">
          Reserve inventory per customer or rep before a sales order is raised
        </p>
      </div>

      <NewReservationForm products={products} customers={customers} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Active Reservations ({reservations.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty Reserved</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No active reservations
                  </TableCell>
                </TableRow>
              )}
              {reservations.map((r) => {
                const isExpired = r.expiresAt && r.expiresAt < new Date();
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.product.sku}</TableCell>
                    <TableCell>{r.product.name}</TableCell>
                    <TableCell className="text-right font-medium">{r.qtyReserved}</TableCell>
                    <TableCell>{r.customer?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{r.rep ? (r.rep.name ?? r.rep.email) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {r.expiresAt ? (
                        <span className={isExpired ? "text-rose-600 font-medium" : ""}>
                          {formatNzDate(r.expiresAt)}
                          {isExpired && " (expired)"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs max-w-[160px] truncate">
                      {r.notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatNzDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isExpired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                        <ReleaseReservationButton id={r.id} />
                      </div>
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
