import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdjustDialog } from "./adjust-dialog";

export default async function InventoryPage() {
  const session = await requireRole(["ADMIN", "SALES"]);
  const products = await prisma.product.findMany({
    where: { tenantId: session.tenantId },
    include: { stockLevel: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Reorder point</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => {
              const qty = p.stockLevel?.qty ?? 0;
              const low = qty <= p.reorderPoint;
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right">{qty}</TableCell>
                  <TableCell className="text-right">{p.reorderPoint}</TableCell>
                  <TableCell>
                    {low ? <Badge variant="warning">Low</Badge> : <Badge variant="success">OK</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdjustDialog productId={p.id} productName={p.name} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
