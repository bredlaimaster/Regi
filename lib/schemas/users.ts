/**
 * Pure Zod schemas for users — extracted from `actions/users.ts` so they
 * can be imported by tests and client code without crossing the "use server"
 * boundary (server-action files may only export async functions).
 */
import { z } from "zod";

export const CreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional().nullable(),
  role: z.enum(["ADMIN", "SALES", "WAREHOUSE"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const SetPasswordSchema = z.object({
  id: z.string(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
