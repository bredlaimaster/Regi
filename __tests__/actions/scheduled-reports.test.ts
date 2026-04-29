import { describe, it, expect } from "vitest";
import { CreateSchema } from "@/lib/schemas/scheduled-reports";

describe("scheduled-report CreateSchema", () => {
  const valid = {
    reportKey: "monthly-sales",
    cronExpr: "0 7 * * *",
    recipients: ["owner@example.co.nz"],
  };

  it("accepts a typical schedule", () => {
    expect(CreateSchema.safeParse(valid).success).toBe(true);
  });

  it("requires non-empty reportKey", () => {
    expect(CreateSchema.safeParse({ ...valid, reportKey: "" }).success).toBe(false);
  });

  it("requires non-empty cronExpr", () => {
    expect(CreateSchema.safeParse({ ...valid, cronExpr: "" }).success).toBe(false);
  });

  it("rejects cronExpr with disallowed characters (alphabet)", () => {
    expect(CreateSchema.safeParse({ ...valid, cronExpr: "every minute" }).success).toBe(false);
  });

  it("accepts standard cron syntax", () => {
    for (const expr of ["* * * * *", "0 7 * * *", "*/5 * * * *", "0 0 1,15 * *", "0 9-17 * * 1-5"]) {
      expect(CreateSchema.safeParse({ ...valid, cronExpr: expr }).success).toBe(true);
    }
  });

  it("requires at least one recipient", () => {
    expect(CreateSchema.safeParse({ ...valid, recipients: [] }).success).toBe(false);
  });

  it("rejects more than 20 recipients", () => {
    const recipients = Array.from({ length: 21 }, (_, i) => `u${i}@example.co.nz`);
    expect(CreateSchema.safeParse({ ...valid, recipients }).success).toBe(false);
  });

  it("rejects malformed recipient emails", () => {
    expect(
      CreateSchema.safeParse({ ...valid, recipients: ["x", "y@z.com"] }).success,
    ).toBe(false);
  });
});
