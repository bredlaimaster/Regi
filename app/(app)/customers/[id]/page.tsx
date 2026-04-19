import { notFound } from "next/navigation";
import { requireSession, assertTenant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerDetailTabs } from "@/components/customers/customer-detail-tabs";

export default async function EditCustomer({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [c, channels, territories, salesReps, priceGroups] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ isPurchasing: "desc" }, { createdAt: "asc" }] },
        salesOrders: {
          where: { isProforma: false },
          orderBy: { orderDate: "desc" },
          take: 100,
          select: {
            id: true, soNumber: true, orderDate: true, status: true, notes: true,
            lines: { select: { qtyOrdered: true, unitPrice: true, discountPct: true } },
          },
        },
        creditNotes: {
          orderBy: { issuedAt: "desc" },
          take: 100,
          select: { id: true, cnNumber: true, issuedAt: true, amountNzd: true },
        },
      },
    }),
    prisma.channel.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.territory.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId: session.tenantId, role: "SALES" }, orderBy: { name: "asc" } }),
    prisma.priceGroup.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  if (!c) notFound();
  assertTenant(c.tenantId, session.tenantId);

  // Proforma invoices (quotes) for this customer via sales orders
  const proformas = await prisma.proformaInvoice.findMany({
    where: { tenantId: session.tenantId, salesOrder: { customerId: id } },
    orderBy: { issuedAt: "desc" },
    take: 100,
    select: {
      id: true, pfNumber: true, issuedAt: true, expiresAt: true, soId: true,
      salesOrder: {
        select: {
          status: true,
          lines: { select: { qtyOrdered: true, unitPrice: true, discountPct: true } },
        },
      },
    },
  });

  const orderTotal = (lines: { qtyOrdered: number; unitPrice: unknown; discountPct: unknown }[]) =>
    lines.reduce((sum, l) => {
      const price = Number(l.unitPrice ?? 0);
      const disc = Number(l.discountPct ?? 0);
      return sum + l.qtyOrdered * price * (1 - disc / 100);
    }, 0);

  const quotes = proformas.map((p) => ({
    id: p.id,
    pfNumber: p.pfNumber,
    issuedAt: p.issuedAt.toISOString(),
    expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
    status: p.salesOrder?.status ?? "DRAFT",
    currency: c.currency ?? "NZD",
    totalNzd: p.salesOrder ? orderTotal(p.salesOrder.lines) : null,
    soId: p.soId,
  }));

  const orders = c.salesOrders.map((o) => ({
    id: o.id,
    soNumber: o.soNumber,
    orderDate: o.orderDate.toISOString(),
    requiredDate: null,
    customerRef: o.notes,
    warehouse: null,
    status: o.status,
    currency: c.currency ?? "NZD",
    totalNzd: orderTotal(o.lines),
  }));

  const credits = c.creditNotes.map((cn) => ({
    id: cn.id,
    cnNumber: cn.cnNumber,
    issuedAt: cn.issuedAt.toISOString(),
    status: "Issued",
    currency: c.currency ?? "NZD",
    amountNzd: Number(cn.amountNzd),
  }));

  return (
    <CustomerDetailTabs
      initial={{
        id: c.id,
        name: c.name,
        contactName: c.contactName,
        email: c.email,
        phone: c.phone,
        channelId: c.channelId,
        territoryId: c.territoryId,
        salesRepId: c.salesRepId,
        creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
        paymentTerms: c.paymentTerms,
        priceGroupId: c.priceGroupId,
        acctCode: c.acctCode,
        currency: c.currency,
        taxNumber: c.taxNumber,
        taxRule: c.taxRule,
        notes: c.notes,
        postalAddress: (c.postalAddress as Record<string, unknown> | null) ?? null,
        physicalAddress: (c.physicalAddress as Record<string, unknown> | null) ?? null,
        shipTos: (c.shipTos as Array<Record<string, unknown>> | null) ?? null,
      }}
      contacts={c.contacts.map((ct) => ({
        id: ct.id,
        firstName: ct.firstName,
        lastName: ct.lastName,
        email: ct.email,
        website: ct.website,
        tollFreeNo: ct.tollFreeNo,
        phone: ct.phone,
        fax: ct.fax,
        mobilePhone: ct.mobilePhone,
        officePhone: ct.officePhone,
        ddi: ct.ddi,
        comments: ct.comments,
        isPurchasing: ct.isPurchasing,
      }))}
      quotes={quotes}
      orders={orders}
      credits={credits}
      channels={channels}
      territories={territories}
      salesReps={salesReps.map((r) => ({ id: r.id, name: r.name, email: r.email }))}
      priceGroups={priceGroups}
    />
  );
}
