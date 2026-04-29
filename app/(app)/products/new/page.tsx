import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductDetailTabs } from "@/components/products/product-detail-tabs";

export default async function NewProductPage() {
  const session = await requireRole(["ADMIN", "SALES"]);
  const [suppliers, brands, priceGroups] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.priceGroup.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  return (
    <ProductDetailTabs
      suppliers={suppliers}
      brands={brands}
      priceGroups={priceGroups}
    />
  );
}
