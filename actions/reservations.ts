"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const CreateReservationSchema = z.object({
  productId: z.string(),
  customerId: z.string().optional().nullable(),
  repId: z.string().optional().nullable(),
  qtyReserved: z.coerce.number().int().positive(),
  expiresAt: z.string().optional().nullable(), // ISO date string
  notes: z.string().optional().nullable(),
});

export async function createReservation(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const parsed = CreateReservationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid reservation data" };

  const { productId, customerId, repId, qtyReserved, expiresAt, notes } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { ok: false, error: "Product not found" };
  assertTenant(product.tenantId, session.tenantId);

  const reservation = await prisma.stockReservation.create({
    data: {
      tenantId: session.tenantId,
      productId,
      customerId: customerId ?? null,
      repId: repId ?? null,
      qtyReserved,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      notes: notes ?? null,
    },
  });

  revalidatePath("/reservations");
  return { ok: true, data: { id: reservation.id } };
}

export async function releaseReservation(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const res = await prisma.stockReservation.findUnique({ where: { id } });
  if (!res) return { ok: false, error: "Not found" };
  assertTenant(res.tenantId, session.tenantId);
  if (res.released) return { ok: false, error: "Already released" };

  await prisma.stockReservation.update({
    where: { id },
    data: { released: true, releasedAt: new Date() },
  });

  revalidatePath("/reservations");
  return { ok: true, data: null };
}

export async function deleteReservation(id: string): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "SALES"]);
  const res = await prisma.stockReservation.findUnique({ where: { id } });
  if (!res) return { ok: false, error: "Not found" };
  assertTenant(res.tenantId, session.tenantId);

  await prisma.stockReservation.delete({ where: { id } });

  revalidatePath("/reservations");
  return { ok: true, data: null };
}
