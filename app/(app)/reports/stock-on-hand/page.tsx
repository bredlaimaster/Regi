import { requireSession } from "@/lib/auth";
import { getStockOnHand } from "@/lib/reports/inventory";
import { ExportButton } from "@/components/reports/export-button";
import { LastSentBadge } from "@/components/reports/last-sent-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNzd } from "@/lib/utils";

export default async function StockOnHandPage() {
  const session = await requireSession();
  const rows = await getStockOnHand(session.tenantId);

  const totalValue = rows.reduce((s, r) => s + r.valueNzd, 0);
  const totalRetail = rows.reduce((s, r) => s + r.retailValueNzd, 0);
  const lowStockCount = rows.filter((r) => r.belowReorder).length;

  // Group by brand
  const brands = [...new Set(rows.map((r) => r.brandName ?? "Unbranded"))];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stock on Hand</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">Report 11 · Live SOH across all active products</p>
            <LastSentBadge tenantId={session.tenantId} reportKey="stock-on-hand" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href="/api/reports/xlsx/stock-on-hand" />
          <ExportButton href="/api/reports/pdf/stock-valuation" label="Export PDF" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Products", value: rows.length.toString() },
          { label: "Cost Value", value: formatNzd(totalValue) },
          { label: "Retail Value", value: formatNzd(totalRetail) },
          { label: "Below Re-order", value: lowStockCount.toString(), color: lowStockCount > 0 ? "text-rose-600" : "" },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <p className={`text-xl font-bold tabular-nums ${k.color ?? ""}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {brands.map((brand) => {
        const brandRows = rows.filter((r) => (r.brandName ?? "Unbranded") === brand);
        const brandValue = brandRows.reduce((s, r) => s + r.valueNzd, 0);
        return (
          <Card key={brand}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{brand}</span>
                <span className="text-sm font-normal text-muted-foreground">{formatNzd(brandValue)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">QOH</TableHead>
                    <TableHead className="text-right">Re-order</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Stock Value</TableHead>
                    <TableHead className="text-right">Retail Value</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brandRows.map((r) => (
                    <TableRow key={r.productId} className={r.isTester ? "opacity-60" : ""}>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell>
                        {r.name}
                        {r.isTester && <span className="ml-1 text-xs text-muted-foreground">(tester)</span>}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${r.belowReorder ? "text-rose-600" : ""}`}>
                        {r.qty}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.reorderPoint}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNzd(r.costNzd)}</TableCell>
                      <TableCell className="text-right">{formatNzd(r.valueNzd)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNzd(r.retailValueNzd)}</TableCell>
                      <TableCell>
                        {r.belowReorder && <Badge variant="destructive" className="text-xs">Low</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
      {rows.length === 0 && (
        <p className="text-center text-muted-foreground py-12">No active products found</p>
      )}
    </div>
  );
}
