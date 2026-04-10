import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SoForm } from "@/components/forms/so-form";

export default async function NewSoPage() {
  const session = await requireSession();
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { tenantId: session.tenantId },
      include: { stockLevel: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-4">New sales order</h1>
      <SoForm
        customers={customers}
        products={products.map((p) => ({
          id: p.id, sku: p.sku, name: p.name,
          sellPriceNzd: Number(p.sellPriceNzd),
          stock: p.stockLevel?.qty ?? 0,
        }))}
      />
    </div>
  );
}
