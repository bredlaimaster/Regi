import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd, formatNzDate } from "@/lib/utils";
import { Plus } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  DRAFT: "secondary", ORDERED: "default", RECEIVED: "success", CANCELLED: "destructive",
};

export default async function PoListPage() {
  const session = await requireSession();
  const rows = await prisma.purchaseOrder.findMany({
    where: { tenantId: session.tenantId },
    include: { supplier: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Purchase Orders</h1>
        <Button asChild><Link href="/purchase-orders/new"><Plus className="h-4 w-4 mr-1" /> New PO</Link></Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Order date</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-mono text-xs">{po.poNumber}</TableCell>
                <TableCell>{po.supplier.name}</TableCell>
                <TableCell>{formatNzDate(po.orderDate)}</TableCell>
                <TableCell>{po.expectedDate ? formatNzDate(po.expectedDate) : "—"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[po.status]}>{po.status}</Badge></TableCell>
                <TableCell className="text-right">{formatNzd(po.totalCostNzd as unknown as number)}</TableCell>
                <TableCell className="text-right"><Link href={`/purchase-orders/${po.id}`} className="text-primary text-sm">Open</Link></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (<TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No POs yet</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
