import { describe, it, expect } from "vitest";
import {
  toFiscalPeriod,
  fiscalPeriodToDates,
  fiscalYearPeriods,
  currentFiscalYear,
} from "@/lib/reports/margin";

// NZ fiscal year: April–March. Period 1 = April, period 12 = March.
// "FY2025" means April 2025 → March 2026.

describe("toFiscalPeriod — calendar date → fiscal year/period", () => {
  it("April 1 is period 1 of the same calendar-year FY", () => {
    expect(toFiscalPeriod(new Date(2025, 3, 1))).toEqual({ fiscalYear: 2025, period: 1 });
  });

  it("April 30 is still period 1", () => {
    expect(toFiscalPeriod(new Date(2025, 3, 30))).toEqual({ fiscalYear: 2025, period: 1 });
  });

  it("December 31 is period 9 (Apr=1, May=2 ... Dec=9)", () => {
    expect(toFiscalPeriod(new Date(2025, 11, 31))).toEqual({ fiscalYear: 2025, period: 9 });
  });

  it("January is period 10 of the prior calendar-year FY", () => {
    expect(toFiscalPeriod(new Date(2026, 0, 15))).toEqual({ fiscalYear: 2025, period: 10 });
  });

  it("March 1 is period 12 of the prior calendar-year FY", () => {
    expect(toFiscalPeriod(new Date(2026, 2, 1))).toEqual({ fiscalYear: 2025, period: 12 });
  });

  it("March 31 is the last day of FY2025", () => {
    expect(toFiscalPeriod(new Date(2026, 2, 31))).toEqual({ fiscalYear: 2025, period: 12 });
  });

  it("April 1 the next year flips to FY2026 period 1", () => {
    expect(toFiscalPeriod(new Date(2026, 3, 1))).toEqual({ fiscalYear: 2026, period: 1 });
  });

  it("each calendar month within FY2025 maps to a unique period 1..12", () => {
    // FY2025 = Apr 2025 → Mar 2026. Build one date per month inside that
    // window and assert every date resolves to fiscalYear=2025 and the 12
    // periods are all distinct.
    const monthsCal: { calYear: number; m: number }[] = [
      { calYear: 2025, m: 3 },  // Apr 2025
      { calYear: 2025, m: 4 },  // May
      { calYear: 2025, m: 5 },  // Jun
      { calYear: 2025, m: 6 },  // Jul
      { calYear: 2025, m: 7 },  // Aug
      { calYear: 2025, m: 8 },  // Sep
      { calYear: 2025, m: 9 },  // Oct
      { calYear: 2025, m: 10 }, // Nov
      { calYear: 2025, m: 11 }, // Dec
      { calYear: 2026, m: 0 },  // Jan 2026 — still FY2025
      { calYear: 2026, m: 1 },  // Feb
      { calYear: 2026, m: 2 },  // Mar — last period
    ];
    const seen = new Set<number>();
    for (const { calYear, m } of monthsCal) {
      const { period, fiscalYear } = toFiscalPeriod(new Date(calYear, m, 15));
      expect(fiscalYear).toBe(2025);
      seen.add(period);
    }
    expect(seen.size).toBe(12);
  });
});

describe("fiscalPeriodToDates — fiscal period → calendar boundaries", () => {
  it("FY2025 period 1 spans Apr 1 → Apr 30", () => {
    const { start, end } = fiscalPeriodToDates(2025, 1);
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(3); // April (0-indexed)
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(3);
    expect(end.getDate()).toBe(30);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });

  it("FY2025 period 9 = December 2025", () => {
    const { start, end } = fiscalPeriodToDates(2025, 9);
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(11); // December
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(31);
  });

  it("FY2025 period 10 = January 2026 (next calendar year)", () => {
    const { start, end } = fiscalPeriodToDates(2025, 10);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0); // January
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(31);
  });

  it("FY2025 period 12 = March 2026 (last period of fiscal year)", () => {
    const { start, end } = fiscalPeriodToDates(2025, 12);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2); // March
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(31);
  });

  it("end date for February respects leap years", () => {
    // FY2023 period 11 = Feb 2024 (leap)
    expect(fiscalPeriodToDates(2023, 11).end.getDate()).toBe(29);
    // FY2024 period 11 = Feb 2025 (non-leap)
    expect(fiscalPeriodToDates(2024, 11).end.getDate()).toBe(28);
  });

  it("toFiscalPeriod and fiscalPeriodToDates are inverses on month-1 boundaries", () => {
    for (let p = 1; p <= 12; p++) {
      const { start } = fiscalPeriodToDates(2025, p);
      const back = toFiscalPeriod(start);
      expect(back).toEqual({ fiscalYear: 2025, period: p });
    }
  });
});

describe("fiscalYearPeriods", () => {
  it("returns exactly 12 periods", () => {
    expect(fiscalYearPeriods(2025)).toHaveLength(12);
  });

  it("periods are numbered 1..12 in order", () => {
    const periods = fiscalYearPeriods(2025);
    expect(periods.map((p) => p.period)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("first period starts April 1, last period ends March 31 next year", () => {
    const periods = fiscalYearPeriods(2025);
    expect(periods[0].start.getMonth()).toBe(3);
    expect(periods[0].start.getDate()).toBe(1);
    expect(periods[11].end.getMonth()).toBe(2);
    expect(periods[11].end.getDate()).toBe(31);
    expect(periods[11].end.getFullYear()).toBe(2026);
  });

  it("periods are contiguous (each starts the day after the previous ends)", () => {
    const periods = fiscalYearPeriods(2025);
    for (let i = 1; i < periods.length; i++) {
      const prevEnd = periods[i - 1].end;
      const thisStart = periods[i].start;
      // prev end is 23:59:59.999 on month-end; next start is 00:00 on month+1.
      const dayAfter = new Date(prevEnd);
      dayAfter.setMilliseconds(dayAfter.getMilliseconds() + 1);
      expect(dayAfter.toDateString()).toBe(thisStart.toDateString());
    }
  });
});

describe("currentFiscalYear", () => {
  it("returns a number that matches the current month's expected FY", () => {
    const today = new Date();
    const m = today.getMonth() + 1;
    const expected = m >= 4 ? today.getFullYear() : today.getFullYear() - 1;
    expect(currentFiscalYear()).toBe(expected);
  });
});
