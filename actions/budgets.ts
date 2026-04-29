"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const MONTH_MAP: Record<string, number> = {
  apr: 1, may: 2, jun: 3, jul: 4, aug: 5, sep: 6,
  oct: 7, nov: 8, dec: 9, jan: 10, feb: 11, mar: 12,
};

const VALID_LINE_TYPES = ["SALES", "COGS", "GROSS_MARGIN", "FREIGHT_IN", "FREIGHT_OUT", "MARKETING", "REBATE"];

const UploadSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2099),
  tsv: z.string().min(1),
});

export async function uploadBudget(
  input: unknown
): Promise<ActionResult<{ inserted: number; skipped: number }>> {
  const session = await requireRole(["ADMIN"]);
  const parsed = UploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { fiscalYear, tsv } = parsed.data;
  const tenantId = session.tenantId;

  // Get dimension maps for name→id lookup
  const [brands, channels, territories, users] = await Promise.all([
    prisma.brand.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.channel.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.territory.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, email: true } }),
  ]);

  const brandMap = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));
  const channelMap = new Map(channels.map((c) => [c.name.toLowerCase(), c.id]));
  const territoryMap = new Map(territories.map((t) => [t.name.toLowerCase(), t.id]));
  const repMap = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

  const lines = tsv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("period")); // strip header row if present

  let inserted = 0;
  let skipped = 0;

  for (const line of lines) {
    const parts = line.split(/\t|,/).map((p) => p.trim());
    if (parts.length < 3) { skipped++; continue; }

    const [periodRaw, lineTypeRaw, amtRaw, brandRaw, channelRaw, territoryRaw, repRaw] = parts;

    // Parse period
    let period: number;
    const periodNum = parseInt(periodRaw ?? "");
    if (!isNaN(periodNum) && periodNum >= 1 && periodNum <= 12) {
      period = periodNum;
    } else {
      const mapped = MONTH_MAP[(periodRaw ?? "").toLowerCase().slice(0, 3)];
      if (!mapped) { skipped++; continue; }
      period = mapped;
    }

    const lineType = (lineTypeRaw ?? "").toUpperCase();
    if (!VALID_LINE_TYPES.includes(lineType)) { skipped++; continue; }

    const amountNzd = parseFloat(amtRaw ?? "");
    if (isNaN(amountNzd)) { skipped++; continue; }

    const brandId = brandRaw ? (brandMap.get(brandRaw.toLowerCase()) ?? null) : null;
    const channelId = channelRaw ? (channelMap.get(channelRaw.toLowerCase()) ?? null) : null;
    const territoryId = territoryRaw ? (territoryMap.get(territoryRaw.toLowerCase()) ?? null) : null;
    const repId = repRaw ? (repMap.get(repRaw.toLowerCase()) ?? null) : null;

    try {
      const lt = lineType as "SALES" | "COGS" | "GROSS_MARGIN" | "FREIGHT_IN" | "FREIGHT_OUT" | "MARKETING" | "REBATE";
      const existing = await prisma.budget.findFirst({
        where: { tenantId, fiscalYear, period, lineType: lt, brandId, channelId, territoryId, repId },
      });
      if (existing) {
        await prisma.budget.update({ where: { id: existing.id }, data: { amountNzd } });
      } else {
        await prisma.budget.create({
          data: { tenantId, fiscalYear, period, lineType: lt, amountNzd, brandId, channelId, territoryId, repId },
        });
      }
      inserted++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/settings/budgets");
  revalidatePath("/reports");
  return { ok: true, data: { inserted, skipped } };
}
