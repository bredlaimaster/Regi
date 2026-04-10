import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Daily cron: email each tenant admin the list of low-stock products.
 * Uses Supabase's built-in email (via admin invite-by-email fallback) in dev;
 * in prod wire this up to Resend / Postmark.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({ include: { users: { where: { role: "ADMIN" } } } });
  for (const tenant of tenants) {
    const low = await prisma.product.findMany({
      where: { tenantId: tenant.id },
      include: { stockLevel: true },
    });
    const items = low.filter((p) => (p.stockLevel?.qty ?? 0) <= p.reorderPoint);
    if (items.length === 0) continue;

    const to = tenant.users.map((u) => u.email).filter(Boolean);
    if (to.length === 0) continue;

    const body = items.map((p) => `${p.sku} ${p.name}: ${p.stockLevel?.qty ?? 0} / reorder ${p.reorderPoint}`).join("\n");

    // Dev-only stub – replace with your email provider.
    console.log(`[low-stock] tenant=${tenant.name} to=${to.join(",")}\n${body}`);
  }
  return NextResponse.json({ ok: true });
}
