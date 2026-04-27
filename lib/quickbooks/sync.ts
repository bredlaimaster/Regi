import { prisma } from "@/lib/prisma";
import { qboFetch } from "./client";
import {
  INCOME_FALLBACKS,
  EXPENSE_FALLBACKS,
  expenseFallbacksForRate,
  resolveTaxCodeId,
  type TaxRule,
} from "./tax-codes";

/** Enqueue a sync job (idempotent per entity). */
export async function enqueueQboSync(args: {
  tenantId: string;
  entityType: "INVOICE" | "BILL";
  entityId: string;
}) {
  const existing = await prisma.qboSyncJob.findFirst({
    where: { ...args, status: { in: ["PENDING", "FAILED"] } },
  });
  if (existing) {
    await prisma.qboSyncJob.update({
      where: { id: existing.id },
      data: { status: "PENDING", lastError: null },
    });
    return;
  }
  await prisma.qboSyncJob.create({ data: { ...args, status: "PENDING" } });
}

/** Process pending sync jobs. Called by cron. */
export async function processQboSyncJobs(tenantId?: string) {
  const jobs = await prisma.qboSyncJob.findMany({
    where: { status: "PENDING", ...(tenantId ? { tenantId } : {}) },
    take: 25,
    orderBy: { createdAt: "asc" },
  });

  for (const job of jobs) {
    try {
      // Skip tenants without a QBO connection (don't fail forever).
      const conn = await prisma.qboConnection.findUnique({ where: { tenantId: job.tenantId } });
      if (!conn) continue;

      if (job.entityType === "INVOICE") {
        await pushInvoice(job.tenantId, job.entityId);
      } else if (job.entityType === "BILL") {
        await pushBill(job.tenantId, job.entityId);
      }
      await prisma.qboSyncJob.update({
        where: { id: job.id },
        data: { status: "SUCCESS", attempts: { increment: 1 } },
      });
    } catch (e: any) {
      await prisma.qboSyncJob.update({
        where: { id: job.id },
        data: {
          status: job.attempts + 1 >= 5 ? "FAILED" : "PENDING",
          attempts: { increment: 1 },
          lastError: String(e?.message ?? e).slice(0, 1000),
        },
      });
    }
  }
}

/** Narrow a String tax rule from the DB to the TaxRule union with a safe default. */
function asTaxRule(value: string): TaxRule {
  if (value === "GST15" || value === "ZERO" || value === "IMPORT_GST" || value === "EXEMPT") {
    return value;
  }
  return "GST15";
}

/** Push a SalesOrder as a QBO Invoice. Creates customer if missing.
 *  Prices are GST-exclusive NZD — QBO adds 15% based on TaxCodeRef.
 */
async function pushInvoice(tenantId: string, soId: string) {
  const so = await prisma.salesOrder.findUnique({
    where: { id: soId },
    include: { customer: true, lines: { include: { product: true } } },
  });
  if (!so || so.tenantId !== tenantId) throw new Error("SO not found");
  if (so.qboInvoiceId) return;

  // Find-or-create customer in QBO by name.
  // Sanitize name for QBO query: strip characters outside alphanumeric/space/hyphen/period
  const safeName = so.customer.name.replace(/[^a-zA-Z0-9 \-.'&]/g, "").replace(/'/g, "\\'");
  const query = encodeURIComponent(`select Id from Customer where DisplayName = '${safeName}'`);
  const qr = await qboFetch(tenantId, `/query?query=${query}`);
  let customerId: string | undefined = qr?.QueryResponse?.Customer?.[0]?.Id;
  if (!customerId) {
    const cres = await qboFetch(tenantId, `/customer`, {
      method: "POST",
      body: JSON.stringify({
        DisplayName: so.customer.name,
        PrimaryEmailAddr: so.customer.email ? { Address: so.customer.email } : undefined,
      }),
    });
    customerId = cres.Customer.Id;
  }

  // Resolve the NZ GST income code for this customer's tax rule.
  const rule = asTaxRule(so.customer.taxRule);
  const taxCode = await resolveTaxCodeId(tenantId, INCOME_FALLBACKS[rule]);

  const lines = so.lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: Number(l.product.sellPriceNzd) * l.qtyOrdered,
    Description: `${l.product.sku} ${l.product.name}`,
    SalesItemLineDetail: {
      Qty: l.qtyOrdered,
      UnitPrice: Number(l.product.sellPriceNzd),
      ...(taxCode ? { TaxCodeRef: { value: taxCode.id } } : {}),
    },
  }));

  const payload = {
    CustomerRef: { value: customerId },
    DocNumber: so.soNumber,
    Line: lines,
    // Prices are ex-GST; tell QBO to add tax per line rather than treat amounts
    // as already tax-inclusive.
    GlobalTaxCalculation: "TaxExcluded",
    PrivateNote: so.notes ?? undefined,
  };

  const res = await qboFetch(tenantId, `/invoice`, { method: "POST", body: JSON.stringify(payload) });
  await prisma.salesOrder.update({ where: { id: so.id }, data: { qboInvoiceId: res.Invoice.Id } });
}

/** Push a PurchaseOrder receipt as a QBO Bill. Creates vendor if missing.
 *  All amounts pushed in NZD — QBO home currency — GST-exclusive. */
async function pushBill(tenantId: string, poId: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      supplier: true,
      lines: { include: { product: true } },
      receiveCharges: true,
    },
  });
  if (!po || po.tenantId !== tenantId) throw new Error("PO not found");
  if (po.qboBillId) return;

  const safeVendorName = po.supplier.name.replace(/[^a-zA-Z0-9 \-.'&]/g, "").replace(/'/g, "\\'");
  const query = encodeURIComponent(`select Id from Vendor where DisplayName = '${safeVendorName}'`);
  const qr = await qboFetch(tenantId, `/query?query=${query}`);
  let vendorId: string | undefined = qr?.QueryResponse?.Vendor?.[0]?.Id;
  if (!vendorId) {
    const vres = await qboFetch(tenantId, `/vendor`, {
      method: "POST",
      body: JSON.stringify({ DisplayName: po.supplier.name }),
    });
    vendorId = vres.Vendor.Id;
  }

  // Supplier-level tax code (used for product lines and freight).
  const supplierRule = asTaxRule(po.supplier.taxRule);
  const supplierTaxCode = await resolveTaxCodeId(tenantId, EXPENSE_FALLBACKS[supplierRule]);

  // PO lines are stored in source currency; convert to NZD using the snapshotted
  // fxRate so QBO always receives NZD amounts. The original foreign cost is
  // preserved in the line description for traceability.
  const fxRate = Number(po.fxRate);
  const billLines: any[] = po.lines.map((l) => {
    const srcAmount = Number(l.unitCost) * l.qtyOrdered;
    const nzdAmount = Math.round(srcAmount * fxRate * 100) / 100;
    return {
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: nzdAmount,
      Description: `${l.product.sku} ${l.product.name} — ${po.currency} ${srcAmount.toFixed(2)} @ ${fxRate.toFixed(6)}`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: "1" },
        ...(supplierTaxCode ? { TaxCodeRef: { value: supplierTaxCode.id } } : {}),
      },
    };
  });

  // Freight from the supplier invoice — same tax code as the product lines.
  if (po.freight && Number(po.freight) > 0) {
    const freightNzd = Number(po.freightNzd ?? Number(po.freight) * fxRate);
    billLines.push({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: Math.round(freightNzd * 100) / 100,
      Description: `Freight — ${po.currency} ${Number(po.freight).toFixed(2)} @ ${fxRate.toFixed(6)}`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: "1" },
        ...(supplierTaxCode ? { TaxCodeRef: { value: supplierTaxCode.id } } : {}),
      },
    });
  }

  // Custom receive charges — each carries its own rate, so resolve per-charge.
  for (const ch of po.receiveCharges) {
    const chTaxCode = await resolveTaxCodeId(tenantId, expenseFallbacksForRate(Number(ch.taxRate)));
    const amountNzd = Number(ch.amountNzd);

    billLines.push({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: Math.round(amountNzd * 100) / 100,
      Description: `${ch.label}${ch.invoiceRef ? ` (Inv: ${ch.invoiceRef})` : ""} — ${ch.currency} ${Number(ch.amount).toFixed(2)}${ch.currency !== "NZD" ? ` @ ${Number(ch.fxRate).toFixed(6)}` : ""}`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: "1" },
        ...(chTaxCode ? { TaxCodeRef: { value: chTaxCode.id } } : {}),
      },
    });
  }

  const payload = {
    VendorRef: { value: vendorId },
    DocNumber: po.poNumber,
    Line: billLines,
    // Bill amounts are ex-GST; QBO adds tax per line based on TaxCodeRef.
    GlobalTaxCalculation: "TaxExcluded",
    PrivateNote: po.notes ?? undefined,
  };

  const res = await qboFetch(tenantId, `/bill`, { method: "POST", body: JSON.stringify(payload) });
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { qboBillId: res.Bill.Id } });
}
