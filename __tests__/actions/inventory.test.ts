import { describe, it, expect } from "vitest";
import { AdjustSchema } from "@/lib/schemas/inventory";

describe("AdjustSchema", () => {
  it("accepts a positive adjustment", () => {
    const r = AdjustSchema.safeParse({ productId: "p1", qtyChange: 10, notes: "Recount" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.qtyChange).toBe(10);
  });

  it("accepts a negative adjustment (write-off)", () => {
    const r = AdjustSchema.safeParse({ productId: "p1", qtyChange: -5, notes: "Damage" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.qtyChange).toBe(-5);
  });

  it("requires integer qtyChange", () => {
    expect(
      AdjustSchema.safeParse({ productId: "p1", qtyChange: 1.5, notes: "..." }).success,
    ).toBe(false);
  });

  it("requires non-empty notes (audit trail)", () => {
    expect(
      AdjustSchema.safeParse({ productId: "p1", qtyChange: 1, notes: "" }).success,
    ).toBe(false);
  });

  it("notes error message is 'Reason required'", () => {
    const r = AdjustSchema.safeParse({ productId: "p1", qtyChange: 1, notes: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.flatten().fieldErrors.notes?.[0];
      expect(msg).toBe("Reason required");
    }
  });

  it("requires productId", () => {
    expect(AdjustSchema.safeParse({ qtyChange: 1, notes: "x" }).success).toBe(false);
  });

  it("coerces string qty from form data", () => {
    const r = AdjustSchema.safeParse({ productId: "p1", qtyChange: "-3", notes: "x" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.qtyChange).toBe(-3);
  });
});
