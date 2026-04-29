import { describe, it, expect } from "vitest";
import { CreateReservationSchema } from "@/lib/schemas/reservations";

describe("CreateReservationSchema", () => {
  it("accepts a minimal reservation", () => {
    expect(
      CreateReservationSchema.safeParse({ productId: "p1", qtyReserved: 5 }).success,
    ).toBe(true);
  });

  it("requires productId", () => {
    expect(CreateReservationSchema.safeParse({ qtyReserved: 5 }).success).toBe(false);
  });

  it("rejects non-positive qtyReserved", () => {
    expect(
      CreateReservationSchema.safeParse({ productId: "p1", qtyReserved: 0 }).success,
    ).toBe(false);
    expect(
      CreateReservationSchema.safeParse({ productId: "p1", qtyReserved: -1 }).success,
    ).toBe(false);
  });

  it("rejects fractional qtyReserved", () => {
    expect(
      CreateReservationSchema.safeParse({ productId: "p1", qtyReserved: 1.5 }).success,
    ).toBe(false);
  });

  it("coerces string qtyReserved", () => {
    const r = CreateReservationSchema.safeParse({ productId: "p1", qtyReserved: "3" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.qtyReserved).toBe(3);
  });

  it("optional: customerId, repId, expiresAt, notes", () => {
    expect(
      CreateReservationSchema.safeParse({
        productId: "p1",
        qtyReserved: 1,
        customerId: null,
        repId: null,
        expiresAt: null,
        notes: null,
      }).success,
    ).toBe(true);

    expect(
      CreateReservationSchema.safeParse({
        productId: "p1",
        qtyReserved: 1,
        customerId: "c1",
        expiresAt: "2026-12-31",
        notes: "rush",
      }).success,
    ).toBe(true);
  });
});
