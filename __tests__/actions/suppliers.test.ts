import { describe, it, expect } from "vitest";
import {
  AddressSchema,
  Schema as SupplierSchema,
} from "@/lib/schemas/suppliers";

describe("supplier AddressSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(AddressSchema.safeParse({}).success).toBe(true);
  });

  it("accepts null", () => {
    expect(AddressSchema.safeParse(null).success).toBe(true);
  });

  it("accepts a typical address", () => {
    expect(
      AddressSchema.safeParse({
        line1: "10 Quay St",
        city: "Auckland",
        postcode: "1010",
        country: "NZ",
      }).success,
    ).toBe(true);
  });
});

describe("SupplierSchema", () => {
  const valid = { name: "Acme Importers" };

  it("requires name", () => {
    expect(SupplierSchema.safeParse({ name: "" }).success).toBe(false);
    expect(SupplierSchema.safeParse({}).success).toBe(false);
  });

  it("currency defaults to NZD", () => {
    const r = SupplierSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.currency).toBe("NZD");
  });

  it("taxRule defaults to GST15", () => {
    const r = SupplierSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.taxRule).toBe("GST15");
  });

  it("only allows known taxRule values", () => {
    for (const rule of ["GST15", "ZERO", "IMPORT_GST", "EXEMPT"]) {
      expect(SupplierSchema.safeParse({ ...valid, taxRule: rule }).success).toBe(true);
    }
    expect(SupplierSchema.safeParse({ ...valid, taxRule: "MAYBE" }).success).toBe(false);
  });

  it("accepts empty-string email", () => {
    expect(SupplierSchema.safeParse({ ...valid, email: "" }).success).toBe(true);
  });

  it("rejects malformed email", () => {
    expect(SupplierSchema.safeParse({ ...valid, email: "broken" }).success).toBe(false);
  });

  it("rejects negative minimumOrderValue", () => {
    expect(SupplierSchema.safeParse({ ...valid, minimumOrderValue: -1 }).success).toBe(false);
  });

  it("rejects fractional deliveryLeadDays (must be int)", () => {
    expect(SupplierSchema.safeParse({ ...valid, deliveryLeadDays: 1.5 }).success).toBe(false);
  });

  it("accepts nested addresses", () => {
    expect(
      SupplierSchema.safeParse({
        ...valid,
        postalAddress: { line1: "Box 99" },
        physicalAddress: { line1: "1 Site Rd" },
      }).success,
    ).toBe(true);
  });
});
