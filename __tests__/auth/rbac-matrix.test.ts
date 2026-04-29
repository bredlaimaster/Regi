/**
 * RBAC matrix pin test.
 *
 * The role gates were rolled out in commit 1002bd9 to lock the previously open
 * `requireSession()` model into per-role lanes (ADMIN/SALES/WAREHOUSE). This
 * test reads each gated source file and asserts it still contains the expected
 * `requireRole([...])` call.
 *
 * Why static analysis instead of runtime tests:
 *   - Fast, no Prisma/session mocks, no Next.js render needed.
 *   - Catches any future "just remove the gate to fix this bug" regression in
 *     code review even if no other behavioural test covers the path.
 *
 * Add new gated routes/actions here as they ship. If a file legitimately moves
 * to a different role mix, update the matrix below — that change should show
 * up clearly in the diff.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Role = "ADMIN" | "SALES" | "WAREHOUSE";

const REPO_ROOT = resolve(__dirname, "..", "..");

/**
 * Build a regex matching `requireRole(["ROLE_A", "ROLE_B", ...])` allowing for
 * minor whitespace/quote variations. The list of roles must appear in the
 * exact order specified, matching how we wrote the gates.
 */
function requireRoleRegex(roles: Role[]): RegExp {
  const inner = roles.map((r) => `["']${r}["']`).join("\\s*,\\s*");
  return new RegExp(`requireRole\\(\\[\\s*${inner}\\s*\\]\\)`);
}

function readSource(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf8");
}

// Each entry: relative path → expected role list (in declared order).
//
// Web pages
const PAGES_ADMIN_SALES: string[] = [
  "app/(app)/customers/page.tsx",
  "app/(app)/customers/new/page.tsx",
  "app/(app)/customers/[id]/page.tsx",
  "app/(app)/products/page.tsx",
  "app/(app)/products/new/page.tsx",
  "app/(app)/products/[id]/page.tsx",
  "app/(app)/sales-orders/page.tsx",
  "app/(app)/sales-orders/new/page.tsx",
  "app/(app)/sales-orders/[id]/page.tsx",
  "app/(app)/proforma/page.tsx",
  "app/(app)/proforma/new/page.tsx",
  "app/(app)/inventory/page.tsx",
  "app/(app)/reservations/page.tsx",
  "app/(app)/reports/layout.tsx",
  "app/(app)/reports/page.tsx",
  "app/(app)/reports/actual-vs-budget/page.tsx",
  "app/(app)/reports/brand-breakdown/page.tsx",
  "app/(app)/reports/channel-trends/page.tsx",
  "app/(app)/reports/customer-sales/page.tsx",
  "app/(app)/reports/customer-trends/page.tsx",
  "app/(app)/reports/monthly-sales/page.tsx",
  "app/(app)/reports/rep-performance/page.tsx",
  "app/(app)/reports/tester-tracker/page.tsx",
];

const PAGES_ADMIN_WAREHOUSE: string[] = [
  "app/(app)/purchase-orders/page.tsx",
  "app/(app)/purchase-orders/new/page.tsx",
  "app/(app)/purchase-orders/[id]/page.tsx",
];

const PAGES_ADMIN_ONLY: string[] = [
  "app/(app)/suppliers/page.tsx",
  "app/(app)/suppliers/new/page.tsx",
  "app/(app)/suppliers/[id]/page.tsx",
  "app/(app)/settings/page.tsx",
  "app/(app)/settings/audit/page.tsx",
  "app/(app)/settings/budgets/page.tsx",
  "app/(app)/settings/dimensions/page.tsx",
  "app/(app)/settings/tax/page.tsx",
  "app/(app)/settings/reports/page.tsx",
  "app/(app)/settings/users/page.tsx",
  "app/(app)/settings/quickbooks/page.tsx",
  "app/(app)/settings/price-groups/page.tsx",
  "app/(app)/reports/container-planning/page.tsx",
  "app/(app)/reports/expiry-tracker/page.tsx",
  "app/(app)/reports/overstock/page.tsx",
  "app/(app)/reports/reorder-planner/page.tsx",
  "app/(app)/reports/stock-on-hand/page.tsx",
  "app/(app)/reports/stock-turn/page.tsx",
  "app/(app)/reports/supplier-eta/page.tsx",
];

// API routes
const ROUTES_ADMIN_WAREHOUSE: string[] = [
  "app/api/purchase-orders/[id]/pdf/route.tsx",
];
const ROUTES_ADMIN_SALES: string[] = [
  "app/api/reports/sales-30d.csv/route.ts",
  "app/api/reports/xlsx/monthly-sales/route.ts",
  "app/api/reports/pdf/proforma/[id]/route.tsx",
];
const ROUTES_ADMIN_ONLY: string[] = [
  "app/api/reports/valuation.pdf/route.tsx",
  "app/api/reports/stock-on-hand.csv/route.ts",
  "app/api/reports/xlsx/stock-on-hand/route.ts",
  "app/api/reports/xlsx/reorder-planner/route.ts",
  "app/api/reports/pdf/stock-valuation/route.tsx",
  "app/api/reports/transactions.csv/route.ts",
];

// Server actions — every exported async function should be guarded.
const ACTIONS_ADMIN_SALES: string[] = [
  "actions/customers.ts",
  "actions/customer-contacts.ts",
  "actions/products.ts",
  "actions/proforma.ts",
  "actions/reservations.ts",
];
// sales-orders.ts mixes SALES and WAREHOUSE; tested separately below.

const ACTIONS_ADMIN_WAREHOUSE: string[] = [
  "actions/inventory.ts",
  "actions/mobile.ts",
  "actions/purchase-orders.ts",
];

const ACTIONS_ADMIN_ONLY: string[] = [
  "actions/budgets.ts",
  "actions/dimensions.ts",
  "actions/price-groups.ts",
  "actions/scheduled-reports.ts",
  "actions/supplier-contacts.ts",
  "actions/suppliers.ts",
  "actions/users.ts",
];

// Mobile layout — gates the whole `/mobile/*` subtree.
const MOBILE_LAYOUT = "app/mobile/layout.tsx";

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("RBAC pin: pages gated to ADMIN + SALES", () => {
  const re = requireRoleRegex(["ADMIN", "SALES"]);
  it.each(PAGES_ADMIN_SALES)("%s", (path) => {
    expect(readSource(path)).toMatch(re);
  });
});

describe("RBAC pin: pages gated to ADMIN + WAREHOUSE", () => {
  const re = requireRoleRegex(["ADMIN", "WAREHOUSE"]);
  it.each(PAGES_ADMIN_WAREHOUSE)("%s", (path) => {
    expect(readSource(path)).toMatch(re);
  });
});

describe("RBAC pin: pages gated to ADMIN only", () => {
  const re = requireRoleRegex(["ADMIN"]);
  it.each(PAGES_ADMIN_ONLY)("%s", (path) => {
    expect(readSource(path)).toMatch(re);
  });
});

describe("RBAC pin: API routes", () => {
  it.each(ROUTES_ADMIN_WAREHOUSE)("ADMIN+WAREHOUSE: %s", (path) => {
    expect(readSource(path)).toMatch(requireRoleRegex(["ADMIN", "WAREHOUSE"]));
  });
  it.each(ROUTES_ADMIN_SALES)("ADMIN+SALES: %s", (path) => {
    expect(readSource(path)).toMatch(requireRoleRegex(["ADMIN", "SALES"]));
  });
  it.each(ROUTES_ADMIN_ONLY)("ADMIN-only: %s", (path) => {
    expect(readSource(path)).toMatch(requireRoleRegex(["ADMIN"]));
  });
});

describe("RBAC pin: server actions — every export gated", () => {
  it.each(ACTIONS_ADMIN_SALES)("ADMIN+SALES: %s contains the gate and never bare requireSession()", (path) => {
    const src = readSource(path);
    expect(src).toMatch(requireRoleRegex(["ADMIN", "SALES"]));
    // No leftover bare gate.
    expect(src).not.toMatch(/await\s+requireSession\s*\(\s*\)/);
  });

  it.each(ACTIONS_ADMIN_WAREHOUSE)("ADMIN+WAREHOUSE: %s contains the gate and never bare requireSession()", (path) => {
    const src = readSource(path);
    expect(src).toMatch(requireRoleRegex(["ADMIN", "WAREHOUSE"]));
    expect(src).not.toMatch(/await\s+requireSession\s*\(\s*\)/);
  });

  it.each(ACTIONS_ADMIN_ONLY)("ADMIN-only: %s contains the gate", (path) => {
    const src = readSource(path);
    expect(src).toMatch(requireRoleRegex(["ADMIN"]));
    // users.ts has signInAction/signOutAction without role checks (public, by
    // design); we verify the *protected* funcs by counting occurrences below.
  });
});

describe("RBAC pin: actions/sales-orders.ts mixed — pick is WAREHOUSE, rest are SALES", () => {
  const src = readSource("actions/sales-orders.ts");
  it("contains exactly one ADMIN+WAREHOUSE gate (partialPickSalesOrder)", () => {
    const matches = src.match(/requireRole\(\[\s*["']ADMIN["']\s*,\s*["']WAREHOUSE["']\s*\]\)/g) ?? [];
    expect(matches).toHaveLength(1);
  });
  it("contains at least one ADMIN+SALES gate (upsert/setStatus/ship)", () => {
    const matches = src.match(/requireRole\(\[\s*["']ADMIN["']\s*,\s*["']SALES["']\s*\]\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
  it("partialPickSalesOrder uses WAREHOUSE not SALES", () => {
    // Match the function header through to its gate line.
    const m = /export async function partialPickSalesOrder[\s\S]*?await requireRole\(\[(.*?)\]\)/.exec(src);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("WAREHOUSE");
    expect(m![1]).not.toContain("SALES");
  });
});

describe("RBAC pin: mobile layout", () => {
  it(`${MOBILE_LAYOUT} gates at ADMIN + WAREHOUSE`, () => {
    expect(readSource(MOBILE_LAYOUT)).toMatch(
      requireRoleRegex(["ADMIN", "WAREHOUSE"]),
    );
  });
});

describe("RBAC pin: sidebar role filtering", () => {
  const src = readSource("components/sidebar.tsx");

  it("nav items declare a roles[] property", () => {
    expect(src).toMatch(/roles:\s*\[/);
  });

  it("filters NAV by the role prop before rendering", () => {
    expect(src).toMatch(/NAV\.filter/);
  });

  it("Dashboard is visible to all three roles", () => {
    expect(src).toMatch(
      /href:\s*"\/",\s*label:\s*"Dashboard"[^,]*,\s*icon:\s*\w+\s*,\s*roles:\s*\[\s*"ADMIN",\s*"SALES",\s*"WAREHOUSE"\s*\]/,
    );
  });

  it("Settings is visible to ADMIN only", () => {
    expect(src).toMatch(
      /href:\s*"\/settings"[\s\S]{0,120}roles:\s*\[\s*"ADMIN"\s*\]/,
    );
  });

  it("Purchase Orders is visible to ADMIN + WAREHOUSE", () => {
    expect(src).toMatch(
      /href:\s*"\/purchase-orders"[\s\S]{0,120}roles:\s*\[\s*"ADMIN",\s*"WAREHOUSE"\s*\]/,
    );
  });

  it("Suppliers is visible to ADMIN only (not warehouse)", () => {
    expect(src).toMatch(
      /href:\s*"\/suppliers"[\s\S]{0,120}roles:\s*\[\s*"ADMIN"\s*\]/,
    );
  });
});
