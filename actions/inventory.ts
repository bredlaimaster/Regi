"use server";
import { z } from "zod";
import { AdjustSchema } from "@/lib/schemas/inventory";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import { applyStockMovement } from "@/lib/inventory";
import type { ActionResult } from "@/lib/types";

export async function adjustStock(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN", "WAREHOUSE"]);
  const parsed = AdjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid" };

  const product = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product) return { ok: false, error: "Product not found" };
  assertTenant(product.tenantId, session.tenantId);

  await prisma.$transaction((tx) =>
    applyStockMovement(tx, {
      tenantId: session.tenantId,
      productId: parsed.data.productId,
      qtyChange: parsed.data.qtyChange,
      type: "ADJUSTMENT",
      notes: parsed.data.notes,
      userId: session.userId,
    })
  );

  revalidatePath("/inventory");
  revalidatePath("/products");
  return { ok: true, data: null };
}
