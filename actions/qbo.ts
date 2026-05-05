"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { enqueueQboSync, processQboSyncJobs } from "@/lib/quickbooks/sync";
import { listTaxCodes, invalidateTaxCodeCache } from "@/lib/quickbooks/tax-codes";
import type { ActionResult } from "@/lib/types";

/**
 * Manual "Sync everything" trigger.
 * Enqueues INVOICE jobs for all SOs missing qboInvoiceId and BILL jobs for all
 * POs missing qboBillId, then processes the queue in-place until drained
 * (capped to avoid infinite loops on persistent failures).
 */
export async function runFullQboSync(): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const conn = await prisma.qboConnection.findUnique({ where: { tenantId: session.tenantId } });
  if (!conn) return { ok: false, error: "QuickBooks is not connected" };

  const [unsyncedSOs, unsyncedPOs] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { tenantId: session.tenantId, qboInvoiceId: null },
      select: { id: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { tenantId: session.tenantId, qboBillId: null },
      select: { id: true },
    }),
  ]);

  for (const so of unsyncedSOs) {
    await enqueueQboSync({ tenantId: session.tenantId, entityType: "INVOICE", entityId: so.id });
  }
  for (const po of unsyncedPOs) {
    await enqueueQboSync({ tenantId: session.tenantId, entityType: "BILL", entityId: po.id });
  }

  // Drain the queue (processQboSyncJobs takes 25 per call). Cap iterations so
  // a genuinely broken integration can't loop forever.
  const MAX_PASSES = 20;
  for (let i = 0; i < MAX_PASSES; i++) {
    const before = await prisma.qboSyncJob.count({
      where: { tenantId: session.tenantId, status: "PENDING" },
    });
    if (before === 0) break;
    await processQboSyncJobs(session.tenantId);
    const after = await prisma.qboSyncJob.count({
      where: { tenantId: session.tenantId, status: "PENDING" },
    });
    if (after >= before) break; // no forward progress — stop
  }

  const [succeeded, failed, pending] = await Promise.all([
    prisma.qboSyncJob.count({ where: { tenantId: session.tenantId, status: "SUCCESS" } }),
    prisma.qboSyncJob.count({ where: { tenantId: session.tenantId, status: "FAILED" } }),
    prisma.qboSyncJob.count({ where: { tenantId: session.tenantId, status: "PENDING" } }),
  ]);

  revalidatePath("/settings/quickbooks");
  return {
    ok: true,
    data: {
      enqueued: unsyncedSOs.length + unsyncedPOs.length,
      succeeded,
      failed,
      pending,
    },
  };
}

/**
 * List the TaxCodes in the connected QBO tenant, plus which ones we would
 * use for each app tax rule on the income and expense sides. Purely for
 * display on the Settings → Tax page so the user can confirm the mapping
 * against their actual QBO file.
 */
export async function listQboTaxCodes(): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const conn = await prisma.qboConnection.findUnique({ where: { tenantId: session.tenantId } });
  if (!conn) return { ok: false, error: "QuickBooks is not connected" };
  try {
    const data = await listTaxCodes(session.tenantId);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * Force a re-fetch of the QBO TaxCode list for this tenant.
 *
 * The tax-code list is cached in process memory for performance. A short TTL
 * already exists, but when an admin has just clicked Save in QBO they want
 * the change reflected immediately rather than waiting up to TTL seconds —
 * this action gives them a button for that.
 *
 * Returns the freshly-fetched list so the caller can render it without a
 * second round trip.
 */
export async function refreshQboTaxCodes(): Promise<ActionResult> {
  const session = await requireRole(["ADMIN"]);
  const conn = await prisma.qboConnection.findUnique({ where: { tenantId: session.tenantId } });
  if (!conn) return { ok: false, error: "QuickBooks is not connected" };

  invalidateTaxCodeCache(session.tenantId);

  try {
    const data = await listTaxCodes(session.tenantId);
    revalidatePath("/settings/tax");
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
