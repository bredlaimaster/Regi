/**
 * Regression pin for the QBO sync code path.
 *
 * History: in May 2026 a real-world QBO push failed with code 6000
 * ("Make sure all your transactions have a GST rate before you save")
 * because `lib/quickbooks/sync.ts` silently omitted `TaxCodeRef` from
 * lines whenever `resolveTaxCodeId` returned undefined. The fix is to
 * fail loudly with an actionable error message naming the offending
 * customer / supplier / charge so the operator knows exactly what to
 * fix in Settings → Tax.
 *
 * This test pins:
 *  - No occurrence of the silent-omit ternary
 *    `(taxCode ? { TaxCodeRef: ... } : {})` (any of the three names).
 *  - Every line that wants a TaxCodeRef now sets it unconditionally.
 *  - A `throw new Error("No QBO TaxCode for ...")` exists for each of
 *    the three resolver outputs (income, expense, receive-charge).
 *
 * Static-analysis-only — keeps the test fast and avoids spinning up a
 * fake QBO + Prisma stack.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SYNC_PATH = resolve(__dirname, "..", "..", "..", "lib/quickbooks/sync.ts");
const src = readFileSync(SYNC_PATH, "utf8");

describe("sync.ts — silent-omit regression pin", () => {
  it("no longer contains `taxCode ? { TaxCodeRef: ... } : {}` for the invoice line", () => {
    expect(src).not.toMatch(/taxCode\s*\?\s*\{\s*TaxCodeRef/);
  });

  it("no longer contains `supplierTaxCode ? { TaxCodeRef: ... } : {}` for bill lines", () => {
    expect(src).not.toMatch(/supplierTaxCode\s*\?\s*\{\s*TaxCodeRef/);
  });

  it("no longer contains `chTaxCode ? { TaxCodeRef: ... } : {}` for receive charges", () => {
    expect(src).not.toMatch(/chTaxCode\s*\?\s*\{\s*TaxCodeRef/);
  });

  it("invoice line sets TaxCodeRef unconditionally", () => {
    // The new code reads `TaxCodeRef: { value: taxCode.id }` (no ternary).
    expect(src).toMatch(/TaxCodeRef:\s*\{\s*value:\s*taxCode\.id\s*\}/);
  });

  it("bill product/freight lines set TaxCodeRef unconditionally", () => {
    expect(src).toMatch(/TaxCodeRef:\s*\{\s*value:\s*supplierTaxCode\.id\s*\}/);
  });

  it("receive-charge lines set TaxCodeRef unconditionally", () => {
    expect(src).toMatch(/TaxCodeRef:\s*\{\s*value:\s*chTaxCode\.id\s*\}/);
  });
});

describe("sync.ts — actionable error messages on resolver miss", () => {
  it("invoice path throws when income tax code can't be resolved", () => {
    expect(src).toMatch(
      /if\s*\(\s*!taxCode\s*\)\s*\{\s*throw new Error/,
    );
    // Names the customer + the rule + the chain it tried.
    expect(src).toMatch(/No QBO TaxCode for income rule/);
    expect(src).toMatch(/Customer.*cannot be invoiced/);
  });

  it("bill path throws when supplier expense tax code can't be resolved", () => {
    expect(src).toMatch(
      /if\s*\(\s*!supplierTaxCode\s*\)\s*\{\s*throw new Error/,
    );
    expect(src).toMatch(/No QBO TaxCode for expense rule/);
    expect(src).toMatch(/Supplier.*cannot be billed/);
  });

  it("receive-charge path throws when its rate-driven code can't be resolved", () => {
    expect(src).toMatch(
      /if\s*\(\s*!chTaxCode\s*\)\s*\{\s*throw new Error/,
    );
    expect(src).toMatch(/No QBO TaxCode for receive charge/);
  });

  it("error messages point operators at Settings → Tax", () => {
    // Two of the three messages mention this; verify at least the invoice one.
    expect(src).toMatch(/Settings\s*→\s*Tax/);
  });
});
