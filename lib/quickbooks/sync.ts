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
  const query = encodeURIComponent(`select Id from Customer where DisplayName = '${so.customer.name.replace(/'/g, "''")}'`);
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

/** Push a PurchaseOrder receipt as a QBO Bill. Creates vendor if missing. */
async function pushBill(tenantId: string, poId: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { supplier: true, lines: { include: { product: true } } },
  });
  if (!po || po.tenantId !== tenantId) throw new Error("PO not found");
  if (po.qboBillId) return;

  const query = encodeURIComponent(`select Id from Vendor where DisplayName = '${po.supplier.name.replace(/'/g, "''")}'`);
  const qr = await qboFetch(tenantId, `/query?query=${query}`);
  let vendorId: string | undefined = qr?.QueryResponse?.Vendor?.[0]?.Id;
  if (!vendorId) {
    const vres = await qboFetch(tenantId, `/vendor`, {
      method: "POST",
      body: JSON.stringify({ DisplayName: po.supplier.name }),
    });
    vendorId = vres.Vendor.Id;
  }

  const lines = po.lines.map((l) => ({
    DetailType: "AccountBasedExpenseLineDetail",
    Amount: Number(l.unitCostNzd) * l.qtyOrdered,
    Description: `${l.product.sku} ${l.product.name}`,
    AccountBasedExpenseLineDetail: {
      // TODO: map to your Cost of Goods Sold / Inventory Asset account
      AccountRef: { value: "1" },
    },
  }));
  if (po.freightNzd && Number(po.freightNzd) > 0) {
    lines.push({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: Number(po.freightNzd),
      Description: "Freight",
      AccountBasedExpenseLineDetail: { AccountRef: { value: "1" } },
    });
  }

  const payload = {
    VendorRef: { value: vendorId },
    DocNumber: po.poNumber,
    Line: lines,
    PrivateNote: po.notes ?? undefined,
  };

  const res = await qboFetch(tenantId, `/bill`, { method: "POST", body: JSON.stringify(payload) });
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { qboBillId: res.Bill.Id } });
}
