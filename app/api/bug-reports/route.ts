/**
 * POST /api/bug-reports
 *
 * Bearer-token-authenticated endpoint for logging bugs into the
 * Settings → Support tracker from outside the web UI — primarily for
 * automated tests driven by Playwright MCP.
 *
 * Security model:
 *  - Auth: `Authorization: Bearer <BUG_REPORT_API_TOKEN>` from env.
 *    No session cookie required — this route is in middleware's public
 *    allowlist so external tools can post without logging in.
 *  - Tenant: this app is single-tenant in practice; the route picks the
 *    only tenant in the database. If you ever go multi-tenant, mint
 *    one token per tenant and embed the tenantId in env.
 *  - Rate-limiting: not implemented. The token is a shared secret; if
 *    it leaks, rotate it (see docs/playwright-mcp-testing.html).
 *
 * Payload shape mirrors the in-app form: description (required),
 * affectedAreas (canonical keys from lib/bug-areas), optional
 * driveLink (URL) and reporter (free-text).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BUG_AREA_KEYS } from "@/lib/bug-areas";

const ApiCreateBugReportSchema = z.object({
  description: z.string().trim().min(1, "Describe the bug").max(5000),
  affectedAreas: z
    .array(z.enum(BUG_AREA_KEYS as readonly [string, ...string[]]))
    .max(BUG_AREA_KEYS.length)
    .optional()
    .default([]),
  driveLink: z
    .string()
    .trim()
    .max(2048)
    .url()
    .optional()
    .or(z.literal(""))
    .nullable(),
  reporter: z.string().trim().max(120).optional().nullable(),
});

export async function POST(req: NextRequest) {
  // ─── Auth ────────────────────────────────────────────────────────────────
  const expected = process.env.BUG_REPORT_API_TOKEN;
  if (!expected || expected.length < 16) {
    // Fail closed: if the server hasn't been configured with a token, we
    // refuse to write anything regardless of what the client sent.
    return NextResponse.json(
      { ok: false, error: "Server not configured (BUG_REPORT_API_TOKEN unset)" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  if (!provided) {
    return NextResponse.json(
      { ok: false, error: "Missing Authorization: Bearer <token>" },
      { status: 401 },
    );
  }
  // Constant-time comparison would be nicer here; for a private single-tenant
  // app the timing-attack surface is negligible.
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ─── Body ────────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const parsed = ApiCreateBugReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid payload",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  // ─── Tenant resolution (single-tenant in practice) ──────────────────────
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) {
    return NextResponse.json(
      { ok: false, error: "No tenant configured" },
      { status: 500 },
    );
  }

  // ─── Insert ──────────────────────────────────────────────────────────────
  const created = await prisma.bugReport.create({
    data: {
      tenantId: tenant.id,
      description: parsed.data.description,
      affectedAreas: parsed.data.affectedAreas,
      driveLink: parsed.data.driveLink || null,
      reporter: parsed.data.reporter || null,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json(
    {
      ok: true,
      id: created.id,
      createdAt: created.createdAt.toISOString(),
      url: "/settings/support",
    },
    { status: 201 },
  );
}

/** Tiny health-check so testers can verify the token is good without writing. */
export async function GET(req: NextRequest) {
  const expected = process.env.BUG_REPORT_API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Server not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, message: "Token valid" });
}
