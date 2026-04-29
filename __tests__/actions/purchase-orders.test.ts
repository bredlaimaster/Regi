import { describe, it, expect } from "vitest";
import {
  LineSchema,
  PoSchema,
  PartialReceiveLineSchema,
  ReceiveChargeSchema,
  PartialReceiveSchema,
} from "@/lib/schemas/purchase-orders";

describe("PO LineSchema", () => {
  it("accepts a valid line", () => {
    const r = LineSchema.safeParse({ productId: "p1", qtyOrdered: 10, unitCost: 12.5 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.qtyOrdered).toBe(10);
      expect(r.data.unitCost).toBe(12.5);
    }
  });

  it("coerces string numbers from form input", () => {
    const r = LineSchema.safeParse({ productId: "p1", qtyOrdered: "10", unitCost: "12.50" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(typeof r.data.qtyOrdered).toBe("number");
      expect(r.data.qtyOrdered).toBe(10);
      expect(r.data.unitCost).toBe(12.5);
    }
  });

  it("rejects qty=0 (must be positive)", () => {
    const r = LineSchema.safeParse({ productId: "p1", qtyOrdered: 0, unitCost: 1 });
    expect(r.success).toBe(false);
  });

  it("rejects negative qty", () => {
    const r = LineSchema.safeParse({ productId: "p1", qtyOrdered: -1, unitCost: 1 });
    expect(r.success).toBe(false);
  });

  it("rejects fractional qty (must be integer)", () => {
    const r = LineSchema.safeParse({ productId: "p1", qtyOrdered: 1.5, unitCost: 1 });
    expect(r.success).toBe(false);
  });

  it("accepts unitCost=0 (free goods)", () => {
    const r = LineSchema.safeParse({ productId: "p1", qtyOrdered: 1, unitCost: 0 });
    expect(r.success).toBe(true);
  });

  it("rejects negative unitCost", () => {
    const r = LineSchema.safeParse({ productId: "p1", qtyOrdered: 1, unitCost: -0.01 });
    expect(r.success).toBe(false);
  });

  it("rejects missing productId", () => {
    const r = LineSchema.safeParse({ qtyOrdered: 1, unitCost: 1 });
    expect(r.success).toBe(false);
  });
});

describe("PoSchema", () => {
  const validLine = { productId: "p1", qtyOrdered: 1, unitCost: 1 };

  it("accepts a minimal valid PO", () => {
    const r = PoSchema.safeParse({
      supplierId: "s1",
      currency: "NZD",
      lines: [validLine],
    });
    expect(r.success).toBe(true);
  });

  it("requires at least one line", () => {
    const r = PoSchema.safeParse({ supplierId: "s1", currency: "NZD", lines: [] });
    expect(r.success).toBe(false);
  });

  it("rejects unknown currency", () => {
    const r = PoSchema.safeParse({
      supplierId: "s1",
      currency: "JPY",
      lines: [validLine],
    });
    expect(r.success).toBe(false);
  });

  it("accepts each supported currency", () => {
    for (const c of ["NZD", "USD", "GBP", "EUR", "AUD"]) {
      const r = PoSchema.safeParse({
        supplierId: "s1",
        currency: c,
        lines: [validLine],
      });
      expect(r.success).toBe(true);
    }
  });

  it("freight is optional and nullable", () => {
    const r1 = PoSchema.safeParse({ supplierId: "s1", currency: "NZD", lines: [validLine] });
    const r2 = PoSchema.safeParse({ supplierId: "s1", currency: "NZD", freight: null, lines: [validLine] });
    const r3 = PoSchema.safeParse({ supplierId: "s1", currency: "NZD", freight: 25, lines: [validLine] });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);
  });

  it("rejects negative freight", () => {
    const r = PoSchema.safeParse({
      supplierId: "s1",
      currency: "NZD",
      freight: -5,
      lines: [validLine],
    });
    expect(r.success).toBe(false);
  });

  it("coerces freight from string", () => {
    const r = PoSchema.safeParse({
      supplierId: "s1",
      currency: "NZD",
      freight: "15.50",
      lines: [validLine],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.freight).toBe(15.5);
  });

  it("requires supplierId", () => {
    const r = PoSchema.safeParse({ currency: "NZD", lines: [validLine] });
    expect(r.success).toBe(false);
  });
});

describe("PartialReceiveLineSchema", () => {
  it("accepts a valid receive line", () => {
    const r = PartialReceiveLineSchema.safeParse({
      lineId: "l1",
      productId: "p1",
      qtyReceiving: 5,
    });
    expect(r.success).toBe(true);
  });

  it("requires positive qty", () => {
    const r = PartialReceiveLineSchema.safeParse({
      lineId: "l1",
      productId: "p1",
      qtyReceiving: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects fractional qty", () => {
    const r = PartialReceiveLineSchema.safeParse({
      lineId: "l1",
      productId: "p1",
      qtyReceiving: 0.5,
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional batchCode + expiryDate", () => {
    const r = PartialReceiveLineSchema.safeParse({
      lineId: "l1",
      productId: "p1",
      qtyReceiving: 5,
      batchCode: "B001",
      expiryDate: "2027-04-01",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null batchCode + expiryDate", () => {
    const r = PartialReceiveLineSchema.safeParse({
      lineId: "l1",
      productId: "p1",
      qtyReceiving: 5,
      batchCode: null,
      expiryDate: null,
    });
    expect(r.success).toBe(true);
  });
});

describe("ReceiveChargeSchema", () => {
  it("accepts a typical customs charge", () => {
    const r = ReceiveChargeSchema.safeParse({
      label: "Customs",
      amount: 50,
      taxRate: 0,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.currency).toBe("NZD"); // default
      expect(r.data.taxRate).toBe(0);
    }
  });

  it("requires non-empty label", () => {
    const r = ReceiveChargeSchema.safeParse({ label: "", amount: 50 });
    expect(r.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const r = ReceiveChargeSchema.safeParse({ label: "Customs", amount: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects negative taxRate", () => {
    const r = ReceiveChargeSchema.safeParse({ label: "Customs", amount: 50, taxRate: -5 });
    expect(r.success).toBe(false);
  });

  it("currency default is NZD", () => {
    const r = ReceiveChargeSchema.safeParse({ label: "Customs", amount: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.currency).toBe("NZD");
  });

  it("taxRate default is 0", () => {
    const r = ReceiveChargeSchema.safeParse({ label: "Customs", amount: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.taxRate).toBe(0);
  });
});

describe("PartialReceiveSchema", () => {
  const validLine = { lineId: "l1", productId: "p1", qtyReceiving: 1 };

  it("accepts a minimal partial receive", () => {
    const r = PartialReceiveSchema.safeParse({
      poId: "po1",
      lines: [validLine],
    });
    expect(r.success).toBe(true);
  });

  it("requires at least one line", () => {
    const r = PartialReceiveSchema.safeParse({ poId: "po1", lines: [] });
    expect(r.success).toBe(false);
  });

  it("freightOverride is optional and nullable", () => {
    const r1 = PartialReceiveSchema.safeParse({ poId: "po1", lines: [validLine] });
    const r2 = PartialReceiveSchema.safeParse({ poId: "po1", lines: [validLine], freightOverride: null });
    const r3 = PartialReceiveSchema.safeParse({ poId: "po1", lines: [validLine], freightOverride: 100 });
    expect(r1.success && r2.success && r3.success).toBe(true);
  });

  it("rejects negative freightOverride", () => {
    const r = PartialReceiveSchema.safeParse({
      poId: "po1",
      lines: [validLine],
      freightOverride: -1,
    });
    expect(r.success).toBe(false);
  });

  it("charges array is optional", () => {
    const r = PartialReceiveSchema.safeParse({
      poId: "po1",
      lines: [validLine],
      charges: [{ label: "Customs", amount: 50, taxRate: 15 }],
    });
    expect(r.success).toBe(true);
  });
});
