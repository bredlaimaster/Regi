import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScheduledReportForm } from "./scheduled-report-form";
import { toggleScheduledReport, deleteScheduledReport } from "@/actions/scheduled-reports";

const REPORT_KEYS = [
  { key: "monthly-sales", label: "Monthly Sales Analysis" },
  { key: "actual-vs-budget", label: "Actual vs Budget" },
  { key: "stock-on-hand", label: "Stock on Hand" },
  { key: "expiry-tracker", label: "Expiry Tracker" },
  { key: "reorder-planner", label: "Re-order Planner" },
  { key: "rep-performance", label: "Rep Performance" },
  { key: "channel-trends", label: "Channel Trends" },
  { key: "overstock", label: "Overstock & Slow Movers" },
  { key: "supplier-eta", label: "Supplier ETA" },
];

export default async function ScheduledReportsPage() {
  const session = await requireRole(["ADMIN"]);

  const [schedules, lastDeliveries] = await Promise.all([
    prisma.scheduledReport.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.reportDelivery.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { deliveredAt: "desc" },
      take: 50,
    }),
  ]);

  // Build last-delivery map per reportKey
  const lastDeliveryMap = new Map<string, typeof lastDeliveries[0]>();
  for (const d of lastDeliveries) {
    if (!lastDeliveryMap.has(d.reportKey)) lastDeliveryMap.set(d.reportKey, d);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Scheduled Reports</h1>
        <p className="text-sm text-muted-foreground">
          Configure automatic email delivery for reports. Uses Resend for delivery.
        </p>
      </div>

      <ScheduledReportForm reportKeys={REPORT_KEYS} />

      {/* Existing schedules */}
      {schedules.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Active Schedules ({schedules.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sent</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => {
                  const lastDel = lastDeliveryMap.get(s.reportKey);
                  const reportLabel = REPORT_KEYS.find((r) => r.key === s.reportKey)?.label ?? s.reportKey;
                  const recipients = s.recipients as string[];
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{reportLabel}</TableCell>
                      <TableCell className="font-mono text-xs">{s.cronExpr}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {recipients.slice(0, 2).join(", ")}
                        {recipients.length > 2 && ` +${recipients.length - 2} more`}
                      </TableCell>
                      <TableCell>
                        {s.enabled ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Paused</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lastDel ? (
                          <span className={lastDel.status === "SENT" ? "text-emerald-600" : "text-rose-600"}>
                            {lastDel.status === "SENT" ? "✓" : "✗"}{" "}
                            {new Date(lastDel.deliveredAt).toLocaleDateString("en-NZ", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Never sent</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <form action={toggleScheduledReport.bind(null, s.id, !s.enabled)}>
                            <button type="submit" className="text-xs text-primary hover:underline">
                              {s.enabled ? "Pause" : "Resume"}
                            </button>
                          </form>
                          <form action={deleteScheduledReport.bind(null, s.id)}>
                            <button type="submit" className="text-xs text-rose-600 hover:underline">
                              Delete
                            </button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent delivery log */}
      {lastDeliveries.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Deliveries</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lastDeliveries.slice(0, 20).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{REPORT_KEYS.find((r) => r.key === d.reportKey)?.label ?? d.reportKey}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.period}</TableCell>
                    <TableCell className="text-sm">{d.recipientEmail}</TableCell>
                    <TableCell>
                      {d.status === "SENT" ? (
                        <Badge variant="success">Sent</Badge>
                      ) : (
                        <Badge variant="destructive" title={d.error ?? ""}>Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(d.deliveredAt).toLocaleString("en-NZ")}
                    </TableCell>
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
