import { describe, it, expect } from "vitest";
import { ContactSchema as CustomerContactSchema } from "@/lib/schemas/customer-contacts";
import { ContactSchema as SupplierContactSchema } from "@/lib/schemas/supplier-contacts";

describe("CustomerContactSchema", () => {
  it("accepts a minimal contact (only customerId required)", () => {
    expect(CustomerContactSchema.safeParse({ customerId: "c1" }).success).toBe(true);
  });

  it("requires customerId", () => {
    expect(CustomerContactSchema.safeParse({}).success).toBe(false);
  });

  it("accepts an empty-string email (form fallback)", () => {
    expect(
      CustomerContactSchema.safeParse({ customerId: "c1", email: "" }).success,
    ).toBe(true);
  });

  it("rejects malformed email", () => {
    expect(
      CustomerContactSchema.safeParse({ customerId: "c1", email: "not-email" }).success,
    ).toBe(false);
  });

  it("accepts a valid email", () => {
    expect(
      CustomerContactSchema.safeParse({ customerId: "c1", email: "ops@example.co.nz" }).success,
    ).toBe(true);
  });
});

describe("SupplierContactSchema", () => {
  it("requires supplierId", () => {
    expect(SupplierContactSchema.safeParse({}).success).toBe(false);
    expect(SupplierContactSchema.safeParse({ supplierId: "s1" }).success).toBe(true);
  });

  it("accepts empty-string email", () => {
    expect(
      SupplierContactSchema.safeParse({ supplierId: "s1", email: "" }).success,
    ).toBe(true);
  });

  it("rejects malformed email", () => {
    expect(
      SupplierContactSchema.safeParse({ supplierId: "s1", email: "broken" }).success,
    ).toBe(false);
  });
});
