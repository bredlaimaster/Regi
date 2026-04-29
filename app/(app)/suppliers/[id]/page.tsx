import { notFound } from "next/navigation";
import { requireRole, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SupplierDetailTabs } from "@/components/suppliers/supplier-detail-tabs";

export default async function EditSupplier({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["ADMIN"]);
  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPurchasing: "desc" }, { createdAt: "asc" }] },
      purchaseOrders: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true, poNumber: true, createdAt: true, expectedDate: true,
          status: true, currency: true, totalCostNzd: true,
        },
      },
    },
  });
  if (!supplier) notFound();
  assertTenant(supplier.tenantId, session.tenantId);

  // Costings: PO receipt transactions for products from this supplier.
  const costingTxns = await prisma.inventoryTransaction.findMany({
    where: {
      tenantId: session.tenantId,
      type: "PO_RECEIPT",
      product: { supplierId: id },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      qtyChange: true,
      createdAt: true,
      referenceId: true,
      product: { select: { id: true, sku: true, name: true, costNzd: true } },
    },
  });

  // Pair transactions with their PO number using the referenceId
  const poIds = Array.from(new Set(costingTxns.map((t) => t.referenceId).filter(Boolean) as string[]));
  const pos = poIds.length > 0
    ? await prisma.purchaseOrder.findMany({
        where: { id: { in: poIds } },
        select: { id: true, poNumber: true },
      })
    : [];
  const poMap = new Map(pos.map((p) => [p.id, p.poNumber]));

  const costings = costingTxns.map((t) => ({
    productId: t.product.id,
    sku: t.product.sku,
    name: t.product.name,
    qtyReceived: t.qtyChange,
    landedUnitNzd: Number(t.product.costNzd ?? 0),
    receivedAt: t.createdAt.toISOString(),
    poNumber: t.referenceId ? (poMap.get(t.referenceId) ?? "—") : "—",
  }));

  return (
    <SupplierDetailTabs
      initial={{
        id: supplier.id,
        name: supplier.name,
        contactName: supplier.contactName,
        email: supplier.email,
        phone: supplier.phone,
        currency: supplier.currency,
        acctCode: supplier.acctCode,
        paymentTerms: supplier.paymentTerms,
        taxRule: supplier.taxRule,
        gstVatNumber: supplier.gstVatNumber,
        bankName: supplier.bankName,
        bankBranch: supplier.bankBranch,
        bankAccount: supplier.bankAccount,
        minimumOrderValue: supplier.minimumOrderValue ? Number(supplier.minimumOrderValue) : null,
        deliveryLeadDays: supplier.deliveryLeadDays,
        notes: supplier.notes,
        postalAddress: (supplier.postalAddress as Record<string, unknown>) ?? null,
        physicalAddress: (supplier.physicalAddress as Record<string, unknown>) ?? null,
      }}
      contacts={supplier.contacts.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        website: c.website,
        tollFreeNo: c.tollFreeNo,
        phone: c.phone,
        fax: c.fax,
        mobilePhone: c.mobilePhone,
        officePhone: c.officePhone,
        ddi: c.ddi,
        comments: c.comments,
        isPurchasing: c.isPurchasing,
      }))}
      purchases={supplier.purchaseOrders.map((p) => ({
        id: p.id,
        poNumber: p.poNumber,
        createdAt: p.createdAt.toISOString(),
        eta: p.expectedDate ? p.expectedDate.toISOString() : null,
        status: p.status,
        currency: p.currency,
        totalCostNzd: p.totalCostNzd ? Number(p.totalCostNzd) : null,
      }))}
      costings={costings}
    />
  );
}
