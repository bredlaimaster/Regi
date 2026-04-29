import { describe, it, expect } from "vitest";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_META,
  FOREIGN_CURRENCIES,
  formatCurrency,
  toNzd,
  type Currency,
} from "@/lib/currency";

describe("currency catalogue", () => {
  it("NZD is first in the supported list", () => {
    expect(SUPPORTED_CURRENCIES[0]).toBe("NZD");
  });

  it("supports the five trading currencies", () => {
    expect([...SUPPORTED_CURRENCIES].sort()).toEqual(["AUD", "EUR", "GBP", "NZD", "USD"]);
  });

  it("FOREIGN_CURRENCIES excludes NZD", () => {
    expect(FOREIGN_CURRENCIES).not.toContain("NZD" as never);
    expect(FOREIGN_CURRENCIES).toHaveLength(SUPPORTED_CURRENCIES.length - 1);
  });

  it("every supported currency has metadata", () => {
    for (const code of SUPPORTED_CURRENCIES) {
      const meta = CURRENCY_META[code];
      expect(meta).toBeDefined();
      expect(meta.symbol.length).toBeGreaterThan(0);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.flag.length).toBeGreaterThan(0);
    }
  });
});

describe("formatCurrency", () => {
  it("returns em-dash for null/undefined", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("formats NZD by default with 2 decimals", () => {
    expect(formatCurrency(1234.56)).toContain("1,234.56");
  });

  it("formats zero with 2 decimals", () => {
    expect(formatCurrency(0, "NZD")).toContain("0.00");
  });

  it("accepts a string amount (Prisma Decimal compatibility)", () => {
    expect(formatCurrency("99.99", "USD")).toContain("99.99");
  });

  it("formats USD with 2 decimals", () => {
    expect(formatCurrency(50, "USD")).toContain("50.00");
  });

  it("formats EUR with 2 decimals", () => {
    expect(formatCurrency(50, "EUR")).toContain("50.00");
  });

  it("formats with an unrecognised ISO code (Node Intl tolerates 3-letter codes)", () => {
    // Modern V8/ICU accepts arbitrary 3-letter currency codes via Intl and
    // emits "<CODE><NBSP><amount>". The catch-fallback in formatCurrency only
    // fires for codes Intl actively rejects; in practice it's a defensive
    // belt-and-braces branch that very rarely trips. We just assert the code
    // and amount appear in the output, regardless of which path produced it.
    const result = formatCurrency(12.34, "XYZ");
    expect(result).toContain("XYZ");
    expect(result).toContain("12.34");
  });

  it("really does fall back when Intl rejects the code (1-letter is rejected)", () => {
    // Intl rejects single-letter "currency" codes — the catch branch runs.
    expect(formatCurrency(12.34, "X")).toBe("X 12.34");
  });

  it("rounds to 2 decimals on integer inputs", () => {
    expect(formatCurrency(0)).toMatch(/0\.00/);
    expect(formatCurrency(1)).toMatch(/1\.00/);
  });
});

describe("toNzd — FX conversion + 2-decimal rounding", () => {
  it("identity at fxRate=1", () => {
    expect(toNzd(100, 1)).toBe(100);
    expect(toNzd(123.45, 1)).toBe(123.45);
  });

  it("converts USD→NZD at typical rate", () => {
    expect(toNzd(100, 1.69)).toBe(169);
  });

  it("rounds to cents", () => {
    // 33.33 * 1.69 = 56.3277 → 56.33
    expect(toNzd(33.33, 1.69)).toBe(56.33);
  });

  it("handles zero amount", () => {
    expect(toNzd(0, 1.7)).toBe(0);
  });

  it("handles zero rate (defensive)", () => {
    expect(toNzd(100, 0)).toBe(0);
  });

  it("handles very small amounts without floating point errors", () => {
    // 0.01 * 1.69 = 0.0169 → 0.02
    expect(toNzd(0.01, 1.69)).toBe(0.02);
  });

  it("rounds half-up at 4-decimal threshold", () => {
    expect(toNzd(100, 1.6951)).toBe(169.51);
    expect(toNzd(100, 1.6949)).toBe(169.49);
    expect(toNzd(100, 1.6957)).toBe(169.57);
  });

  it("can produce negative values for credits", () => {
    expect(toNzd(-100, 1.5)).toBe(-150);
  });

  it("type Currency is the union of supported codes (compile-only check)", () => {
    const code: Currency = "NZD";
    expect(SUPPORTED_CURRENCIES).toContain(code);
  });
});
