import { describe, it, expect } from "vitest";
import {
  ProductSchema,
  GroupPriceSchema,
  SavePricesSchema,
  ProductImageIdSchema,
  SetPrimaryImageSchema,
} from "@/lib/schemas/products";

describe("ProductSchema", () => {
  const valid = { sku: "ABC-001", name: "Test product", sellPriceNzd: 10 };

  it("accepts minimum required fields", () => {
    const r = ProductSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("applies defaults", () => {
    const r = ProductSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.unit).toBe("EA");
      expect(r.data.reorderPoint).toBe(0);
      expect(r.data.caseQty).toBe(1);
      expect(r.data.isTester).toBe(false);
      expect(r.data.active).toBe(true);
    }
  });

  it("requires sku, name, sellPriceNzd", () => {
    expect(ProductSchema.safeParse({ name: "x", sellPriceNzd: 1 }).success).toBe(false);
    expect(ProductSchema.safeParse({ sku: "x", sellPriceNzd: 1 }).success).toBe(false);
    expect(ProductSchema.safeParse({ sku: "x", name: "x" }).success).toBe(false);
  });

  it("enforces sku length 1-64", () => {
    expect(ProductSchema.safeParse({ ...valid, sku: "" }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...valid, sku: "x".repeat(65) }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...valid, sku: "x".repeat(64) }).success).toBe(true);
  });

  it("enforces name length 1-200", () => {
    expect(ProductSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...valid, name: "x".repeat(201) }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...valid, name: "x".repeat(200) }).success).toBe(true);
  });

  it("rejects negative sellPriceNzd", () => {
    expect(ProductSchema.safeParse({ ...valid, sellPriceNzd: -1 }).success).toBe(false);
  });

  it("accepts zero sellPriceNzd (free sample)", () => {
    expect(ProductSchema.safeParse({ ...valid, sellPriceNzd: 0 }).success).toBe(true);
  });

  it("requires reorderPoint to be a non-negative integer", () => {
    expect(ProductSchema.safeParse({ ...valid, reorderPoint: -1 }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...valid, reorderPoint: 1.5 }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...valid, reorderPoint: 100 }).success).toBe(true);
  });

  it("requires caseQty to be a positive integer", () => {
    expect(ProductSchema.safeParse({ ...valid, caseQty: 0 }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...valid, caseQty: -1 }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...valid, caseQty: 1.5 }).success).toBe(false);
    expect(ProductSchema.safeParse({ ...valid, caseQty: 12 }).success).toBe(true);
  });

  it("does not accept imageUrl any more (images live in ProductImage now)", () => {
    // Field is intentionally absent from the schema. Zod ignores extra keys
    // by default, so the parse should still succeed but the parsed output
    // must not contain imageUrl.
    const r = ProductSchema.safeParse({
      ...valid,
      imageUrl: "https://example.com/img.png",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(("imageUrl" in r.data)).toBe(false);
    }
  });

  it("coerces string numbers", () => {
    const r = ProductSchema.safeParse({ ...valid, sellPriceNzd: "12.50", caseQty: "6" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sellPriceNzd).toBe(12.5);
      expect(r.data.caseQty).toBe(6);
    }
  });
});

describe("GroupPriceSchema", () => {
  it("accepts a valid price entry", () => {
    expect(
      GroupPriceSchema.safeParse({ priceGroupId: "pg1", unitPrice: 9.99, minQty: 1 }).success,
    ).toBe(true);
  });

  it("defaults minQty to 1", () => {
    const r = GroupPriceSchema.safeParse({ priceGroupId: "pg1", unitPrice: 9 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.minQty).toBe(1);
  });

  it("rejects empty priceGroupId", () => {
    expect(GroupPriceSchema.safeParse({ priceGroupId: "", unitPrice: 9 }).success).toBe(false);
  });

  it("rejects negative unitPrice", () => {
    expect(GroupPriceSchema.safeParse({ priceGroupId: "pg1", unitPrice: -1 }).success).toBe(false);
  });

  it("rejects minQty < 1", () => {
    expect(
      GroupPriceSchema.safeParse({ priceGroupId: "pg1", unitPrice: 1, minQty: 0 }).success,
    ).toBe(false);
  });
});

describe("SavePricesSchema", () => {
  it("accepts a list of prices", () => {
    expect(
      SavePricesSchema.safeParse({
        productId: "p1",
        prices: [
          { priceGroupId: "pg1", unitPrice: 10, minQty: 1 },
          { priceGroupId: "pg1", unitPrice: 8, minQty: 12 },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts empty prices array (clears all overrides)", () => {
    expect(SavePricesSchema.safeParse({ productId: "p1", prices: [] }).success).toBe(true);
  });

  it("requires productId", () => {
    expect(SavePricesSchema.safeParse({ prices: [] }).success).toBe(false);
  });
});

describe("ProductImageIdSchema", () => {
  it("requires non-empty id", () => {
    expect(ProductImageIdSchema.safeParse({ id: "abc" }).success).toBe(true);
    expect(ProductImageIdSchema.safeParse({ id: "" }).success).toBe(false);
    expect(ProductImageIdSchema.safeParse({}).success).toBe(false);
  });
});

describe("SetPrimaryImageSchema", () => {
  it("requires both productId and imageId", () => {
    expect(
      SetPrimaryImageSchema.safeParse({ productId: "p", imageId: "i" }).success,
    ).toBe(true);
    expect(SetPrimaryImageSchema.safeParse({ productId: "p" }).success).toBe(false);
    expect(SetPrimaryImageSchema.safeParse({ imageId: "i" }).success).toBe(false);
  });

  it("rejects empty values", () => {
    expect(
      SetPrimaryImageSchema.safeParse({ productId: "", imageId: "i" }).success,
    ).toBe(false);
    expect(
      SetPrimaryImageSchema.safeParse({ productId: "p", imageId: "" }).success,
    ).toBe(false);
  });
});
