import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PriceGroupManager } from "./price-group-manager";

export default async function PriceGroupsSettingsPage() {
  const session = await requireRole(["ADMIN"]);
  const groups = await prisma.priceGroup.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { customers: true, prices: true } },
    },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="text-xs text-muted-foreground">
          <Link href="/settings" className="hover:underline">Settings</Link>
          {" > "}
          <span>Price Groups</span>
        </div>
        <h1 className="text-2xl font-semibold mt-1">Price Groups</h1>
        <p className="text-sm text-muted-foreground">
          Named pricing tiers (e.g. Retail, Wholesale, Trade). Each customer can be assigned to one group,
          and products can have custom prices per group with optional quantity breaks.
        </p>
      </div>

      <PriceGroupManager
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          isDefault: g.isDefault,
          sortOrder: g.sortOrder,
          customerCount: g._count.customers,
          priceCount: g._count.prices,
        }))}
      />
    </div>
  );
}
