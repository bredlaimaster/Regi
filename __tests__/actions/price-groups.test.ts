import { describe, it, expect } from "vitest";
import { GroupSchema } from "@/lib/schemas/price-groups";

describe("price-group GroupSchema", () => {
  const valid = { name: "Wholesale" };

  it("accepts a minimal group", () => {
    expect(GroupSchema.safeParse(valid).success).toBe(true);
  });

  it("applies defaults", () => {
    const r = GroupSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.isDefault).toBe(false);
      expect(r.data.sortOrder).toBe(0);
    }
  });

  it("requires non-empty name", () => {
    expect(GroupSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects names over 100 chars", () => {
    expect(GroupSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("rejects negative sortOrder", () => {
    expect(GroupSchema.safeParse({ ...valid, sortOrder: -1 }).success).toBe(false);
  });

  it("rejects fractional sortOrder", () => {
    expect(GroupSchema.safeParse({ ...valid, sortOrder: 1.5 }).success).toBe(false);
  });

  it("coerces string sortOrder", () => {
    const r = GroupSchema.safeParse({ ...valid, sortOrder: "3" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sortOrder).toBe(3);
  });
});
