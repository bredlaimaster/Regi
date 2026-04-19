import { describe, it, expect } from "vitest";
import {
  AUTO_REBATE_PCT,
  PROFORMA_EXPIRY_DAYS,
  DASHBOARD_WINDOW_DAYS,
  DEFAULT_PAGE_SIZE,
  FISCAL_YEAR_START_MONTH,
} from "@/lib/constants";

describe("business constants", () => {
  it("AUTO_REBATE_PCT is 2.5%", () => {
    expect(AUTO_REBATE_PCT).toBe(0.025);
  });

  it("PROFORMA_EXPIRY_DAYS is 30", () => {
    expect(PROFORMA_EXPIRY_DAYS).toBe(30);
  });

  it("DASHBOARD_WINDOW_DAYS is 30", () => {
    expect(DASHBOARD_WINDOW_DAYS).toBe(30);
  });

  it("DEFAULT_PAGE_SIZE is positive and reasonable", () => {
    expect(DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
    expect(DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(100);
  });

  it("FISCAL_YEAR_START_MONTH is April (4)", () => {
    expect(FISCAL_YEAR_START_MONTH).toBe(4);
  });
});

describe("financial calculation: auto-rebate", () => {
  it("calculates 2.5% rebate on $1000 subtotal", () => {
    const subtotal = 1000;
    const rebate = Math.round(subtotal * AUTO_REBATE_PCT * 100) / 100;
    expect(rebate).toBe(25);
  });

  it("calculates rebate with cents precision", () => {
    const subtotal = 1234.56;
    const rebate = Math.round(subtotal * AUTO_REBATE_PCT * 100) / 100;
    expect(rebate).toBe(30.86);
  });

  it("handles zero subtotal", () => {
    const subtotal = 0;
    const rebate = Math.round(subtotal * AUTO_REBATE_PCT * 100) / 100;
    expect(rebate).toBe(0);
  });
});

describe("financial calculation: landed cost weighted average", () => {
  it("computes weighted average correctly", () => {
    const existingQty = 100;
    const existingCost = 10.5;
    const newQty = 50;
    const newCost = 12.0;
    const totalQty = existingQty + newQty;
    const newAvg = (existingCost * existingQty + newCost * newQty) / totalQty;
    expect(Math.round(newAvg * 10000) / 10000).toBe(11);
  });

  it("handles first receipt (no existing stock)", () => {
    const existingQty = 0;
    const existingCost = 0;
    const newQty = 50;
    const newCost = 12.0;
    const totalQty = existingQty + newQty;
    const newAvg = totalQty > 0
      ? (existingCost * existingQty + newCost * newQty) / totalQty
      : newCost;
    expect(newAvg).toBe(12.0);
  });

  it("preserves precision to 4 decimal places", () => {
    const existingQty = 33;
    const existingCost = 15.4321;
    const newQty = 17;
    const newCost = 16.7890;
    const totalQty = existingQty + newQty;
    const rawAvg = (existingCost * existingQty + newCost * newQty) / totalQty;
    const rounded = Math.round(rawAvg * 10000) / 10000;
    expect(rounded).toBe(15.8934);
  });
});

describe("financial calculation: freight pro-rata allocation", () => {
  it("allocates freight proportionally across lines", () => {
    const freight = 100;
    const lines = [
      { qtyOrdered: 10, unitCost: 10 }, // subtotal=100 (50%)
      { qtyOrdered: 10, unitCost: 10 }, // subtotal=100 (50%)
    ];
    const subtotal = lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0);
    expect(subtotal).toBe(200);

    const allocations = lines.map((l) => {
      const lineSubtotal = l.qtyOrdered * l.unitCost;
      return (lineSubtotal / subtotal) * freight;
    });
    expect(allocations[0]).toBe(50);
    expect(allocations[1]).toBe(50);
  });

  it("allocates more freight to higher-value lines", () => {
    const freight = 100;
    const lines = [
      { qtyOrdered: 10, unitCost: 30 }, // subtotal=300 (75%)
      { qtyOrdered: 10, unitCost: 10 }, // subtotal=100 (25%)
    ];
    const subtotal = lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0);
    const allocations = lines.map((l) => {
      const lineSubtotal = l.qtyOrdered * l.unitCost;
      return (lineSubtotal / subtotal) * freight;
    });
    expect(allocations[0]).toBe(75);
    expect(allocations[1]).toBe(25);
  });

  it("handles zero subtotal without division error", () => {
    const freight = 100;
    const subtotal = 0;
    const freightAlloc = subtotal > 0 ? (0 / subtotal) * freight : 0;
    expect(freightAlloc).toBe(0);
  });
});

describe("financial calculation: FX conversion rounding", () => {
  it("converts and rounds to 2 decimal places for NZD display", () => {
    const srcAmount = 100;
    const fxRate = 1.693457;
    const nzd = Math.round(srcAmount * fxRate * 100) / 100;
    expect(nzd).toBe(169.35);
  });

  it("converts and rounds to 4 decimal places for unit cost", () => {
    const unitCost = 12.5;
    const fxRate = 1.693457;
    const nzdCost = Math.round(unitCost * fxRate * 10000) / 10000;
    expect(nzdCost).toBe(21.1682);
  });
});
