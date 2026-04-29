import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  currentFiscalYear,
  fiscalPeriodToDates,
  getSalesByCustomer,
} from "@/lib/reports/margin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";
import { FySelector } from "@/components/reports/fy-selector";

export default async function CustomerSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; repId?: string; channelId?: string }>;
}) {
  const session = await requireRole(["ADMIN", "SALES"]);
  const sp = await searchParams;
  const fy = sp.fy ? parseInt(sp.fy) : currentFiscalYear();

  const { start } = fiscalPeriodToDates(fy, 1);
  const { end } = fiscalPeriodToDates(fy, 12);

  const [rows, reps, channels] = await Promise.all([
    getSalesByCustomer(session.tenantId, start, end, {
      repId: sp.repId,
      channelId: sp.channelId,
    }),
    prisma.user.findMany({
      where: { tenantId: session.tenantId, role: "SALES" },
      select: { id: true, name: true, email: true },
    }),
    prisma.channel.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true },
    }),
  ]);

  const totalSales = rows.reduce((s, r) => s + r.salesNzd, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customer Sales</h1>
          <p className="text-sm text-muted-foreground">Report 2 · FY{fy} · {rows.length} customers</p>
        </div>
        <FySelector current={fy} />
      </div>

      {/* Filters — client-side links */}
      <div className="flex gap-2 flex-wrap text-sm">
        <span className="text-muted-foreground">Filter:</span>
        {reps.map((r) => (
          <a
            key={r.id}
            href={`?fy=${fy}&repId=${r.id}`}
            className="px-2 py-0.5 rounded-full border text-xs hover:bg-accent"
          >
            {r.name ?? r.email}
          </a>
        ))}
        {channels.map((c) => (
          <a
            key={c.id}
            href={`?fy=${fy}&channelId=${c.id}`}
            className="px-2 py-0.5 rounded-full border text-xs hover:bg-accent"
          >
            {c.name}
          </a>
        ))}
        {(sp.repId || sp.channelId) && (
          <a href={`?fy=${fy}`} className="px-2 py-0.5 rounded-full border text-xs bg-muted">
            Clear filters
          </a>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {totalSales > 0 ? `Total: ${formatNzd(totalSales)}` : "No shipped orders in this period"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Share %</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Gross Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-right">Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No shipped orders in FY{fy}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.customerId}>
                  <TableCell className="font-medium">{r.customerName}</TableCell>
                  <TableCell className="text-right">{formatNzd(r.salesNzd)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {totalSales > 0 ? ((r.salesNzd / totalSales) * 100).toFixed(1) : "0.0"}%
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatNzd(r.cogsNzd)}</TableCell>
                  <TableCell className="text-right">{formatNzd(r.grossMarginNzd)}</TableCell>
                  <TableCell className="text-right">{r.grossMarginPct.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{r.orderCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
