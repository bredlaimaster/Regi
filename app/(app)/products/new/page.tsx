import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/forms/product-form";

export default async function NewProductPage() {
  const session = await requireSession();
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { name: "asc" },
  });
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">New product</h1>
      <ProductForm suppliers={suppliers} />
    </div>
  );
}
