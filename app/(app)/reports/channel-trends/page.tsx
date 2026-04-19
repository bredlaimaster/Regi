import { requireSession } from "@/lib/auth";
import { getChannelTrends, rollingMonths } from "@/lib/reports/trends";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzd } from "@/lib/utils";
import { ChannelTrendChart } from "./chart";

export default async function ChannelTrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const nMonths = Math.min(36, Math.max(6, parseInt(sp.months ?? "19")));

  const [channels, months] = await Promise.all([
    getChannelTrends(session.tenantId, nMonths),
    Promise.resolve(rollingMonths(nMonths)),
  ]);

  const totalSales = channels.reduce((s, c) => s + c.totalSalesNzd, 0);

  // Pivot for chart: array of { label, [channelName]: salesNzd }
  const chartData = months.map((m) => {
    const row: Record<string, string | number> = { name: m.label };
    for (const c of channels) {
      const mData = c.months.find((x) => x.label === m.label);
      row[c.channelName] = Math.round(mData?.salesNzd ?? 0);
    }
    return row;
  });

  const CHANNEL_COLORS = [
    "hsl(210 80% 56%)",
    "hsl(142 71% 45%)",
    "hsl(38 92% 50%)",
    "hsl(280 65% 60%)",
    "hsl(0 72% 51%)",
    "hsl(175 70% 41%)",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Channel Trends</h1>
          <p className="text-sm text-muted-foreground">
            Report 12 · {nMonths}-month rolling sales by channel
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {[12, 19, 24].map((n) => (
            <a
              key={n}
              href={`?months=${n}`}
              className={`px-3 py-1 rounded-full border transition-colors ${
                n === nMonths ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              {n}mo
            </a>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Channels Active", value: channels.filter((c) => c.totalSalesNzd > 0).length.toString() },
          { label: `${nMonths}-Month Sales`, value: formatNzd(totalSales) },
          { label: "Top Channel", value: channels[0]?.channelName ?? "—" },
          { label: "Top Channel Sales", value: formatNzd(channels[0]?.totalSalesNzd ?? 0) },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground">{k.label}</p></CardHeader>
            <CardContent className="pb-4 px-4"><p className="text-xl font-bold">{k.value}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Stacked area chart */}
      <ChannelTrendChart
        data={chartData}
        channels={channels.map((c, i) => ({ name: c.channelName, color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }))}
      />

      {/* Summary table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Channel Summary</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">{nMonths}-Mo Sales</TableHead>
                <TableHead className="text-right">Share %</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Avg $/Month</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No shipped orders — assign channels to customers to see trends
                  </TableCell>
                </TableRow>
              )}
              {channels.map((c) => (
                <TableRow key={c.channelId ?? "none"}>
                  <TableCell className="font-medium">{c.channelName}</TableCell>
                  <TableCell className="text-right">{formatNzd(c.totalSalesNzd)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {totalSales > 0 ? ((c.totalSalesNzd / totalSales) * 100).toFixed(1) : "0.0"}%
                  </TableCell>
                  <TableCell className="text-right">{c.totalUnits.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatNzd(c.totalSalesNzd / nMonths)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Month-by-month detail */}
      {channels.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Month-by-Month Detail</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  {channels.map((c) => (
                    <TableHead key={c.channelId ?? "none"} className="text-right">{c.channelName}</TableHead>
                  ))}
                  <TableHead className="text-right font-semibold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => {
                  const rowTotal = channels.reduce((s, c) => {
                    return s + (c.months.find((x) => x.label === m.label)?.salesNzd ?? 0);
                  }, 0);
                  return (
                    <TableRow key={m.label}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      {channels.map((c) => {
                        const mData = c.months.find((x) => x.label === m.label);
                        return (
                          <TableCell key={c.channelId ?? "none"} className="text-right text-muted-foreground">
                            {mData?.salesNzd ? formatNzd(mData.salesNzd) : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-semibold">
                        {rowTotal > 0 ? formatNzd(rowTotal) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
