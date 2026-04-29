import { describe, it, expect } from "vitest";
import {
  AddressSchema,
  ShipToSchema,
  Schema as CustomerSchema,
} from "@/lib/schemas/customers";

describe("AddressSchema (customers)", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(AddressSchema.safeParse({}).success).toBe(true);
  });

  it("accepts null", () => {
    expect(AddressSchema.safeParse(null).success).toBe(true);
  });

  it("accepts undefined (entire field optional)", () => {
    expect(AddressSchema.safeParse(undefined).success).toBe(true);
  });

  it("accepts a fully populated address", () => {
    const r = AddressSchema.safeParse({
      name: "Site A",
      line1: "123 Queen St",
      line2: "Level 4",
      suburb: "CBD",
      city: "Auckland",
      state: "AKL",
      postcode: "1010",
      country: "NZ",
    });
    expect(r.success).toBe(true);
  });
});

describe("ShipToSchema", () => {
  it("accepts a minimal ship-to", () => {
    expect(ShipToSchema.safeParse({}).success).toBe(true);
  });

  it("obsolete defaults to undefined when omitted", () => {
    const r = ShipToSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.obsolete).toBeUndefined();
  });

  it("accepts obsolete=true", () => {
    const r = ShipToSchema.safeParse({ obsolete: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.obsolete).toBe(true);
  });
});

describe("CustomerSchema", () => {
  const valid = { name: "Acme Co" };

  it("accepts the minimum required: name", () => {
    expect(CustomerSchema.safeParse(valid).success).toBe(true);
  });

  it("requires name (min length 1)", () => {
    expect(CustomerSchema.safeParse({ name: "" }).success).toBe(false);
    expect(CustomerSchema.safeParse({}).success).toBe(false);
  });

  it("currency defaults to NZD", () => {
    const r = CustomerSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.currency).toBe("NZD");
  });

  it("taxRule defaults to GST15", () => {
    const r = CustomerSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.taxRule).toBe("GST15");
  });

  it("accepts a valid email", () => {
    expect(
      CustomerSchema.safeParse({ ...valid, email: "ops@example.co.nz" }).success,
    ).toBe(true);
  });

  it("accepts an empty-string email (form fallback)", () => {
    expect(CustomerSchema.safeParse({ ...valid, email: "" }).success).toBe(true);
  });

  it("rejects an obviously bad email", () => {
    expect(CustomerSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects non-positive creditLimit", () => {
    expect(CustomerSchema.safeParse({ ...valid, creditLimit: 0 }).success).toBe(false);
    expect(CustomerSchema.safeParse({ ...valid, creditLimit: -1 }).success).toBe(false);
  });

  it("accepts positive creditLimit", () => {
    expect(CustomerSchema.safeParse({ ...valid, creditLimit: 1000 }).success).toBe(true);
  });

  it("accepts nested address objects", () => {
    expect(
      CustomerSchema.safeParse({
        ...valid,
        postalAddress: { line1: "Box 123" },
        physicalAddress: { line1: "1 Site Rd", city: "Auckland" },
      }).success,
    ).toBe(true);
  });

  it("accepts an array of shipTos", () => {
    expect(
      CustomerSchema.safeParse({
        ...valid,
        shipTos: [
          { label: "Warehouse", line1: "10 Loading Dock" },
          { label: "Office" },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts an id for upsert", () => {
    expect(CustomerSchema.safeParse({ id: "c1", ...valid }).success).toBe(true);
  });
});
