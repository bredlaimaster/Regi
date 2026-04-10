import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "demo-tenant" },
    update: {},
    create: { id: "demo-tenant", name: "Demo Beauty Co NZ" },
  });

  await prisma.user.upsert({
    where: { email: "owner@example.co.nz" },
    update: {},
    create: { email: "owner@example.co.nz", name: "Demo Owner", role: "ADMIN", tenantId: tenant.id },
  });

  const suppliers = await Promise.all(
    ["Seoul Skincare Ltd", "Kyoto Beauty Imports", "Paris Naturals"].map((name) =>
      prisma.supplier.create({
        data: { name, tenantId: tenant.id, currency: "NZD", email: `${name.toLowerCase().replace(/ /g, "")}@example.com` },
      })
    )
  );

  const customers = await Promise.all(
    ["Ponsonby Pharmacy", "Wellington Spa Co", "Queenstown Wellness"].map((name) =>
      prisma.customer.create({ data: { name, tenantId: tenant.id } })
    )
  );

  const products = [
    { sku: "SKN-001", name: "Hydrating Serum 30ml", price: 39.9 },
    { sku: "SKN-002", name: "Vitamin C Cream 50ml", price: 49.5 },
    { sku: "SKN-003", name: "Snail Mucin Essence 100ml", price: 29.0 },
    { sku: "HAR-001", name: "Argan Hair Oil 100ml", price: 24.0 },
    { sku: "HAR-002", name: "Shampoo Bar", price: 15.0 },
    { sku: "MKP-001", name: "Tinted Lip Balm", price: 12.5 },
    { sku: "MKP-002", name: "Mineral Foundation", price: 58.0 },
    { sku: "BTH-001", name: "Lavender Bath Salts 500g", price: 22.0 },
    { sku: "BTH-002", name: "Rose Body Wash 300ml", price: 18.0 },
    { sku: "ACC-001", name: "Jade Roller", price: 35.0 },
  ];

  for (const [i, p] of products.entries()) {
    await prisma.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        sellPriceNzd: p.price,
        reorderPoint: 5,
        tenantId: tenant.id,
        supplierId: suppliers[i % suppliers.length].id,
        stockLevel: { create: { qty: 50 + i * 5 } },
      },
    });
  }

  console.log("Seeded demo tenant with", products.length, "products");
}

main().finally(() => prisma.$disconnect());
