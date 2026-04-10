import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzDate } from "@/lib/utils";
import { Plus } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive" | "warning"> = {
  DRAFT: "secondary", CONFIRMED: "default", PICKED: "warning", SHIPPED: "success", CANCELLED: "destructive",
};

export default async function SoListPage() {
  const session = await requireSession();
  const rows = await prisma.salesOrder.findMany({
    where: { tenantId: session.tenantId },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sales Orders</h1>
        <Button asChild><Link href="/sales-orders/new"><Plus className="h-4 w-4 mr-1" /> New SO</Link></Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SO #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order date</TableHead>
              <TableHead>Shipped</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((so) => (
              <TableRow key={so.id}>
                <TableCell className="font-mono text-xs">{so.soNumber}</TableCell>
                <TableCell>{so.customer.name}</TableCell>
                <TableCell>{formatNzDate(so.orderDate)}</TableCell>
                <TableCell>{so.shippedDate ? formatNzDate(so.shippedDate) : "—"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[so.status]}>{so.status}</Badge></TableCell>
                <TableCell className="text-right"><Link href={`/sales-orders/${so.id}`} className="text-primary text-sm">Open</Link></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No sales orders yet</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
