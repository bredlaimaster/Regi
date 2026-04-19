import { requireSession } from "@/lib/auth";
import { getTesterStock } from "@/lib/reports/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";

export default async function TesterTrackerPage() {
  const session = await requireSession();
  const rows = await getTesterStock(session.tenantId);

  const totalValue = rows.reduce((s, r) => s + r.valueNzd, 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tester Tracker</h1>
        <p className="text-sm text-muted-foreground">Report 4 · All tester SKUs and their stock levels</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tester SKUs", value: rows.length.toString() },
          { label: "Total Qty", value: totalQty.toString() },
          { label: "Cost Value", value: formatNzd(totalValue) },
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
        <CardHeader><CardTitle className="text-base">Tester Inventory</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Qty on Hand</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Stock Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No tester products found — mark products as testers in the product form
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.productId}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.brandName ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.qty}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatNzd(r.costNzd)}</TableCell>
                  <TableCell className="text-right">{formatNzd(r.valueNzd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
