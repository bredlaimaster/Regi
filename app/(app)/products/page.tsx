import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";
import { Pagination } from "@/components/pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { Plus } from "lucide-react";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireRole(["ADMIN", "SALES"]);
  const { q, page: pageStr } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);

  const where = {
    tenantId: session.tenantId,
    ...(q
      ? { OR: [{ sku: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] }
      : {}),
  };

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { stockLevel: true, supplier: true },
      orderBy: { name: "asc" },
      skip: (currentPage - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button asChild>
          <Link href="/products/new"><Plus className="h-4 w-4 mr-1" /> New product</Link>
        </Button>
      </div>
      <form className="max-w-md">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search SKU or name..."
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
      </form>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Sell price</TableHead>
              <TableHead>Bin</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.supplier?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{p.stockLevel?.qty ?? 0}</TableCell>
                <TableCell className="text-right">{formatNzd(p.sellPriceNzd as unknown as number)}</TableCell>
                <TableCell className="text-xs">{p.binLocation ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{p.unitBarcode ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/products/${p.id}`} className="text-primary text-sm">Edit</Link>
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No products yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <Pagination
          currentPage={currentPage}
          totalCount={totalCount}
          pageSize={DEFAULT_PAGE_SIZE}
          basePath="/products"
          extraParams={q ? { q } : undefined}
        />
      </Card>
    </div>
  );
}
