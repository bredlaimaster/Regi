import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProformaForm } from "@/components/forms/proforma-form";

export default async function NewProformaPage() {
  const session = await requireSession();
  const [customers, products, priceGroups] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, priceGroupId: true },
    }),
    prisma.product.findMany({
      where: { tenantId: session.tenantId },
      include: { stockLevel: true, prices: { orderBy: [{ priceGroupId: "asc" }, { minQty: "asc" }] } },
      orderBy: { name: "asc" },
    }),
    prisma.priceGroup.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-4">New proforma invoice</h1>
      <ProformaForm
        customers={customers.map((c) => ({ id: c.id, name: c.name, priceGroupId: c.priceGroupId }))}
        products={products.map((p) => ({
          id: p.id, sku: p.sku, name: p.name,
          sellPriceNzd: Number(p.sellPriceNzd),
          stock: p.stockLevel?.qty ?? 0,
          prices: p.prices.map((gp) => ({ priceGroupId: gp.priceGroupId, unitPrice: Number(gp.unitPrice), minQty: gp.minQty })),
        }))}
        priceGroups={priceGroups}
      />
    </div>
  );
}
