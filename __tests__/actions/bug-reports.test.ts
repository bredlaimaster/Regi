import { describe, it, expect } from "vitest";
import {
  CreateBugReportSchema,
  UpdateBugReportSchema,
  ToggleSolvedSchema,
  DeleteBugReportSchema,
} from "@/lib/schemas/bug-reports";
import { BUG_AREA_KEYS, bugAreaLabel } from "@/lib/bug-areas";

describe("BUG_AREAS catalogue", () => {
  it("has at least one canonical area", () => {
    expect(BUG_AREA_KEYS.length).toBeGreaterThan(0);
  });

  it("every key has a non-empty label", () => {
    for (const key of BUG_AREA_KEYS) {
      const label = bugAreaLabel(key);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(key);
    }
  });

  it("contains the headline screens the user called out (PO, suppliers)", () => {
    expect(BUG_AREA_KEYS).toContain("purchase-orders");
    expect(BUG_AREA_KEYS).toContain("suppliers");
  });

  it("falls back to the raw key if it's not in the catalogue", () => {
    expect(bugAreaLabel("not-a-real-area")).toBe("not-a-real-area");
  });
});

describe("CreateBugReportSchema", () => {
  it("accepts a minimal valid bug", () => {
    const r = CreateBugReportSchema.safeParse({ description: "PO total wrong" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.description).toBe("PO total wrong");
      expect(r.data.affectedAreas).toEqual([]);
    }
  });

  it("requires non-empty description", () => {
    expect(CreateBugReportSchema.safeParse({ description: "" }).success).toBe(false);
    expect(CreateBugReportSchema.safeParse({ description: "   " }).success).toBe(false);
  });

  it("rejects descriptions over 5000 chars", () => {
    expect(
      CreateBugReportSchema.safeParse({ description: "x".repeat(5001) }).success,
    ).toBe(false);
    expect(
      CreateBugReportSchema.safeParse({ description: "x".repeat(5000) }).success,
    ).toBe(true);
  });

  it("trims description whitespace", () => {
    const r = CreateBugReportSchema.safeParse({ description: "   ok   " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBe("ok");
  });

  it("accepts known affected-area keys", () => {
    const r = CreateBugReportSchema.safeParse({
      description: "x",
      affectedAreas: ["purchase-orders", "suppliers"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown affected-area keys", () => {
    const r = CreateBugReportSchema.safeParse({
      description: "x",
      affectedAreas: ["not-an-area"],
    });
    expect(r.success).toBe(false);
  });

  it("accepts an empty affected-areas array", () => {
    expect(
      CreateBugReportSchema.safeParse({ description: "x", affectedAreas: [] }).success,
    ).toBe(true);
  });

  it("driveLink is optional, can be null, can be empty string", () => {
    expect(CreateBugReportSchema.safeParse({ description: "x" }).success).toBe(true);
    expect(
      CreateBugReportSchema.safeParse({ description: "x", driveLink: null }).success,
    ).toBe(true);
    expect(
      CreateBugReportSchema.safeParse({ description: "x", driveLink: "" }).success,
    ).toBe(true);
  });

  it("driveLink, when non-empty, must be a valid URL", () => {
    expect(
      CreateBugReportSchema.safeParse({
        description: "x",
        driveLink: "not a url",
      }).success,
    ).toBe(false);
    expect(
      CreateBugReportSchema.safeParse({
        description: "x",
        driveLink: "https://drive.google.com/drive/folders/ABC",
      }).success,
    ).toBe(true);
  });

  it("driveLink length is capped at 2048", () => {
    const longUrl = "https://example.com/" + "a".repeat(2100);
    expect(
      CreateBugReportSchema.safeParse({ description: "x", driveLink: longUrl }).success,
    ).toBe(false);
  });

  it("reporter is optional and trimmed", () => {
    const r = CreateBugReportSchema.safeParse({
      description: "x",
      reporter: "  son  ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reporter).toBe("son");
  });

  it("reporter length is capped", () => {
    expect(
      CreateBugReportSchema.safeParse({
        description: "x",
        reporter: "x".repeat(121),
      }).success,
    ).toBe(false);
  });
});

describe("UpdateBugReportSchema", () => {
  it("requires id on top of all create fields", () => {
    expect(
      UpdateBugReportSchema.safeParse({ description: "x" }).success,
    ).toBe(false);
    expect(
      UpdateBugReportSchema.safeParse({ id: "abc", description: "x" }).success,
    ).toBe(true);
  });

  it("rejects empty id", () => {
    expect(
      UpdateBugReportSchema.safeParse({ id: "", description: "x" }).success,
    ).toBe(false);
  });
});

describe("ToggleSolvedSchema", () => {
  it("requires id and solved (boolean)", () => {
    expect(ToggleSolvedSchema.safeParse({ id: "x", solved: true }).success).toBe(true);
    expect(ToggleSolvedSchema.safeParse({ id: "x", solved: false }).success).toBe(true);
    expect(ToggleSolvedSchema.safeParse({ id: "x" }).success).toBe(false);
    expect(ToggleSolvedSchema.safeParse({ solved: true }).success).toBe(false);
  });

  it("rejects truthy non-boolean", () => {
    expect(
      ToggleSolvedSchema.safeParse({ id: "x", solved: "yes" }).success,
    ).toBe(false);
  });
});

describe("DeleteBugReportSchema", () => {
  it("requires non-empty id", () => {
    expect(DeleteBugReportSchema.safeParse({ id: "x" }).success).toBe(true);
    expect(DeleteBugReportSchema.safeParse({ id: "" }).success).toBe(false);
    expect(DeleteBugReportSchema.safeParse({}).success).toBe(false);
  });
});
