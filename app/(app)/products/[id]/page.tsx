import { notFound } from "next/navigation";
import { requireRole, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductDetailTabs } from "@/components/products/product-detail-tabs";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["ADMIN", "SALES"]);
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: { prices: { orderBy: [{ priceGroupId: "asc" }, { minQty: "asc" }] } },
  });
  if (!product) notFound();
  assertTenant(product.tenantId, session.tenantId);
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
      initial={{
        id: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        unit: product.unit,
        sellPriceNzd: Number(product.sellPriceNzd),
        reorderPoint: product.reorderPoint,
        imageUrl: product.imageUrl,
        notes: product.notes,
        supplierId: product.supplierId,
        brandId: product.brandId,
        costNzd: product.costNzd ? Number(product.costNzd) : null,
        caseQty: product.caseQty,
        isTester: product.isTester,
        active: product.active,
        supplierCode: product.supplierCode,
        binLocation: product.binLocation,
        unitBarcode: product.unitBarcode,
        caseBarcode: product.caseBarcode,
      }}
      existingPrices={product.prices.map((p) => ({
        priceGroupId: p.priceGroupId,
        unitPrice: Number(p.unitPrice),
        minQty: p.minQty,
      }))}
    />
  );
}
