import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";
import { currentFiscalYear } from "@/lib/reports/margin";
import { BudgetUpload } from "./budget-upload";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const session = await requireRole(["ADMIN"]);
  const sp = await searchParams;
  const fy = sp.fy ? parseInt(sp.fy) : currentFiscalYear();

  const budgets = await prisma.budget.findMany({
    where: { tenantId: session.tenantId, fiscalYear: fy },
    include: { brand: true, channel: true, territory: true, rep: true },
    orderBy: [{ period: "asc" }, { lineType: "asc" }],
  });

  const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

  // Summarise sales budget by period
  const salesByPeriod = Object.fromEntries(MONTHS.map((_, i) => [i + 1, 0]));
  for (const b of budgets) {
    if (b.lineType === "SALES") salesByPeriod[b.period] += Number(b.amountNzd);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Budget Management</h1>
        <p className="text-sm text-muted-foreground">
          FY{fy} · Upload monthly budgets for P&amp;L and Actual vs Budget reports
        </p>
      </div>

      <div className="flex gap-2">
        {[fy - 1, fy, fy + 1].map((y) => (
          <a
            key={y}
            href={`?fy=${y}`}
            className={`px-3 py-1 text-sm rounded-full border ${y === fy ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            FY{y}
          </a>
        ))}
      </div>

      <BudgetUpload fiscalYear={fy} />

      {/* Summary table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales Budget Summary — FY{fy}</CardTitle>
          <CardDescription>
            Total: {formatNzd(Object.values(salesByPeriod).reduce((s, v) => s + v, 0))}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Budget Sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MONTHS.map((m, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>{m} {i < 9 ? fy : fy + 1}</TableCell>
                  <TableCell className="text-right">{formatNzd(salesByPeriod[i + 1])}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Full budget lines */}
      {budgets.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">All Budget Lines ({budgets.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Territory</TableHead>
                  <TableHead>Rep</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{MONTHS[b.period - 1]}</TableCell>
                    <TableCell className="font-mono text-xs">{b.lineType}</TableCell>
                    <TableCell>{b.brand?.name ?? "—"}</TableCell>
                    <TableCell>{b.channel?.name ?? "—"}</TableCell>
                    <TableCell>{b.territory?.name ?? "—"}</TableCell>
                    <TableCell>{b.rep?.name ?? b.rep?.email ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatNzd(Number(b.amountNzd))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
