/**
 * Tax-code resolver tests.
 *
 * The resolver is the most subtle code in the system (per CLAUDE.md). It maps
 * the four app `TaxRule` values onto QBO TaxCode names, with per-rule fallback
 * chains so older NZ files (which use "GST Free Income/Expenses") and newer
 * ones (which use "Zero Rated"/"Zero Rated Expenses") both resolve correctly.
 *
 * We mock `qboFetch` to feed the resolver synthetic TaxCode lists; the
 * resolver's own caching is keyed by tenantId, so each test uses a fresh
 * tenantId to avoid cross-test pollution.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the QBO client BEFORE importing the module under test so the module's
// internal `qboFetch` reference is the mock.
vi.mock("@/lib/quickbooks/client", () => ({
  qboFetch: vi.fn(),
}));

import { qboFetch } from "@/lib/quickbooks/client";
import {
  INCOME_FALLBACKS,
  EXPENSE_FALLBACKS,
  expenseFallbacksForRate,
  resolveTaxCodeId,
  listTaxCodes,
  type TaxRule,
} from "@/lib/quickbooks/tax-codes";

const mockedFetch = qboFetch as unknown as ReturnType<typeof vi.fn>;

/** Build the QBO query response shape from a Name→Id map. */
function asQboResponse(codes: Record<string, string>) {
  return {
    QueryResponse: {
      TaxCode: Object.entries(codes).map(([Name, Id]) => ({ Id, Name })),
    },
  };
}

let counter = 0;
function uniqueTenant(): string {
  return `tenant-${++counter}-${Date.now()}`;
}

beforeEach(() => {
  mockedFetch.mockReset();
});

// ─── Pure data shape ───────────────────────────────────────────────────────────

describe("INCOME_FALLBACKS / EXPENSE_FALLBACKS", () => {
  it("covers every TaxRule on both sides", () => {
    const rules: TaxRule[] = ["GST15", "ZERO", "IMPORT_GST", "EXEMPT"];
    for (const r of rules) {
      expect(INCOME_FALLBACKS[r]).toBeDefined();
      expect(INCOME_FALLBACKS[r].length).toBeGreaterThan(0);
      expect(EXPENSE_FALLBACKS[r]).toBeDefined();
      expect(EXPENSE_FALLBACKS[r].length).toBeGreaterThan(0);
    }
  });

  it("ZERO income tries 'Zero Rated' before older 'GST Free Income'", () => {
    const chain = INCOME_FALLBACKS.ZERO;
    expect(chain.indexOf("Zero Rated")).toBeLessThan(chain.indexOf("GST Free Income"));
  });

  it("IMPORT_GST income is treated as domestic-standard (GST on Income)", () => {
    expect(INCOME_FALLBACKS.IMPORT_GST).toEqual(["GST on Income"]);
  });

  it("IMPORT_GST expense maps to zero-rated codes (overseas supplier doesn't charge NZ GST)", () => {
    expect(EXPENSE_FALLBACKS.IMPORT_GST[0]).toBe("Zero Rated Expenses");
    expect(EXPENSE_FALLBACKS.IMPORT_GST).toContain("GST Free Expenses");
  });

  it("EXEMPT income falls through Out of Scope → Exempt Income → No GST", () => {
    expect(INCOME_FALLBACKS.EXEMPT).toEqual(["Out of Scope", "Exempt Income", "No GST"]);
  });
});

// ─── expenseFallbacksForRate (pure) ───────────────────────────────────────────

describe("expenseFallbacksForRate", () => {
  it("rate >= 15 uses GST15 expense chain", () => {
    expect(expenseFallbacksForRate(15)).toEqual(EXPENSE_FALLBACKS.GST15);
    expect(expenseFallbacksForRate(20)).toEqual(EXPENSE_FALLBACKS.GST15);
  });

  it("rate < 15 uses ZERO expense chain", () => {
    expect(expenseFallbacksForRate(0)).toEqual(EXPENSE_FALLBACKS.ZERO);
    expect(expenseFallbacksForRate(14.99)).toEqual(EXPENSE_FALLBACKS.ZERO);
  });

  it("negative rate is treated as zero-rated (defensive)", () => {
    expect(expenseFallbacksForRate(-1)).toEqual(EXPENSE_FALLBACKS.ZERO);
  });
});

// ─── resolveTaxCodeId — fallback chain ─────────────────────────────────────────

describe("resolveTaxCodeId", () => {
  it("returns the first chain entry that exists in the tenant's QBO file", async () => {
    mockedFetch.mockResolvedValueOnce(
      asQboResponse({
        "Zero Rated": "12",
        "GST Free Income": "8",
      }),
    );
    const result = await resolveTaxCodeId(uniqueTenant(), INCOME_FALLBACKS.ZERO);
    // "Zero Rated" wins because it precedes "GST Free Income" in the chain
    expect(result).toEqual({ id: "12", name: "Zero Rated" });
  });

  it("falls back to a later chain entry when the first is missing", async () => {
    mockedFetch.mockResolvedValueOnce(
      asQboResponse({
        // No "Zero Rated" — older NZ file
        "GST Free Income": "8",
      }),
    );
    const result = await resolveTaxCodeId(uniqueTenant(), INCOME_FALLBACKS.ZERO);
    expect(result).toEqual({ id: "8", name: "GST Free Income" });
  });

  it("falls through the entire chain", async () => {
    mockedFetch.mockResolvedValueOnce(
      asQboResponse({
        // Only the third entry exists
        "Zero Rated Income": "99",
      }),
    );
    const result = await resolveTaxCodeId(uniqueTenant(), INCOME_FALLBACKS.ZERO);
    expect(result).toEqual({ id: "99", name: "Zero Rated Income" });
  });

  it("returns undefined when no candidate matches", async () => {
    mockedFetch.mockResolvedValueOnce(asQboResponse({}));
    const result = await resolveTaxCodeId(uniqueTenant(), INCOME_FALLBACKS.ZERO);
    expect(result).toBeUndefined();
  });

  it("memoises per-tenant — second call hits cache, qboFetch only invoked once", async () => {
    const tenantId = uniqueTenant();
    mockedFetch.mockResolvedValueOnce(asQboResponse({ "GST on Income": "1" }));

    const a = await resolveTaxCodeId(tenantId, INCOME_FALLBACKS.GST15);
    const b = await resolveTaxCodeId(tenantId, INCOME_FALLBACKS.GST15);

    expect(a).toEqual({ id: "1", name: "GST on Income" });
    expect(b).toEqual({ id: "1", name: "GST on Income" });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures — rejected promise lets the next call retry", async () => {
    const tenantId = uniqueTenant();
    mockedFetch.mockRejectedValueOnce(new Error("network glitch"));
    await expect(resolveTaxCodeId(tenantId, INCOME_FALLBACKS.GST15)).rejects.toThrow(/glitch/);

    // Second call gets a clean fetch (succeeds)
    mockedFetch.mockResolvedValueOnce(asQboResponse({ "GST on Income": "9" }));
    const result = await resolveTaxCodeId(tenantId, INCOME_FALLBACKS.GST15);
    expect(result).toEqual({ id: "9", name: "GST on Income" });
  });
});

// ─── listTaxCodes — per-rule resolution map ────────────────────────────────────

describe("listTaxCodes", () => {
  it("resolves every rule when all primary names exist", async () => {
    mockedFetch.mockResolvedValueOnce(
      asQboResponse({
        "GST on Income": "1",
        "GST on Expenses": "2",
        "Zero Rated": "3",
        "Zero Rated Expenses": "4",
        "Out of Scope": "5",
      }),
    );
    const result = await listTaxCodes(uniqueTenant());
    expect(result.income.GST15.resolved).toBe("GST on Income");
    expect(result.income.ZERO.resolved).toBe("Zero Rated");
    expect(result.income.IMPORT_GST.resolved).toBe("GST on Income");
    expect(result.income.EXEMPT.resolved).toBe("Out of Scope");
    expect(result.expense.GST15.resolved).toBe("GST on Expenses");
    expect(result.expense.ZERO.resolved).toBe("Zero Rated Expenses");
    expect(result.expense.IMPORT_GST.resolved).toBe("Zero Rated Expenses");
    expect(result.expense.EXEMPT.resolved).toBe("Out of Scope");
  });

  it("leaves resolved undefined when no chain candidate exists in QBO", async () => {
    mockedFetch.mockResolvedValueOnce(asQboResponse({})); // empty file
    const result = await listTaxCodes(uniqueTenant());
    for (const rule of ["GST15", "ZERO", "IMPORT_GST", "EXEMPT"] as const) {
      expect(result.income[rule].resolved).toBeUndefined();
      expect(result.expense[rule].resolved).toBeUndefined();
    }
  });

  it("returns the available codes alphabetised by name", async () => {
    mockedFetch.mockResolvedValueOnce(
      asQboResponse({
        "Zero Rated": "1",
        "GST on Income": "2",
        "Out of Scope": "3",
      }),
    );
    const result = await listTaxCodes(uniqueTenant());
    expect(result.available.map((c) => c.name)).toEqual([
      "GST on Income",
      "Out of Scope",
      "Zero Rated",
    ]);
  });

  it("preserves the chain in the response (used in Settings UI)", async () => {
    mockedFetch.mockResolvedValueOnce(asQboResponse({ "GST Free Income": "1" }));
    const result = await listTaxCodes(uniqueTenant());
    expect(result.income.ZERO.chain).toEqual(INCOME_FALLBACKS.ZERO);
    // Resolved is the second chain entry, not the first
    expect(result.income.ZERO.resolved).toBe("GST Free Income");
  });
});
