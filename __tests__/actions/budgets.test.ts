import { describe, it, expect } from "vitest";
import { UploadSchema } from "@/lib/schemas/budgets";

describe("UploadSchema (budget upload)", () => {
  it("accepts a valid fiscalYear and tsv body", () => {
    const r = UploadSchema.safeParse({ fiscalYear: 2025, tsv: "Apr\t100" });
    expect(r.success).toBe(true);
  });

  it("rejects fiscalYear below 2020", () => {
    expect(UploadSchema.safeParse({ fiscalYear: 2019, tsv: "x" }).success).toBe(false);
  });

  it("rejects fiscalYear above 2099", () => {
    expect(UploadSchema.safeParse({ fiscalYear: 2100, tsv: "x" }).success).toBe(false);
  });

  it("rejects non-integer fiscalYear", () => {
    expect(UploadSchema.safeParse({ fiscalYear: 2025.5, tsv: "x" }).success).toBe(false);
  });

  it("rejects empty tsv", () => {
    expect(UploadSchema.safeParse({ fiscalYear: 2025, tsv: "" }).success).toBe(false);
  });
});
