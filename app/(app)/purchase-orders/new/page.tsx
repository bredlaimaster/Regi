import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PoForm } from "@/components/forms/po-form";

export default async function NewPoPage() {
  const session = await requireSession();
  const [suppliers, products] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-4">New purchase order</h1>
      <PoForm
        suppliers={suppliers}
        products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name }))}
      />
    </div>
  );
}
