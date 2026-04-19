import { requireSession } from "@/lib/auth";
import { currentFiscalYear } from "@/lib/reports/margin";
import { getOverstock } from "@/lib/reports/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNzd } from "@/lib/utils";
import { FySelector } from "@/components/reports/fy-selector";

export default async function OverstockPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; weeks?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const fy = sp.fy ? parseInt(sp.fy) : currentFiscalYear();
  const weeks = sp.weeks ? parseInt(sp.weeks) : 26;
  const rows = await getOverstock(session.tenantId, fy, weeks);

  const totalValue = rows.reduce((s, r) => s + r.valueOnHand, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Overstock &amp; Slow Movers</h1>
          <p className="text-sm text-muted-foreground">Report 13 · Products with &gt;{weeks} weeks of stock · FY{fy}</p>
        </div>
        <FySelector current={fy} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground">Slow Mover SKUs</p></CardHeader>
          <CardContent className="pb-4 px-4"><p className="text-xl font-bold text-amber-600">{rows.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground">Capital Tied Up</p></CardHeader>
          <CardContent className="pb-4 px-4"><p className="text-xl font-bold">{formatNzd(totalValue)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Slow Movers (threshold: {weeks} weeks)</CardTitle></CardHeader>
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
                <TableHead className="text-right">Value</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No slow movers found — great job!
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.productId}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.brandName ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.qtyOnHand}</TableCell>
                  <TableCell className="text-right">{r.qtySoldFy}</TableCell>
                  <TableCell className="text-right">{r.avgMonthlyUsage}</TableCell>
                  <TableCell className="text-right text-amber-600 font-medium">
                    {r.weeksOfStock >= 999 ? "No sales" : `${r.weeksOfStock}w`}
                  </TableCell>
                  <TableCell className="text-right">{formatNzd(r.valueOnHand)}</TableCell>
                  <TableCell>
                    {r.qtySoldFy === 0 ? (
                      <Badge variant="destructive" className="text-xs">Dead stock</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Slow</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
