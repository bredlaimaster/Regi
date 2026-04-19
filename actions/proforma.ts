"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";
import { formatDocNumber } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";
import { PROFORMA_EXPIRY_DAYS } from "@/lib/constants";

/** Create a proforma invoice from a DRAFT or CONFIRMED SO */
export async function createProforma(soId: string): Promise<ActionResult<{ id: string; pfNumber: string }>> {
  const session = await requireSession();

  const so = await prisma.salesOrder.findUnique({
    where: { id: soId },
    include: { proforma: true },
  });
  if (!so) return { ok: false, error: "SO not found" };
  assertTenant(so.tenantId, session.tenantId);
  if (so.status === "CANCELLED") return { ok: false, error: "Cannot create proforma for cancelled order" };
  if (so.proforma) return { ok: true, data: { id: so.proforma.id, pfNumber: so.proforma.pfNumber } };

  const count = await prisma.proformaInvoice.count({ where: { tenantId: session.tenantId } });
  const pfNumber = formatDocNumber("PF", count);

  const pf = await prisma.proformaInvoice.create({
    data: {
      tenantId: session.tenantId,
      soId,
      pfNumber,
      expiresAt: new Date(Date.now() + PROFORMA_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.salesOrder.update({
    where: { id: soId },
    data: { isProforma: true, proformaIssuedAt: new Date() },
  });

  revalidatePath(`/sales-orders/${soId}`);
  revalidatePath("/proforma");
  return { ok: true, data: { id: pf.id, pfNumber: pf.pfNumber } };
}

/** Create a standalone proforma: builds an SO (DRAFT) + proforma in one step. */
export async function createStandaloneProforma(input: unknown): Promise<ActionResult<{ id: string; pfNumber: string }>> {
  const session = await requireSession();

  const schema = z.object({
    customerId: z.string().min(1),
    notes: z.string().optional().nullable(),
    lines: z.array(z.object({
      productId: z.string(),
      qtyOrdered: z.coerce.number().int().positive(),
    })).min(1),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { customerId, notes, lines } = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Customer not found" };
  assertTenant(customer.tenantId, session.tenantId);

  // Look up sell prices using the customer's price group.
  const productIds = lines.map((l) => l.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sellPriceNzd: true },
  });
  const basePriceMap = new Map(products.map((p) => [p.id, Number(p.sellPriceNzd)]));

  const groupPriceMap = new Map<string, { unitPrice: number; minQty: number }[]>();
  if (customer.priceGroupId) {
    const groupPrices = await prisma.productPrice.findMany({
      where: { productId: { in: productIds }, priceGroupId: customer.priceGroupId },
      orderBy: { minQty: "desc" },
    });
    for (const gp of groupPrices) {
      const existing = groupPriceMap.get(gp.productId) ?? [];
      existing.push({ unitPrice: Number(gp.unitPrice), minQty: gp.minQty });
      groupPriceMap.set(gp.productId, existing);
    }
  }

  const resolvedLines = lines.map((l) => {
    const basePrice = basePriceMap.get(l.productId) ?? 0;
    const groupRows = groupPriceMap.get(l.productId);
    const groupPrice = groupRows?.find((gp) => l.qtyOrdered >= gp.minQty);
    return { ...l, unitPrice: groupPrice?.unitPrice ?? basePrice };
  });

  const result = await prisma.$transaction(async (tx) => {
    // Create SO
    const soCount = await tx.salesOrder.count({ where: { tenantId: session.tenantId } });
    const so = await tx.salesOrder.create({
      data: {
        soNumber: formatDocNumber("SO", soCount),
        customerId,
        tenantId: session.tenantId,
        notes,
        isProforma: true,
        proformaIssuedAt: new Date(),
        lines: {
          create: resolvedLines.map((l) => ({
            productId: l.productId,
            qtyOrdered: l.qtyOrdered,
            unitPrice: l.unitPrice,
          })),
        },
      },
    });
    // Create proforma
    const pfCount = await tx.proformaInvoice.count({ where: { tenantId: session.tenantId } });
    const pf = await tx.proformaInvoice.create({
      data: {
        tenantId: session.tenantId,
        soId: so.id,
        pfNumber: formatDocNumber("PF", pfCount),
        expiresAt: new Date(Date.now() + PROFORMA_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    return pf;
  });

  revalidatePath("/proforma");
  revalidatePath("/sales-orders");
  return { ok: true, data: { id: result.id, pfNumber: result.pfNumber } };
}

export async function deleteProforma(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const pf = await prisma.proformaInvoice.findUnique({ where: { id }, include: { salesOrder: true } });
  if (!pf) return { ok: false, error: "Not found" };
  assertTenant(pf.tenantId, session.tenantId);
  await prisma.proformaInvoice.delete({ where: { id } });
  if (pf.salesOrder) {
    await prisma.salesOrder.update({ where: { id: pf.soId }, data: { isProforma: false, proformaIssuedAt: null } });
  }
  revalidatePath("/proforma");
  return { ok: true, data: null };
}
