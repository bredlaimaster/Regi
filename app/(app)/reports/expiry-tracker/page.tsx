import { requireRole } from "@/lib/auth";
import { getExpiryTracker } from "@/lib/reports/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNzd, formatNzDate } from "@/lib/utils";

export default async function ExpiryTrackerPage() {
  const session = await requireRole(["ADMIN"]);
  const rows = await getExpiryTracker(session.tenantId);

  const redRows = rows.filter((r) => r.rag === "RED");
  const amberRows = rows.filter((r) => r.rag === "AMBER");
  const greenRows = rows.filter((r) => r.rag === "GREEN");
  const totalAtRisk = rows.filter((r) => r.rag !== "GREEN").reduce((s, r) => s + r.valueNzd, 0);

  function ragBadge(rag: "RED" | "AMBER" | "GREEN") {
    if (rag === "RED") return <Badge variant="destructive">Red ≤60d</Badge>;
    if (rag === "AMBER") return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Amber ≤180d</Badge>;
    return <Badge variant="success">Green</Badge>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Expiry Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Report 17 · Batch-level expiry with RAG status · {rows.length} batches with stock
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "🔴 Red (≤60 days)", value: redRows.length.toString(), color: "text-rose-600" },
          { label: "🟡 Amber (≤180 days)", value: amberRows.length.toString(), color: "text-amber-600" },
          { label: "🟢 Green", value: greenRows.length.toString(), color: "text-emerald-600" },
          { label: "At-risk Value", value: formatNzd(totalAtRisk), color: totalAtRisk > 0 ? "text-rose-600" : "" },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground">{k.label}</p></CardHeader>
            <CardContent className="pb-4 px-4"><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></CardContent>
          </Card>
        ))}
      </div>

      {[
        { label: "🔴 Critical — Expires within 60 days", items: redRows },
        { label: "🟡 Amber — Expires within 180 days", items: amberRows },
        { label: "🟢 Green — Safe", items: greenRows },
      ].map(({ label, items }) =>
        items.length === 0 ? null : (
          <Card key={label}>
            <CardHeader><CardTitle className="text-sm font-semibold">{label}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead className="text-right">Days Left</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.batchId}>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.brandName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.batchCode ?? "—"}</TableCell>
                      <TableCell>{r.expiryDate ? formatNzDate(r.expiryDate) : "—"}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.rag === "RED" ? "text-rose-600" : r.rag === "AMBER" ? "text-amber-600" : "text-emerald-600"}`}>
                        {r.daysToExpiry !== null ? r.daysToExpiry : "—"}
                      </TableCell>
                      <TableCell className="text-right">{r.qtyOnHand}</TableCell>
                      <TableCell className="text-right">{formatNzd(r.valueNzd)}</TableCell>
                      <TableCell>{ragBadge(r.rag)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      )}

      {rows.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          No batch records yet — batches are created automatically when POs are received
        </p>
      )}
    </div>
  );
}
