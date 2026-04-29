import { describe, it, expect } from "vitest";
import {
  LineSchema,
  SoSchema,
  ShipSchema,
  PartialPickSchema,
} from "@/lib/schemas/sales-orders";

describe("SO LineSchema", () => {
  it("accepts a valid line", () => {
    const r = LineSchema.safeParse({ productId: "p1", qtyOrdered: 5 });
    expect(r.success).toBe(true);
  });

  it("coerces string qty from form data", () => {
    const r = LineSchema.safeParse({ productId: "p1", qtyOrdered: "5" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.qtyOrdered).toBe(5);
  });

  it("rejects qty=0", () => {
    expect(LineSchema.safeParse({ productId: "p1", qtyOrdered: 0 }).success).toBe(false);
  });

  it("rejects negative qty", () => {
    expect(LineSchema.safeParse({ productId: "p1", qtyOrdered: -1 }).success).toBe(false);
  });

  it("rejects fractional qty", () => {
    expect(LineSchema.safeParse({ productId: "p1", qtyOrdered: 1.5 }).success).toBe(false);
  });

  it("requires productId", () => {
    expect(LineSchema.safeParse({ qtyOrdered: 1 }).success).toBe(false);
  });
});

describe("SoSchema", () => {
  const validLine = { productId: "p1", qtyOrdered: 1 };

  it("accepts a minimal SO", () => {
    expect(SoSchema.safeParse({ customerId: "c1", lines: [validLine] }).success).toBe(true);
  });

  it("requires at least one line", () => {
    expect(SoSchema.safeParse({ customerId: "c1", lines: [] }).success).toBe(false);
  });

  it("requires customerId", () => {
    expect(SoSchema.safeParse({ lines: [validLine] }).success).toBe(false);
  });

  it("notes is optional and nullable", () => {
    expect(SoSchema.safeParse({ customerId: "c1", lines: [validLine] }).success).toBe(true);
    expect(SoSchema.safeParse({ customerId: "c1", notes: null, lines: [validLine] }).success).toBe(true);
    expect(SoSchema.safeParse({ customerId: "c1", notes: "rush", lines: [validLine] }).success).toBe(true);
  });

  it("id is optional (used for upsert)", () => {
    expect(
      SoSchema.safeParse({ id: "so1", customerId: "c1", lines: [validLine] }).success,
    ).toBe(true);
  });
});

describe("ShipSchema", () => {
  it("requires both id and trackingRef", () => {
    expect(ShipSchema.safeParse({ id: "so1", trackingRef: "TRK-123" }).success).toBe(true);
    expect(ShipSchema.safeParse({ id: "so1" }).success).toBe(false);
    expect(ShipSchema.safeParse({ trackingRef: "TRK-123" }).success).toBe(false);
  });

  it("rejects empty trackingRef", () => {
    expect(ShipSchema.safeParse({ id: "so1", trackingRef: "" }).success).toBe(false);
  });
});

describe("PartialPickSchema", () => {
  it("accepts a minimal partial pick", () => {
    const r = PartialPickSchema.safeParse({
      soId: "so1",
      lines: [{ lineId: "l1", qtyPicking: 5 }],
    });
    expect(r.success).toBe(true);
  });

  it("requires soId", () => {
    expect(
      PartialPickSchema.safeParse({ lines: [{ lineId: "l1", qtyPicking: 1 }] }).success,
    ).toBe(false);
  });

  it("rejects qtyPicking < 1", () => {
    expect(
      PartialPickSchema.safeParse({
        soId: "so1",
        lines: [{ lineId: "l1", qtyPicking: 0 }],
      }).success,
    ).toBe(false);
  });

  it("accepts multiple lines", () => {
    expect(
      PartialPickSchema.safeParse({
        soId: "so1",
        lines: [
          { lineId: "l1", qtyPicking: 1 },
          { lineId: "l2", qtyPicking: 3 },
        ],
      }).success,
    ).toBe(true);
  });
});
