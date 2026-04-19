/**
 * POST /api/cron/reports
 *
 * Runs all enabled ScheduledReports whose cron expression matches the current
 * time (within a 60-minute window). For each, it generates the report data,
 * builds an HTML email summary, and sends via Resend.
 *
 * Called by the Vercel cron at: 0 * * * * (top of every hour)
 * Uses CRON_SECRET header for auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { getActualsByPeriod, currentFiscalYear, toFiscalPeriod } from "@/lib/reports/margin";
import { getStockOnHand } from "@/lib/reports/inventory";
import { getExpiryTracker } from "@/lib/reports/inventory";
import { getReorderPlanner } from "@/lib/reports/supplier";
import { formatNzd } from "@/lib/utils";

const FROM_EMAIL = process.env.REPORT_FROM_EMAIL ?? "reports@regionalhealth.co.nz";

// ─── Cron match helper ─────────────────────────────────────────────────────────

function cronMatches(expr: string, now: Date): boolean {
  try {
    const [minute, hour, dom, month, dow] = expr.split(" ");
    const match = (field: string, val: number) => {
      if (field === "*") return true;
      if (field.includes(",")) return field.split(",").map(Number).includes(val);
      if (field.includes("-")) {
        const [lo, hi] = field.split("-").map(Number);
        return val >= lo && val <= hi;
      }
      if (field.includes("/")) {
        const [, step] = field.split("/").map(Number);
        return val % step === 0;
      }
      return Number(field) === val;
    };
    return (
      match(minute, now.getMinutes()) &&
      match(hour, now.getHours()) &&
      match(dom, now.getDate()) &&
      match(month, now.getMonth() + 1) &&
      match(dow, now.getDay())
    );
  } catch {
    return false;
  }
}

// ─── Report email builders ─────────────────────────────────────────────────────

async function buildEmailHtml(reportKey: string, tenantId: string, period: string): Promise<string> {
  const fy = currentFiscalYear();

  switch (reportKey) {
    case "monthly-sales": {
      const actuals = await getActualsByPeriod({ tenantId }, fy);
      const { period: p } = toFiscalPeriod(new Date());
      const ytd = actuals.slice(0, p);
      const ytdSales = ytd.reduce((s, r) => s + r.salesNzd, 0);
      const ytdMargin = ytd.reduce((s, r) => s + r.grossMarginNzd, 0);
      const ytdMarginPct = ytdSales > 0 ? (ytdMargin / ytdSales) * 100 : 0;
      const thisMonth = actuals[p - 1];
      return emailTemplate(
        "Monthly Sales Analysis",
        period,
        [
          { label: "YTD Sales", value: formatNzd(ytdSales) },
          { label: "YTD Gross Margin", value: formatNzd(ytdMargin) },
          { label: "Margin %", value: `${ytdMarginPct.toFixed(1)}%` },
          { label: `${thisMonth?.label ?? "—"} Sales`, value: formatNzd(thisMonth?.salesNzd ?? 0) },
        ],
        `<p>Full report available in <a href="${process.env.NEXT_PUBLIC_APP_URL}/reports/monthly-sales?fy=${fy}">the app</a>.</p>`
      );
    }

    case "stock-on-hand": {
      const rows = await getStockOnHand(tenantId);
      const totalValue = rows.reduce((s, r) => s + r.valueNzd, 0);
      const lowStock = rows.filter((r) => r.belowReorder);
      return emailTemplate(
        "Stock on Hand",
        period,
        [
          { label: "Total SKUs", value: rows.length.toString() },
          { label: "Cost Value", value: formatNzd(totalValue) },
          { label: "Below Re-order", value: lowStock.length.toString() },
        ],
        lowStock.length > 0
          ? `<p><strong>${lowStock.length} products</strong> below re-order point: ${lowStock.slice(0, 5).map((r) => r.sku).join(", ")}${lowStock.length > 5 ? "..." : ""}</p>`
          : "<p>All products above re-order points. ✓</p>"
      );
    }

    case "expiry-tracker": {
      const rows = await getExpiryTracker(tenantId);
      const red = rows.filter((r) => r.rag === "RED");
      const amber = rows.filter((r) => r.rag === "AMBER");
      return emailTemplate(
        "Expiry Tracker",
        period,
        [
          { label: "🔴 Critical (≤60 days)", value: red.length.toString() },
          { label: "🟡 Warning (≤180 days)", value: amber.length.toString() },
          { label: "At-risk Value", value: formatNzd(rows.filter((r) => r.rag !== "GREEN").reduce((s, r) => s + r.valueNzd, 0)) },
        ],
        red.length > 0
          ? `<p>⚠️ <strong>Action required:</strong> ${red.length} batch(es) expire within 60 days.</p>`
          : "<p>No batches expire within 60 days. ✓</p>"
      );
    }

    case "reorder-planner": {
      const rows = await getReorderPlanner(tenantId, fy);
      return emailTemplate(
        "Re-order Planner",
        period,
        [
          { label: "SKUs to Re-order", value: rows.length.toString() },
          { label: "Suggested Order Value", value: formatNzd(rows.reduce((s, r) => s + r.suggestedOrderValueNzd, 0)) },
        ],
        rows.length > 0
          ? `<p>${rows.length} products need ordering: ${rows.slice(0, 5).map((r) => r.sku).join(", ")}${rows.length > 5 ? "..." : ""}</p>`
          : "<p>All stock levels healthy. ✓</p>"
      );
    }

    default: {
      return emailTemplate(
        reportKey,
        period,
        [],
        `<p>View the full report in <a href="${process.env.NEXT_PUBLIC_APP_URL}/reports/${reportKey}">the app</a>.</p>`
      );
    }
  }
}

function emailTemplate(
  title: string,
  period: string,
  kpis: { label: string; value: string }[],
  body: string
): string {
  const kpiHtml = kpis.map((k) =>
    `<td style="text-align:center;padding:12px 16px;background:#f0f6ff;border-radius:4px;">
      <div style="font-size:11px;color:#666;margin-bottom:4px">${k.label}</div>
      <div style="font-size:20px;font-weight:700;color:#1e3a5f">${k.value}</div>
    </td>`
  ).join("<td style='width:8px'></td>");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a1a;background:#f8fafc;margin:0;padding:0">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
    <!-- Header -->
    <div style="background:#1e3a5f;padding:24px 32px">
      <div style="color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Regional Health Ltd</div>
      <div style="color:#fff;font-size:22px;font-weight:700">${title}</div>
      <div style="color:#93c5fd;font-size:12px;margin-top:4px">${period}</div>
    </div>
    <!-- KPI strip -->
    ${kpis.length > 0 ? `<div style="padding:20px 32px"><table style="width:100%;border-collapse:separate;border-spacing:8px 0"><tr>${kpiHtml}</tr></table></div>` : ""}
    <!-- Body -->
    <div style="padding:16px 32px 24px;font-size:13px;color:#374151;line-height:1.6">${body}</div>
    <!-- Footer -->
    <div style="background:#f0f6ff;padding:16px 32px;font-size:11px;color:#6b7280;border-top:1px solid #dbeafe">
      <p style="margin:0">This report was automatically generated by Regional Health Ltd's inventory system.</p>
      <p style="margin:4px 0 0"><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/reports" style="color:#2563eb">Manage report schedules</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const period = now.toLocaleString("en-NZ", { month: "short", year: "numeric" });

  const schedules = await prisma.scheduledReport.findMany({
    where: { enabled: true },
  });

  const resend = new Resend(process.env.RESEND_API_KEY ?? "re_placeholder");
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const schedule of schedules) {
    if (!cronMatches(schedule.cronExpr, now)) continue;

    const recipients = schedule.recipients as string[];
    const html = await buildEmailHtml(schedule.reportKey, schedule.tenantId, period);
    const reportLabel = schedule.reportKey.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    for (const email of recipients) {
      try {
        const result = await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: `📊 ${reportLabel} — ${period}`,
          html,
        });

        await prisma.reportDelivery.create({
          data: {
            tenantId: schedule.tenantId,
            reportKey: schedule.reportKey,
            period,
            recipientEmail: email,
            status: "SENT",
            resendId: result.data?.id,
          },
        });
        sent++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        await prisma.reportDelivery.create({
          data: {
            tenantId: schedule.tenantId,
            reportKey: schedule.reportKey,
            period,
            recipientEmail: email,
            status: "FAILED",
            error: errMsg,
          },
        });
        errors.push(`${schedule.reportKey} → ${email}: ${errMsg}`);
        failed++;
      }
    }

    await prisma.scheduledReport.update({
      where: { id: schedule.id },
      data: { lastRunAt: now },
    });
  }

  return NextResponse.json({ ok: true, sent, failed, errors });
}

// Also allow GET for manual testing
export async function GET(req: NextRequest) {
  return POST(req);
}
