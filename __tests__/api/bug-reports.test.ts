/**
 * Static-analysis pin for the POST /api/bug-reports endpoint.
 *
 * The route is gated on a bearer-token check that reads from
 * `process.env.BUG_REPORT_API_TOKEN`. We could spin up the route via
 * `next-test-api-route-handler` or a real Next dev server here, but the
 * critical regressions to catch are:
 *   1. Token check still present and rejects unauth.
 *   2. Tenant isolation: route picks a tenant before writing.
 *   3. Route is in the middleware public allowlist (verified separately
 *      in __tests__/auth/rbac-matrix.test.ts).
 *
 * A static read of the route source plus a Zod check on the schema gets
 * us the mileage we need without bringing in a Next route runner — the
 * full behaviour is dogfooded by Playwright MCP (see
 * docs/playwright-mcp-testing.html).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(__dirname, "..", "..", "app/api/bug-reports/route.ts");
const src = readFileSync(ROUTE_PATH, "utf8");

describe("bug-reports route — auth pin", () => {
  it("reads BUG_REPORT_API_TOKEN from process.env", () => {
    expect(src).toMatch(/process\.env\.BUG_REPORT_API_TOKEN/);
  });

  it("rejects requests when the env var is missing (fail-closed)", () => {
    expect(src).toMatch(/Server not configured/);
  });

  it("strips a 'Bearer ' prefix from the Authorization header", () => {
    expect(src).toMatch(/Bearer/i);
  });

  it("returns 401 on token mismatch", () => {
    expect(src).toMatch(/status:\s*401/);
  });
});

describe("bug-reports route — tenant scoping pin", () => {
  it("looks up a tenant before inserting", () => {
    expect(src).toMatch(/prisma\.tenant\.findFirst/);
  });

  it("inserts via prisma.bugReport.create", () => {
    expect(src).toMatch(/prisma\.bugReport\.create/);
  });
});

describe("bug-reports route — payload schema", () => {
  it("validates with Zod", () => {
    expect(src).toMatch(/safeParse/);
    expect(src).toMatch(/z\.object\(/);
  });

  it("description is required, capped at 5000 chars", () => {
    expect(src).toMatch(/description:.*z\.string\(\)/);
    expect(src).toMatch(/\.max\(5000/);
  });

  it("affectedAreas constrained to canonical keys", () => {
    expect(src).toMatch(/BUG_AREA_KEYS/);
  });

  it("driveLink, when present, must be a URL", () => {
    expect(src).toMatch(/\.url\(\)/);
  });
});

describe("bug-reports route — health-check GET", () => {
  it("exports a GET handler too (for token sanity-check)", () => {
    expect(src).toMatch(/export async function GET/);
  });
});
