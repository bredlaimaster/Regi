import { describe, it, expect } from "vitest";
import { formatNzd, formatDocNumber, formatNzDate } from "@/lib/utils";

describe("formatNzd", () => {
  it("formats positive amounts", () => {
    expect(formatNzd(1234.56)).toContain("1,234.56");
  });

  it("formats zero", () => {
    expect(formatNzd(0)).toContain("0.00");
  });

  it("handles string input", () => {
    expect(formatNzd("99.99")).toContain("99.99");
  });

  it("returns dash for null/undefined", () => {
    expect(formatNzd(null)).toBe("—");
    expect(formatNzd(undefined)).toBe("—");
  });

  it("formats negative amounts", () => {
    const result = formatNzd(-50);
    expect(result).toContain("50.00");
  });
});

describe("formatDocNumber", () => {
  it("generates PO-000001 for count=0", () => {
    expect(formatDocNumber("PO", 0)).toBe("PO-000001");
  });

  it("generates SO-000100 for count=99", () => {
    expect(formatDocNumber("SO", 99)).toBe("SO-000100");
  });

  it("generates PF-001000 for count=999", () => {
    expect(formatDocNumber("PF", 999)).toBe("PF-001000");
  });

  it("generates CN-000001 for count=0", () => {
    expect(formatDocNumber("CN", 0)).toBe("CN-000001");
  });

  it("handles large counts", () => {
    expect(formatDocNumber("SO", 999999)).toBe("SO-1000000");
  });
});

describe("formatNzDate", () => {
  it("formats a Date object", () => {
    const date = new Date("2025-06-15T10:00:00Z");
    const result = formatNzDate(date);
    expect(result).toMatch(/15 Jun 2025/);
  });

  it("formats a string date", () => {
    const result = formatNzDate("2025-01-01T00:00:00Z");
    expect(result).toMatch(/01 Jan 2025/);
  });

  it("returns empty string for null/undefined", () => {
    expect(formatNzDate(null)).toBe("");
    expect(formatNzDate(undefined)).toBe("");
  });
});
