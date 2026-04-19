import { prisma } from "@/lib/prisma";
import { qboFetch } from "./client";

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

/** Push a SalesOrder as a QBO Invoice. Creates customer if missing. */
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

  // Build line items (NZ GST 15% applied at tax detail level).
  const lines = so.lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: Number(l.product.sellPriceNzd) * l.qtyOrdered,
    Description: `${l.product.sku} ${l.product.name}`,
    SalesItemLineDetail: {
      Qty: l.qtyOrdered,
      UnitPrice: Number(l.product.sellPriceNzd),
      TaxCodeRef: { value: "NON" }, // TODO: map to actual NZ GST code for your QBO company
    },
  }));

  const payload = {
    CustomerRef: { value: customerId },
    DocNumber: so.soNumber,
    Line: lines,
    TxnTaxDetail: { TotalTax: 0 },
    PrivateNote: so.notes ?? undefined,
  };

  const res = await qboFetch(tenantId, `/invoice`, { method: "POST", body: JSON.stringify(payload) });
  await prisma.salesOrder.update({ where: { id: so.id }, data: { qboInvoiceId: res.Invoice.Id } });
}

/**
 * Map a supplier tax rule to QBO NZ tax code references.
 * QBO NZ typically uses:
 *   - "GST on Expenses" (15%) for domestic taxable purchases
 *   - "GST Free Expenses" (0%) for exempt / overseas / zero-rated
 *   - "GST on Imports" for goods where import GST was paid at Customs
 *
 * These string values map to the Name field of TaxCode in QBO NZ.
 * We look them up by name at runtime so it works across different QBO companies.
 */
function taxCodeForRate(taxRate: number): string {
  // QBO NZ uses these standard tax code names
  if (taxRate >= 15) return "GST on Expenses";
  return "GST Free Expenses";
}

/** Push a PurchaseOrder receipt as a QBO Bill. Creates vendor if missing.
 *  All amounts are pushed in NZD — QBO home currency. */
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

  // Determine tax code for product lines based on supplier tax rule
  const supplierTaxRate = po.supplier.taxRule === "GST15" ? 15 : 0;
  const supplierTaxCode = taxCodeForRate(supplierTaxRate);

  // Look up QBO tax code IDs by name
  const taxCodeCache: Record<string, string> = {};
  async function resolveTaxCode(taxCodeName: string): Promise<string> {
    if (taxCodeCache[taxCodeName]) return taxCodeCache[taxCodeName];
    try {
      const tcQuery = encodeURIComponent(`select Id, Name from TaxCode where Name = '${taxCodeName}'`);
      const tcRes = await qboFetch(tenantId, `/query?query=${tcQuery}`);
      const id = tcRes?.QueryResponse?.TaxCode?.[0]?.Id;
      if (id) { taxCodeCache[taxCodeName] = id; return id; }
    } catch { /* fall through */ }
    // Fallback: use "NON" if we can't find the tax code
    return "NON";
  }

  const productTaxCodeId = await resolveTaxCode(supplierTaxCode);

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
        TaxCodeRef: { value: productTaxCodeId },
      },
    };
  });

  // Freight line (in PO source currency, converted to NZD)
  if (po.freight && Number(po.freight) > 0) {
    const freightNzd = Number(po.freightNzd ?? Number(po.freight) * fxRate);
    const freightTaxCodeId = await resolveTaxCode(supplierTaxCode);
    billLines.push({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: Math.round(freightNzd * 100) / 100,
      Description: `Freight — ${po.currency} ${Number(po.freight).toFixed(2)} @ ${fxRate.toFixed(6)}`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: "1" },
        TaxCodeRef: { value: freightTaxCodeId },
      },
    });
  }

  // Custom receive charges (each has its own currency, FX rate, and tax rate)
  for (const ch of po.receiveCharges) {
    const chTaxRate = Number(ch.taxRate);
    const chTaxCode = taxCodeForRate(chTaxRate);
    const chTaxCodeId = await resolveTaxCode(chTaxCode);
    const amountNzd = Number(ch.amountNzd);
    const taxNzd = Number(ch.taxAmountNzd);

    billLines.push({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: Math.round(amountNzd * 100) / 100,
      Description: `${ch.label}${ch.invoiceRef ? ` (Inv: ${ch.invoiceRef})` : ""} — ${ch.currency} ${Number(ch.amount).toFixed(2)}${ch.currency !== "NZD" ? ` @ ${Number(ch.fxRate).toFixed(6)}` : ""}`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: "1" },
        TaxCodeRef: { value: chTaxCodeId },
      },
    });
  }

  // Calculate total tax for the bill
  const totalTax = po.receiveCharges.reduce((s, ch) => s + Number(ch.taxAmountNzd), 0)
    + (supplierTaxRate > 0 ? Math.round(Number(po.totalCostNzd ?? 0) * 0.15 * 100) / 100 : 0);

  const payload = {
    VendorRef: { value: vendorId },
    DocNumber: po.poNumber,
    Line: billLines,
    // Let QBO calculate tax based on TaxCodeRef on each line
    PrivateNote: po.notes ?? undefined,
  };

  const res = await qboFetch(tenantId, `/bill`, { method: "POST", body: JSON.stringify(payload) });
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { qboBillId: res.Bill.Id } });
}
