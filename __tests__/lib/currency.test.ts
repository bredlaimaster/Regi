import { describe, it, expect } from "vitest";
import { formatCurrency, toNzd, SUPPORTED_CURRENCIES, FOREIGN_CURRENCIES } from "@/lib/currency";

describe("formatCurrency", () => {
  it("formats NZD amounts correctly", () => {
    const result = formatCurrency(1234.56, "NZD");
    expect(result).toContain("1,234.56");
  });

  it("handles zero", () => {
    const result = formatCurrency(0, "NZD");
    expect(result).toContain("0.00");
  });

  it("handles null/undefined as dash", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("handles string amounts", () => {
    const result = formatCurrency("99.99", "USD");
    expect(result).toContain("99.99");
  });

  it("handles invalid currency gracefully", () => {
    const result = formatCurrency(100, "INVALID");
    expect(result).toContain("100.00");
  });
});

describe("toNzd", () => {
  it("converts with fxRate=1 (NZD→NZD)", () => {
    expect(toNzd(100, 1)).toBe(100);
  });

  it("converts USD to NZD at 1.69 rate", () => {
    expect(toNzd(100, 1.69)).toBe(169);
  });

  it("rounds to 2 decimal places", () => {
    // 33.33 * 1.69 = 56.3277 → 56.33
    expect(toNzd(33.33, 1.69)).toBe(56.33);
  });

  it("handles zero amount", () => {
    expect(toNzd(0, 1.69)).toBe(0);
  });

  it("handles zero rate", () => {
    expect(toNzd(100, 0)).toBe(0);
  });

  it("handles very small amounts without floating point errors", () => {
    // 0.01 * 1.69 = 0.0169 → 0.02
    expect(toNzd(0.01, 1.69)).toBe(0.02);
  });
});

describe("SUPPORTED_CURRENCIES", () => {
  it("includes NZD as first element", () => {
    expect(SUPPORTED_CURRENCIES[0]).toBe("NZD");
  });

  it("includes all expected currencies", () => {
    expect(SUPPORTED_CURRENCIES).toContain("NZD");
    expect(SUPPORTED_CURRENCIES).toContain("USD");
    expect(SUPPORTED_CURRENCIES).toContain("GBP");
    expect(SUPPORTED_CURRENCIES).toContain("EUR");
    expect(SUPPORTED_CURRENCIES).toContain("AUD");
  });

  it("FOREIGN_CURRENCIES excludes NZD", () => {
    expect(FOREIGN_CURRENCIES).not.toContain("NZD");
    expect(FOREIGN_CURRENCIES.length).toBe(SUPPORTED_CURRENCIES.length - 1);
  });
});
