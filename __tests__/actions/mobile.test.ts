/**
 * Tests for the mobile-app server actions. Prisma and auth are mocked; we're
 * asserting behaviour (tenant scoping, outstanding filters, sort order, error
 * paths) not DB integration — that's covered by the web-app's existing tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock` calls are hoisted above imports, so any variables the factories
// reference must also be hoisted with `vi.hoisted`.
const mocks = vi.hoisted(() => ({
  productFindFirst: vi.fn(),
  salesOrderFindMany: vi.fn(),
  salesOrderFindUnique: vi.fn(),
  purchaseOrderFindMany: vi.fn(),
  purchaseOrderFindUnique: vi.fn(),
}));

// Mock auth so every test is "logged in" as a fixed tenant.
// (RBAC rollout swapped requireSession → requireRole in actions/mobile.ts.)
vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(async () => ({
    userId: "user-1",
    email: "warehouse@example.co.nz",
    tenantId: "tenant-A",
    role: "WAREHOUSE" as const,
    name: "Tester",
  })),
  assertTenant: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findFirst: mocks.productFindFirst },
    salesOrder: {
      findMany: mocks.salesOrderFindMany,
      findUnique: mocks.salesOrderFindUnique,
    },
    purchaseOrder: {
      findMany: mocks.purchaseOrderFindMany,
      findUnique: mocks.purchaseOrderFindUnique,
    },
  },
}));

const mockProductFindFirst = mocks.productFindFirst;
const mockSalesOrderFindMany = mocks.salesOrderFindMany;
const mockSalesOrderFindUnique = mocks.salesOrderFindUnique;
const mockPurchaseOrderFindMany = mocks.purchaseOrderFindMany;
const mockPurchaseOrderFindUnique = mocks.purchaseOrderFindUnique;

// Import *after* mocks.
import {
  resolveBarcode,
  pickableSalesOrders,
  getPickSheet,
  receivablePurchaseOrders,
  getReceiveSheet,
} from "@/actions/mobile";
import { BarcodeSchema, IdSchema } from "@/lib/schemas/mobile";

beforeEach(() => {
  mockProductFindFirst.mockReset();
  mockSalesOrderFindMany.mockReset();
  mockSalesOrderFindUnique.mockReset();
  mockPurchaseOrderFindMany.mockReset();
  mockPurchaseOrderFindUnique.mockReset();
});

describe("resolveBarcode", () => {
  it("returns a unit-match for a unitBarcode scan", async () => {
    mockProductFindFirst.mockResolvedValue({
      id: "p1",
      sku: "SKU-1",
      name: "Product 1",
      binLocation: "F08B01",
      caseQty: 12,
      unitBarcode: "9400000000001",
      caseBarcode: "9400000009991",
      stockLevel: { qty: 42 },
    });

    const res = await resolveBarcode({ code: "9400000000001" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.matched).toBe("unit");
    expect(res.data.productId).toBe("p1");
    expect(res.data.stockQty).toBe(42);
    expect(res.data.caseQty).toBe(12);
  });

  it("returns a case-match for a caseBarcode scan", async () => {
    mockProductFindFirst.mockResolvedValue({
      id: "p1",
      sku: "SKU-1",
      name: "Product 1",
      binLocation: "F08B01",
      caseQty: 12,
      unitBarcode: "9400000000001",
      caseBarcode: "9400000009991",
      stockLevel: { qty: 42 },
    });

    const res = await resolveBarcode({ code: "9400000009991" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.matched).toBe("case");
  });

  it("errors on empty input", async () => {
    const res = await resolveBarcode({ code: "  " });
    expect(res.ok).toBe(false);
    expect(mockProductFindFirst).not.toHaveBeenCalled();
  });

  it("errors when no product matches", async () => {
    mockProductFindFirst.mockResolvedValue(null);
    const res = await resolveBarcode({ code: "9400000000999" });
    expect(res.ok).toBe(false);
  });

  it("scopes the lookup to the session's tenant", async () => {
    mockProductFindFirst.mockResolvedValue(null);
    await resolveBarcode({ code: "1" });
    expect(mockProductFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-A", active: true }),
      }),
    );
  });

  it("handles missing stock level as qty 0", async () => {
    mockProductFindFirst.mockResolvedValue({
      id: "p1",
      sku: "SKU-1",
      name: "Product 1",
      binLocation: null,
      caseQty: 1,
      unitBarcode: "1",
      caseBarcode: null,
      stockLevel: null,
    });
    const res = await resolveBarcode({ code: "1" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.stockQty).toBe(0);
  });
});

describe("pickableSalesOrders", () => {
  it("includes only SOs with outstanding quantity", async () => {
    mockSalesOrderFindMany.mockResolvedValue([
      {
        id: "so1",
        soNumber: "SO-000001",
        orderDate: new Date("2026-01-01"),
        customer: { name: "Alpha" },
        lines: [{ qtyOrdered: 5, qtyPicked: 2 }, { qtyOrdered: 10, qtyPicked: 10 }],
      },
      {
        // fully picked — should be filtered out
        id: "so2",
        soNumber: "SO-000002",
        orderDate: new Date("2026-01-02"),
        customer: { name: "Beta" },
        lines: [{ qtyOrdered: 3, qtyPicked: 3 }],
      },
    ]);

    const res = await pickableSalesOrders();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].soNumber).toBe("SO-000001");
    expect(res.data[0].linesOutstanding).toBe(3); // 5-2 + 10-10
  });

  it("scopes to tenant and status=CONFIRMED", async () => {
    mockSalesOrderFindMany.mockResolvedValue([]);
    await pickableSalesOrders();
    expect(mockSalesOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-A", status: "CONFIRMED" },
      }),
    );
  });
});

describe("getPickSheet", () => {
  it("refuses cross-tenant access", async () => {
    mockSalesOrderFindUnique.mockResolvedValue({
      id: "so1",
      tenantId: "tenant-OTHER",
      soNumber: "SO-000001",
      status: "CONFIRMED",
      customer: { name: "X" },
      lines: [],
    });
    const res = await getPickSheet({ id: "so1" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/not found/i);
  });

  it("returns lines sorted by binLocation (aisle walk)", async () => {
    mockSalesOrderFindUnique.mockResolvedValue({
      id: "so1",
      tenantId: "tenant-A",
      soNumber: "SO-000001",
      status: "CONFIRMED",
      customer: { name: "Alpha" },
      lines: [
        {
          id: "l1",
          productId: "p1",
          qtyOrdered: 1,
          qtyPicked: 0,
          product: {
            sku: "B",
            name: "B",
            binLocation: "G07A01",
            unitBarcode: null,
            caseBarcode: null,
            caseQty: 1,
          },
        },
        {
          id: "l2",
          productId: "p2",
          qtyOrdered: 1,
          qtyPicked: 0,
          product: {
            sku: "A",
            name: "A",
            binLocation: "F08B01",
            unitBarcode: null,
            caseBarcode: null,
            caseQty: 1,
          },
        },
      ],
    });

    const res = await getPickSheet({ id: "so1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lines.map((l) => l.sku)).toEqual(["A", "B"]);
  });
});

describe("receivablePurchaseOrders", () => {
  it("filters fully-received POs out", async () => {
    mockPurchaseOrderFindMany.mockResolvedValue([
      {
        id: "po1",
        poNumber: "PO-000001",
        orderDate: new Date("2026-01-01"),
        supplier: { name: "Supplier A" },
        lines: [
          { qtyOrdered: 10, qtyReceived: 3 },
          { qtyOrdered: 5, qtyReceived: 5 },
        ],
      },
      {
        id: "po2",
        poNumber: "PO-000002",
        orderDate: new Date("2026-01-02"),
        supplier: { name: "Supplier B" },
        lines: [{ qtyOrdered: 2, qtyReceived: 2 }],
      },
    ]);
    const res = await receivablePurchaseOrders();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].linesOutstanding).toBe(7);
  });
});

describe("getReceiveSheet", () => {
  it("refuses cross-tenant access", async () => {
    mockPurchaseOrderFindUnique.mockResolvedValue({
      id: "po1",
      tenantId: "tenant-OTHER",
      poNumber: "PO-000001",
      status: "ORDERED",
      currency: "NZD",
      supplier: { name: "S" },
      lines: [],
    });
    const res = await getReceiveSheet({ id: "po1" });
    expect(res.ok).toBe(false);
  });
});

// ─── Pure Zod schemas (no mocks needed) ───────────────────────────────────────

describe("BarcodeSchema", () => {
  it("accepts a non-empty code", () => {
    expect(BarcodeSchema.safeParse({ code: "9400550000016" }).success).toBe(true);
  });
  it("trims whitespace", () => {
    const r = BarcodeSchema.safeParse({ code: "  9400550000016  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe("9400550000016");
  });
  it("rejects empty string", () => {
    expect(BarcodeSchema.safeParse({ code: "" }).success).toBe(false);
  });
  it("rejects whitespace-only after trim", () => {
    expect(BarcodeSchema.safeParse({ code: "   " }).success).toBe(false);
  });
  it("requires the code field", () => {
    expect(BarcodeSchema.safeParse({}).success).toBe(false);
  });
});

describe("IdSchema", () => {
  it("accepts a non-empty id", () => {
    expect(IdSchema.safeParse({ id: "x" }).success).toBe(true);
  });
  it("rejects empty id", () => {
    expect(IdSchema.safeParse({ id: "" }).success).toBe(false);
  });
  it("requires the id field", () => {
    expect(IdSchema.safeParse({}).success).toBe(false);
  });
});
