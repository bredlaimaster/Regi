import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzDateTime } from "@/lib/utils";

export default async function AuditPage() {
  const session = await requireSession();
  const txs = await prisma.inventoryTransaction.findMany({
    where: { tenantId: session.tenantId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit trail</h1>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Δ Qty</TableHead><TableHead>Ref</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
          <TableBody>
            {txs.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs">{formatNzDateTime(t.createdAt)}</TableCell>
                <TableCell>{t.product.name}</TableCell>
                <TableCell className="text-xs">{t.type}</TableCell>
                <TableCell className={`text-right ${t.qtyChange < 0 ? "text-destructive" : "text-emerald-600"}`}>{t.qtyChange}</TableCell>
                <TableCell className="text-xs font-mono">{t.referenceId ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
