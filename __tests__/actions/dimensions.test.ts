import { describe, it, expect } from "vitest";
import { NameSchema } from "@/lib/schemas/dimensions";

describe("NameSchema (brands/channels/territories)", () => {
  it("accepts a minimal name", () => {
    expect(NameSchema.safeParse({ name: "Brand A" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(NameSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects names over 100 chars", () => {
    expect(NameSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
    expect(NameSchema.safeParse({ name: "x".repeat(100) }).success).toBe(true);
  });

  it("id is optional (insert vs update)", () => {
    expect(NameSchema.safeParse({ id: "abc", name: "X" }).success).toBe(true);
    expect(NameSchema.safeParse({ name: "X" }).success).toBe(true);
  });
});
