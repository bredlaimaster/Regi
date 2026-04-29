import { describe, it, expect } from "vitest";
import {
  cn,
  NZ_TZ,
  formatNzDate,
  formatNzDateTime,
  formatNzd,
  formatDocNumber,
} from "@/lib/utils";

describe("cn — class merging", () => {
  it("joins simple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out falsy entries", () => {
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c");
  });

  it("conflicting tailwind classes — later wins via tailwind-merge", () => {
    // `twMerge` collapses conflicting tailwind utilities to the last one.
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("preserves non-conflicting classes through merge", () => {
    expect(cn("p-2", "text-red-500")).toContain("p-2");
    expect(cn("p-2", "text-red-500")).toContain("text-red-500");
  });
});

describe("NZ_TZ", () => {
  it("is the IANA Pacific/Auckland zone", () => {
    expect(NZ_TZ).toBe("Pacific/Auckland");
  });
});

describe("formatNzDate", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(formatNzDate(null)).toBe("");
    expect(formatNzDate(undefined)).toBe("");
    expect(formatNzDate("")).toBe("");
  });

  it("formats ISO date in NZ timezone using default format", () => {
    // 2025-04-01T12:00:00Z = 2025-04-02 00:00 NZST (UTC+12 in April)
    expect(formatNzDate("2025-04-01T12:00:00Z")).toBe("02 Apr 2025");
  });

  it("formats Date object in NZ timezone", () => {
    expect(formatNzDate(new Date("2025-12-25T00:00:00Z"))).toBe("25 Dec 2025");
  });

  it("uses NZ-local day boundaries — late UTC of Dec 31 still 'Jan 01' in NZ", () => {
    // 2025-12-31T20:00:00Z = 2026-01-01 09:00 NZDT (UTC+13 in summer)
    expect(formatNzDate("2025-12-31T20:00:00Z")).toBe("01 Jan 2026");
  });

  it("respects custom format string", () => {
    expect(formatNzDate("2025-06-15T00:00:00Z", "yyyy-MM-dd")).toBe("2025-06-15");
  });

  it("formats a generic mid-year string", () => {
    expect(formatNzDate("2025-06-15T00:00:00Z")).toMatch(/15 Jun 2025/);
  });
});

describe("formatNzDateTime", () => {
  it("returns empty for null/undefined", () => {
    expect(formatNzDateTime(null)).toBe("");
    expect(formatNzDateTime(undefined)).toBe("");
  });

  it("formats with date + time and AM/PM marker", () => {
    const result = formatNzDateTime("2025-04-15T03:00:00Z"); // 15:00 NZST
    expect(result).toMatch(/^15 Apr 2025, /);
    expect(result.toLowerCase()).toMatch(/[ap]m$/);
  });
});

describe("formatNzd", () => {
  it("returns em-dash for null/undefined", () => {
    expect(formatNzd(null)).toBe("—");
    expect(formatNzd(undefined)).toBe("—");
  });

  it("formats positive values with NZ locale and 2 decimals", () => {
    expect(formatNzd(1234.56)).toContain("1,234.56");
  });

  it("formats zero with 2 decimals", () => {
    expect(formatNzd(0)).toContain("0.00");
  });

  it("rounds to 2 decimals", () => {
    expect(formatNzd(12.345)).toMatch(/12\.\d{2}/);
  });

  it("accepts string inputs (Prisma Decimal serialises as string)", () => {
    expect(formatNzd("99.50")).toContain("99.50");
  });

  it("formats negative values", () => {
    expect(formatNzd(-50)).toMatch(/-?50\.00/);
  });
});

describe("formatDocNumber", () => {
  it("zero-pads count+1 to 6 digits with prefix", () => {
    expect(formatDocNumber("PO", 0)).toBe("PO-000001");
    expect(formatDocNumber("SO", 122)).toBe("SO-000123");
    expect(formatDocNumber("PF", 999998)).toBe("PF-999999");
  });

  it("handles all four prefixes", () => {
    expect(formatDocNumber("PO", 5)).toBe("PO-000006");
    expect(formatDocNumber("SO", 99)).toBe("SO-000100");
    expect(formatDocNumber("PF", 999)).toBe("PF-001000");
    expect(formatDocNumber("CN", 0)).toBe("CN-000001");
  });

  it("does not collapse when count exceeds 6 digits", () => {
    expect(formatDocNumber("SO", 999999)).toBe("SO-1000000");
  });
});
