import { describe, it, expect } from "vitest";
import {
  CreateSchema,
  SetPasswordSchema,
  SignInSchema,
} from "@/lib/schemas/users";

describe("user CreateSchema", () => {
  const valid = {
    email: "owner@example.co.nz",
    role: "ADMIN" as const,
    password: "long-enough-password",
  };

  it("accepts a valid user", () => {
    expect(CreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects bad email", () => {
    expect(CreateSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects unknown role", () => {
    expect(CreateSchema.safeParse({ ...valid, role: "OWNER" as never }).success).toBe(false);
  });

  it("accepts each known role", () => {
    for (const r of ["ADMIN", "SALES", "WAREHOUSE"] as const) {
      expect(CreateSchema.safeParse({ ...valid, role: r }).success).toBe(true);
    }
  });

  it("requires password >= 8 chars", () => {
    expect(CreateSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
    expect(CreateSchema.safeParse({ ...valid, password: "12345678" }).success).toBe(true);
  });

  it("password length error message", () => {
    const r = CreateSchema.safeParse({ ...valid, password: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.flatten().fieldErrors.password?.[0];
      expect(msg).toBe("Password must be at least 8 characters");
    }
  });

  it("name is optional and nullable", () => {
    expect(CreateSchema.safeParse({ ...valid, name: null }).success).toBe(true);
    expect(CreateSchema.safeParse({ ...valid, name: "Alice" }).success).toBe(true);
  });
});

describe("SetPasswordSchema", () => {
  it("requires id and password ≥ 8 chars", () => {
    expect(SetPasswordSchema.safeParse({ id: "u1", password: "long-password" }).success).toBe(true);
    expect(SetPasswordSchema.safeParse({ id: "u1", password: "short" }).success).toBe(false);
    expect(SetPasswordSchema.safeParse({ password: "long-password" }).success).toBe(false);
  });
});

describe("SignInSchema", () => {
  it("accepts any non-empty password (sign-in does not enforce policy)", () => {
    expect(
      SignInSchema.safeParse({ email: "u@x.com", password: "x" }).success,
    ).toBe(true);
  });

  it("requires valid email", () => {
    expect(SignInSchema.safeParse({ email: "x", password: "y" }).success).toBe(false);
  });

  it("rejects empty password", () => {
    expect(SignInSchema.safeParse({ email: "u@x.com", password: "" }).success).toBe(false);
  });
});
