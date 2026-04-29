import { requireRole } from "@/lib/auth";
import { getContainerPlanning } from "@/lib/reports/supplier";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNzd, formatNzDate } from "@/lib/utils";
import { formatCurrency, type Currency } from "@/lib/currency";

export default async function ContainerPlanningPage() {
  const session = await requireRole(["ADMIN"]);
  const suppliers = await getContainerPlanning(session.tenantId);

  const totalNzd = suppliers.reduce((s, r) => s + r.totalValueNzd, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Container Planning</h1>
        <p className="text-sm text-muted-foreground">
          Report 19 · Open ordered POs grouped by supplier for consolidation planning
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Suppliers with Open POs", value: suppliers.length.toString() },
          { label: "Total Open POs", value: suppliers.reduce((s, r) => s + r.openPoCount, 0).toString() },
          { label: "Total Value (NZD)", value: formatNzd(totalNzd) },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground">{k.label}</p></CardHeader>
            <CardContent className="pb-4 px-4"><p className="text-xl font-bold tabular-nums">{k.value}</p></CardContent>
          </Card>
        ))}
      </div>

      {suppliers.length === 0 && (
        <p className="text-center text-muted-foreground py-12">No open (ordered) purchase orders</p>
      )}

      {suppliers.map((s) => (
        <Card key={s.supplierId}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{s.supplierName}</span>
                <Badge variant="outline">{s.openPoCount} PO{s.openPoCount !== 1 ? "s" : ""}</Badge>
              </div>
              <div className="text-sm font-normal text-muted-foreground space-x-3">
                <span>{formatCurrency(s.totalValueSrc, s.supplierCurrency as Currency)}</span>
                <span>≈ {formatNzd(s.totalValueNzd)}</span>
              </div>
            </CardTitle>
            {s.earliestExpected && (
              <p className="text-xs text-muted-foreground">
                Expected: {formatNzDate(s.earliestExpected)}
                {s.latestExpected && s.latestExpected.getTime() !== s.earliestExpected.getTime() &&
                  ` – ${formatNzDate(s.latestExpected)}`}
              </p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.products.map((p) => (
                  <TableRow key={p.sku}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right">{p.qtyOrdered}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{p.qtyReceived}</TableCell>
                    <TableCell className={`text-right font-semibold ${p.outstanding > 0 ? "" : "text-emerald-600"}`}>
                      {p.outstanding}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
