/**
 * Idempotent seed: create the default 4 price groups per tenant (Retail,
 * Wholesale, Trade, VIP) and backfill any customer with priceGroupId=NULL
 * onto the Retail group.
 *
 * Usage:
 *   DATABASE_URL="..." DIRECT_URL="..." npx tsx prisma/seed-price-groups.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULTS = [
  { name: "Retail", description: "Default retail pricing", isDefault: true, sortOrder: 0 },
  { name: "Wholesale", description: "Wholesale customers", isDefault: false, sortOrder: 10 },
  { name: "Trade", description: "Trade customers", isDefault: false, sortOrder: 20 },
  { name: "VIP", description: "VIP / key accounts", isDefault: false, sortOrder: 30 },
];

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`Found ${tenants.length} tenant(s)`);

  for (const t of tenants) {
    console.log(`\n→ Tenant "${t.name}" (${t.id})`);

    for (const g of DEFAULTS) {
      const existing = await prisma.priceGroup.findUnique({
        where: { tenantId_name: { tenantId: t.id, name: g.name } },
      });
      if (existing) {
        console.log(`   • ${g.name}: already exists (${existing.id})`);
      } else {
        const created = await prisma.priceGroup.create({
          data: { tenantId: t.id, ...g },
        });
        console.log(`   ✓ ${g.name}: created (${created.id})`);
      }
    }

    // Backfill: assign customers without a group to this tenant's default group.
    const def = await prisma.priceGroup.findFirst({
      where: { tenantId: t.id, isDefault: true },
    });
    if (!def) {
      console.log(`   (!) No default group found for this tenant — skipping backfill`);
      continue;
    }
    const upd = await prisma.customer.updateMany({
      where: { tenantId: t.id, priceGroupId: null },
      data: { priceGroupId: def.id },
    });
    console.log(`   ✓ Backfilled ${upd.count} customer(s) onto "${def.name}"`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\nDone.");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
