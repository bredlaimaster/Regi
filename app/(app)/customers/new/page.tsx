import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerDetailTabs } from "@/components/customers/customer-detail-tabs";

export default async function NewCustomerPage() {
  const session = await requireRole(["ADMIN", "SALES"]);

  const [channels, territories, salesReps, priceGroups] = await Promise.all([
    prisma.channel.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.territory.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId: session.tenantId, role: "SALES" }, orderBy: { name: "asc" } }),
    prisma.priceGroup.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <CustomerDetailTabs
      initial={{
        id: "",
        name: "",
        contactName: null,
        email: null,
        phone: null,
        channelId: null,
        territoryId: null,
        salesRepId: null,
        creditLimit: null,
        paymentTerms: null,
        priceGroupId: null,
        acctCode: null,
        currency: "NZD",
        taxNumber: null,
        taxRule: "GST15",
        notes: null,
        postalAddress: null,
        physicalAddress: null,
        shipTos: [],
      }}
      contacts={[]}
      quotes={[]}
      orders={[]}
      credits={[]}
      channels={channels}
      territories={territories}
      salesReps={salesReps.map((r) => ({ id: r.id, name: r.name, email: r.email }))}
      priceGroups={priceGroups}
    />
  );
}
