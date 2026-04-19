import { requireSession } from "@/lib/auth";
import { currentFiscalYear } from "@/lib/reports/margin";
import { getReorderPlanner } from "@/lib/reports/supplier";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNzd } from "@/lib/utils";
import { FySelector } from "@/components/reports/fy-selector";

export default async function ReorderPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const fy = sp.fy ? parseInt(sp.fy) : currentFiscalYear();
  const rows = await getReorderPlanner(session.tenantId, fy);

  const totalOrderValue = rows.reduce((s, r) => s + r.suggestedOrderValueNzd, 0);

  // Group by supplier
  const suppliers = [...new Set(rows.map((r) => r.supplierName ?? "No Supplier"))];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Re-order Planner</h1>
          <p className="text-sm text-muted-foreground">
            Report 18 · Products at or below re-order point with suggested order quantities
          </p>
        </div>
        <FySelector current={fy} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "SKUs to Re-order", value: rows.length.toString(), color: rows.length > 0 ? "text-amber-600" : "" },
          { label: "Suggested Order Value", value: formatNzd(totalOrderValue) },
          { label: "Suppliers Affected", value: suppliers.length.toString() },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground">{k.label}</p></CardHeader>
            <CardContent className="pb-4 px-4"><p className={`text-xl font-bold tabular-nums ${k.color ?? ""}`}>{k.value}</p></CardContent>
          </Card>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="text-center text-muted-foreground py-12">All products are above their re-order points — good stock position!</p>
      )}

      {suppliers.map((supplier) => {
        const supplierRows = rows.filter((r) => (r.supplierName ?? "No Supplier") === supplier);
        const supplierValue = supplierRows.reduce((s, r) => s + r.suggestedOrderValueNzd, 0);
        return (
          <Card key={supplier}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{supplier}</span>
                <span className="text-sm font-normal text-muted-foreground">{formatNzd(supplierValue)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">QOH</TableHead>
                    <TableHead className="text-right">On Order</TableHead>
                    <TableHead className="text-right">Re-order Pt</TableHead>
                    <TableHead className="text-right">Avg/Mo</TableHead>
                    <TableHead className="text-right">Case Qty</TableHead>
                    <TableHead className="text-right">Suggest Cases</TableHead>
                    <TableHead className="text-right">Suggest Units</TableHead>
                    <TableHead className="text-right">Est. Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierRows.map((r) => (
                    <TableRow key={r.productId}>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.brandName ?? "—"}</TableCell>
                      <TableCell className="text-right text-rose-600 font-semibold">{r.qtyOnHand}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.openOrderQty}</TableCell>
                      <TableCell className="text-right">{r.reorderPoint}</TableCell>
                      <TableCell className="text-right">{r.avgMonthlyUsage}</TableCell>
                      <TableCell className="text-right">{r.caseQty}</TableCell>
                      <TableCell className="text-right font-semibold">{r.suggestedCases}</TableCell>
                      <TableCell className="text-right font-semibold">{r.suggestedOrderQty}</TableCell>
                      <TableCell className="text-right">{formatNzd(r.suggestedOrderValueNzd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
