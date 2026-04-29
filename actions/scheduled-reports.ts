"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const CreateSchema = z.object({
  reportKey: z.string().min(1),
  cronExpr: z.string().min(1).regex(/^[\d*\/,\- ]+$/, "Invalid cron expression"),
  recipients: z.array(z.string().email()).min(1).max(20),
});

export async function createScheduledReport(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { reportKey, cronExpr, recipients } = parsed.data;
  const tenantId = session.tenantId;

  await prisma.scheduledReport.create({
    data: { tenantId, reportKey, cronExpr, recipients, enabled: true },
  });
  revalidatePath("/settings/reports");
  return { ok: true, data: null };
}

export async function toggleScheduledReport(id: string, enabled: boolean): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const existing = await prisma.scheduledReport.findUnique({ where: { id } });
  if (!existing) return;
  assertTenant(existing.tenantId, session.tenantId);
  await prisma.scheduledReport.update({ where: { id }, data: { enabled } });
  revalidatePath("/settings/reports");
}

export async function deleteScheduledReport(id: string): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const existing = await prisma.scheduledReport.findUnique({ where: { id } });
  if (!existing) return;
  assertTenant(existing.tenantId, session.tenantId);
  await prisma.scheduledReport.delete({ where: { id } });
  revalidatePath("/settings/reports");
}
