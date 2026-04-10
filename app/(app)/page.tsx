import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNzd } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await requireSession();
  const tenantId = session.tenantId;

  const [openPOs, openSOs, products, since] = await Promise.all([
    prisma.purchaseOrder.count({ where: { tenantId, status: { in: ["DRAFT", "ORDERED"] } } }),
    prisma.salesOrder.count({ where: { tenantId, status: { in: ["DRAFT", "CONFIRMED", "PICKED"] } } }),
    prisma.product.findMany({
      where: { tenantId },
      include: { stockLevel: true },
    }),
    Promise.resolve(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
  ]);

  const lowStock = products.filter((p) => (p.stockLevel?.qty ?? 0) <= p.reorderPoint);
  const stockValue = products.reduce(
    (s, p) => s + Number(p.sellPriceNzd) * (p.stockLevel?.qty ?? 0),
    0
  );

  // Top 10 products by qty sold (SO_PICK transactions) in last 30d.
  const topRaw = await prisma.inventoryTransaction.groupBy({
    by: ["productId"],
    where: { tenantId, type: "SO_PICK", createdAt: { gte: since } },
    _sum: { qtyChange: true },
    orderBy: { _sum: { qtyChange: "asc" } }, // SO_PICK is negative
    take: 10,
  });
  const topProductIds = topRaw.map((t) => t.productId);
  const topProducts = await prisma.product.findMany({ where: { id: { in: topProductIds } } });
  const topMap = Object.fromEntries(topProducts.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Open POs" value={openPOs} href="/purchase-orders" />
        <StatCard title="Open SOs" value={openSOs} href="/sales-orders" />
        <StatCard title="Low stock" value={lowStock.length} href="/inventory" tone={lowStock.length ? "warn" : undefined} />
        <StatCard title="Stock value (sell)" value={formatNzd(stockValue)} href="/reports" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Low stock</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Name</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reorder</TableHead></TableRow></TableHeader>
              <TableBody>
                {lowStock.slice(0, 10).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell><Link href={`/products/${p.id}`}>{p.name}</Link></TableCell>
                    <TableCell className="text-right">{p.stockLevel?.qty ?? 0}</TableCell>
                    <TableCell className="text-right">{p.reorderPoint}</TableCell>
                  </TableRow>
                ))}
                {lowStock.length === 0 && (<TableRow><TableCell colSpan={4} className="text-muted-foreground text-center py-6">All stock healthy</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top products — last 30 days</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="text-right">Units sold</TableHead></TableRow></TableHeader>
              <TableBody>
                {topRaw.map((t) => (
                  <TableRow key={t.productId}>
                    <TableCell>{topMap[t.productId]?.name ?? t.productId}</TableCell>
                    <TableCell className="text-right">{Math.abs(t._sum.qtyChange ?? 0)}</TableCell>
                  </TableRow>
                ))}
                {topRaw.length === 0 && (<TableRow><TableCell colSpan={2} className="text-muted-foreground text-center py-6">No sales yet</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title, value, href, tone,
}: { title: string; value: React.ReactNode; href: string; tone?: "warn" }) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 transition-colors">
        <CardContent className="p-5">
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className={`text-3xl font-semibold mt-1 ${tone === "warn" ? "text-amber-500" : ""}`}>{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
