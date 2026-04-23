import { describe, it, expect } from "vitest";
import { sortLinesByBin } from "@/lib/mobile/sort-by-bin";

describe("sortLinesByBin", () => {
  it("orders lexicographically by bin — which matches aisle walking", () => {
    const lines = [
      { sku: "B", binLocation: "G07A01" },
      { sku: "A", binLocation: "F08B01" },
      { sku: "C", binLocation: "F08B02" },
    ];
    const out = sortLinesByBin(lines);
    expect(out.map((l) => l.sku)).toEqual(["A", "C", "B"]);
  });

  it("puts unallocated bins (null/empty) last", () => {
    const lines = [
      { sku: "A", binLocation: null },
      { sku: "B", binLocation: "F08B01" },
      { sku: "C", binLocation: "" },
      { sku: "D", binLocation: "G07A01" },
    ];
    const out = sortLinesByBin(lines);
    expect(out.map((l) => l.sku)).toEqual(["B", "D", "A", "C"]);
  });

  it("breaks ties by SKU for determinism", () => {
    const lines = [
      { sku: "Z", binLocation: "A01" },
      { sku: "A", binLocation: "A01" },
      { sku: "M", binLocation: "A01" },
    ];
    const out = sortLinesByBin(lines);
    expect(out.map((l) => l.sku)).toEqual(["A", "M", "Z"]);
  });

  it("does not mutate the input", () => {
    const lines = [
      { sku: "B", binLocation: "B" },
      { sku: "A", binLocation: "A" },
    ];
    const before = JSON.stringify(lines);
    sortLinesByBin(lines);
    expect(JSON.stringify(lines)).toBe(before);
  });

  it("handles an empty list", () => {
    expect(sortLinesByBin([])).toEqual([]);
  });

  it("trims whitespace on bin codes", () => {
    const lines = [
      { sku: "A", binLocation: "  B01  " },
      { sku: "B", binLocation: "A01" },
    ];
    const out = sortLinesByBin(lines);
    expect(out.map((l) => l.sku)).toEqual(["B", "A"]);
  });
});
