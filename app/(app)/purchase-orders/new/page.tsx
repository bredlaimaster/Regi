import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PoForm } from "@/components/forms/po-form";
import { getLatestRatesAll } from "@/lib/fx";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

export default async function NewPoPage() {
  const session = await requireSession();
  const [suppliers, products, rates] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    getLatestRatesAll(),
  ]);

  // Serialise Date objects before sending to a Client Component.
  const ratesForClient = Object.fromEntries(
    SUPPORTED_CURRENCIES.map((c) => [c, { nzdPerUnit: rates[c].nzdPerUnit, date: rates[c].date.toISOString() }])
  ) as Record<(typeof SUPPORTED_CURRENCIES)[number], { nzdPerUnit: number; date: string }>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-4">New purchase order</h1>
      <PoForm
        suppliers={suppliers}
        products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name }))}
        rates={ratesForClient}
      />
    </div>
  );
}
