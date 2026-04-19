import { requireSession } from "@/lib/auth";
import { getSupplierEta } from "@/lib/reports/supplier";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNzd, formatNzDate } from "@/lib/utils";
import Link from "next/link";

export default async function SupplierEtaPage() {
  const session = await requireSession();
  const rows = await getSupplierEta(session.tenantId);

  const overdueRows = rows.filter((r) => r.isOverdue);
  const dueThisWeek = rows.filter((r) => !r.isOverdue && (r.daysUntilExpected ?? 999) <= 7);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Supplier ETA</h1>
        <p className="text-sm text-muted-foreground">Report 20 · All ordered POs with expected arrival dates</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Overdue", value: overdueRows.length.toString(), color: overdueRows.length > 0 ? "text-rose-600" : "" },
          { label: "Due This Week", value: dueThisWeek.length.toString(), color: dueThisWeek.length > 0 ? "text-amber-600" : "" },
          { label: "Total Open POs", value: rows.length.toString() },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground">{k.label}</p></CardHeader>
            <CardContent className="pb-4 px-4"><p className={`text-xl font-bold tabular-nums ${k.color ?? ""}`}>{k.value}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Open PO ETA Board</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Value (NZD)</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No ordered POs
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.poId}>
                  <TableCell className="font-mono text-xs">{r.poNumber}</TableCell>
                  <TableCell className="font-medium">{r.supplierName}</TableCell>
                  <TableCell>{formatNzDate(r.orderDate)}</TableCell>
                  <TableCell>{r.expectedDate ? formatNzDate(r.expectedDate) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.isOverdue ? "text-rose-600" : (r.daysUntilExpected ?? 999) <= 7 ? "text-amber-600" : ""}`}>
                    {r.daysUntilExpected !== null ? (
                      r.isOverdue ? `${Math.abs(r.daysUntilExpected)}d overdue` : `${r.daysUntilExpected}d`
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{formatNzd(r.totalValueNzd)}</TableCell>
                  <TableCell className="text-right">{r.lineCount}</TableCell>
                  <TableCell>
                    {r.isOverdue && <Badge variant="destructive">Overdue</Badge>}
                    {!r.isOverdue && (r.daysUntilExpected ?? 999) <= 7 && (
                      <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Due soon</Badge>
                    )}
                    <Link href={`/purchase-orders/${r.poId}`} className="ml-2 text-primary text-xs">Open</Link>
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
