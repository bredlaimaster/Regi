import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { assertTenant, hashPassword } from "@/lib/auth";

describe("assertTenant", () => {
  it("passes silently when tenant ids match", () => {
    expect(() => assertTenant("tenant-A", "tenant-A")).not.toThrow();
  });

  it("throws Forbidden when tenant ids differ", () => {
    expect(() => assertTenant("tenant-A", "tenant-B")).toThrow(/Forbidden/);
    expect(() => assertTenant("tenant-A", "tenant-B")).toThrow(
      /cross-tenant/i,
    );
  });

  it("treats empty strings as a mismatch (defensive)", () => {
    expect(() => assertTenant("", "tenant-A")).toThrow(/Forbidden/);
    expect(() => assertTenant("tenant-A", "")).toThrow(/Forbidden/);
  });

  it("is case-sensitive (UUIDs/CUIDs differ in case)", () => {
    expect(() => assertTenant("Abc", "abc")).toThrow();
  });
});

describe("hashPassword + bcrypt round-trip", () => {
  it("produces a bcrypt hash that compares true with the original password", async () => {
    const plain = "S3cret!Password";
    const hash = await hashPassword(plain);
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    expect(await bcrypt.compare(plain, hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("right-password");
    expect(await bcrypt.compare("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash on each call (salted)", async () => {
    const plain = "same-password";
    const a = await hashPassword(plain);
    const b = await hashPassword(plain);
    expect(a).not.toBe(b);
    // Both still verify against the same plaintext.
    expect(await bcrypt.compare(plain, a)).toBe(true);
    expect(await bcrypt.compare(plain, b)).toBe(true);
  });

  it("uses bcrypt cost 10 (the documented default)", async () => {
    const hash = await hashPassword("x");
    // Bcrypt hash format: $2b$<cost>$<22-char-salt><31-char-digest>
    const m = /^\$2[aby]\$(\d{2})\$/.exec(hash);
    expect(m?.[1]).toBe("10");
  });

  it("handles unicode passwords", async () => {
    const plain = "пароль-密码-🔐";
    const hash = await hashPassword(plain);
    expect(await bcrypt.compare(plain, hash)).toBe(true);
  });
});
