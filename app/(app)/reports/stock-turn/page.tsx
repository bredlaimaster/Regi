import { requireSession } from "@/lib/auth";
import { currentFiscalYear, getActualsByPeriod } from "@/lib/reports/margin";
import { getStockTurn } from "@/lib/reports/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNzd } from "@/lib/utils";
import { FySelector } from "@/components/reports/fy-selector";

export default async function StockTurnPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const fy = sp.fy ? parseInt(sp.fy) : currentFiscalYear();
  const rows = await getStockTurn(session.tenantId, fy);

  const totalValue = rows.reduce((s, r) => s + r.valueOnHand, 0);
  const avgTurn = rows.filter((r) => r.stockTurnRatio > 0).reduce((s, r) => s + r.stockTurnRatio, 0) /
    Math.max(1, rows.filter((r) => r.stockTurnRatio > 0).length);

  function turnBadge(turn: number) {
    if (turn >= 6) return <Badge variant="success">Fast</Badge>;
    if (turn >= 2) return <Badge variant="default">Normal</Badge>;
    if (turn > 0) return <Badge variant="secondary">Slow</Badge>;
    return <Badge variant="destructive">No sales</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Stock Turn</h1>
          <p className="text-sm text-muted-foreground">Report 5 · FY{fy}</p>
        </div>
        <FySelector current={fy} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Products Tracked", value: rows.length.toString() },
          { label: "Total SOH Value", value: formatNzd(totalValue) },
          { label: "Avg Turn (sold SKUs)", value: `${avgTurn.toFixed(1)}×` },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <p className="text-xl font-bold tabular-nums">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Stock Turn by Product</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">QOH</TableHead>
                <TableHead className="text-right">Sold FY</TableHead>
                <TableHead className="text-right">Avg/Mo</TableHead>
                <TableHead className="text-right">Wks Stock</TableHead>
                <TableHead className="text-right">Turn ×</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.productId}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.brandName ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.qtyOnHand}</TableCell>
                  <TableCell className="text-right">{r.qtySoldFy}</TableCell>
                  <TableCell className="text-right">{r.avgMonthlyUsage}</TableCell>
                  <TableCell className={`text-right ${r.weeksOfStock > 52 ? "text-rose-600" : r.weeksOfStock > 26 ? "text-amber-600" : ""}`}>
                    {r.weeksOfStock >= 999 ? "∞" : r.weeksOfStock}
                  </TableCell>
                  <TableCell className="text-right">{r.stockTurnRatio > 0 ? r.stockTurnRatio : "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatNzd(r.valueOnHand)}</TableCell>
                  <TableCell>{turnBadge(r.stockTurnRatio)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
