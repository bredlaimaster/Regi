import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd, formatNzDate } from "@/lib/utils";
import { formatCurrency, CURRENCY_META, type Currency } from "@/lib/currency";
import { Pagination } from "@/components/pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { Plus } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  DRAFT: "secondary", ORDERED: "default", RECEIVED: "success", CANCELLED: "destructive",
};

export default async function PoListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireRole(["ADMIN", "WAREHOUSE"]);
  const { page: pageStr } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);

  const where = { tenantId: session.tenantId };

  const [rows, totalCount] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

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
              <TableHead>Ccy</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">NZD</TableHead>
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
                <TableCell className="text-xs">
                  {CURRENCY_META[po.currency as Currency]?.flag ?? ""} {po.currency}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(po.totalCost as unknown as number, po.currency)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatNzd(po.totalCostNzd as unknown as number)}</TableCell>
                <TableCell className="text-right"><Link href={`/purchase-orders/${po.id}`} className="text-primary text-sm">Open</Link></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (<TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No POs yet</TableCell></TableRow>)}
          </TableBody>
        </Table>
        <Pagination
          currentPage={currentPage}
          totalCount={totalCount}
          pageSize={DEFAULT_PAGE_SIZE}
          basePath="/purchase-orders"
        />
      </Card>
    </div>
  );
}
