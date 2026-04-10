import { notFound } from "next/navigation";
import { requireSession, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/forms/product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();
  assertTenant(product.tenantId, session.tenantId);
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { name: "asc" },
  });
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">Edit product</h1>
      <ProductForm
        suppliers={suppliers}
        initial={{
          ...product,
          sellPriceNzd: Number(product.sellPriceNzd),
        }}
      />
    </div>
  );
}
