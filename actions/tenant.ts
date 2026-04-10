"use server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/types";

const Schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  tenantName: z.string().min(1),
});

export async function createTenant(input: z.infer<typeof Schema>): Promise<ActionResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, error: "User already provisioned" };

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: parsed.data.tenantName } });
    await tx.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        role: "ADMIN",
        tenantId: tenant.id,
      },
    });
  });

  return { ok: true, data: null };
}
