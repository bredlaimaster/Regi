import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReportCard title="Stock on hand" desc="CSV of every product and current on-hand qty" href="/api/reports/stock-on-hand.csv" />
        <ReportCard title="Sales by product (30d)" desc="CSV of units sold in the last 30 days" href="/api/reports/sales-30d.csv" />
        <ReportCard title="Inventory transactions" desc="Full audit log CSV" href="/api/reports/transactions.csv" />
        <ReportCard title="Stock valuation PDF" desc="Printable valuation report" href="/api/reports/valuation.pdf" />
      </div>
    </div>
  );
}

function ReportCard({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{desc}</p>
        <Button asChild variant="outline"><Link href={href} target="_blank">Download</Link></Button>
      </CardContent>
    </Card>
  );
}
