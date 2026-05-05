"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, assertTenant } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";
import {
  CreateBugReportSchema,
  UpdateBugReportSchema,
  ToggleSolvedSchema,
  ToggleAiFixSchema,
  DeleteBugReportSchema,
} from "@/lib/schemas/bug-reports";

/** Create a new bug report. */
export async function createBugReport(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole(["ADMIN"]);
  const parsed = CreateBugReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { description, affectedAreas, driveLink, reporter } = parsed.data;

  const created = await prisma.bugReport.create({
    data: {
      tenantId: session.tenantId,
      description,
      affectedAreas,
      driveLink: driveLink || null,
      reporter: reporter || null,
    },
    select: { id: true },
  });

  revalidatePath("/settings/support");
  return { ok: true, data: { id: created.id } };
}

/** Update an existing bug report's description / areas / drive link / reporter. */
export async function updateBugReport(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const parsed = UpdateBugReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { id, description, affectedAreas, driveLink, reporter } = parsed.data;

  const existing = await prisma.bugReport.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);

  await prisma.bugReport.update({
    where: { id },
    data: {
      description,
      affectedAreas,
      driveLink: driveLink || null,
      reporter: reporter || null,
    },
  });

  revalidatePath("/settings/support");
  return { ok: true, data: null };
}

/**
 * Flip the solved bit. Stamps `resolvedAt` when transitioning to solved, and
 * clears it when reopening. Separate from updateBugReport so the checkbox can
 * fire a single tiny round trip without rebuilding the whole form payload.
 */
export async function toggleBugSolved(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const parsed = ToggleSolvedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { id, solved } = parsed.data;

  const existing = await prisma.bugReport.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);

  await prisma.bugReport.update({
    where: { id },
    data: {
      solved,
      resolvedAt: solved ? new Date() : null,
    },
  });

  revalidatePath("/settings/support");
  return { ok: true, data: null };
}

/**
 * Flip the AI-fix flag. Stamps `aiFlaggedAt` on enable, clears it on disable.
 * Independent from `solved` — a bug can be flagged for AI even after a human
 * fix, and an open bug can be flagged or unflagged at any time.
 */
export async function toggleBugAiFix(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const parsed = ToggleAiFixSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { id, aiFix } = parsed.data;

  const existing = await prisma.bugReport.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);

  await prisma.bugReport.update({
    where: { id },
    data: {
      aiFix,
      aiFlaggedAt: aiFix ? new Date() : null,
    },
  });

  revalidatePath("/settings/support");
  return { ok: true, data: null };
}

/** Permanently delete a bug report. */
export async function deleteBugReport(input: unknown): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const parsed = DeleteBugReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { id } = parsed.data;

  const existing = await prisma.bugReport.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Not found" };
  assertTenant(existing.tenantId, session.tenantId);

  await prisma.bugReport.delete({ where: { id } });
  revalidatePath("/settings/support");
  return { ok: true, data: null };
}
