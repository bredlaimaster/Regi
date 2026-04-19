import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

const TAX_RULE_LABELS: Record<string, { label: string; desc: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  GST15:      { label: "GST 15%",     desc: "Standard NZ domestic — 15% GST charged on all invoices", variant: "default" },
  ZERO:       { label: "Zero Rated",  desc: "Zero-rated supplies — no GST charged (exports, financial)", variant: "secondary" },
  IMPORT_GST: { label: "Import GST",  desc: "Overseas supplier — import GST assessed by NZ Customs at border", variant: "outline" },
  EXEMPT:     { label: "Exempt",      desc: "Exempt from GST — no GST applies", variant: "destructive" },
};

export default async function TaxSettingsPage() {
  const session = await requireSession();
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, currency: true, taxRule: true },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Tax Rules</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">NZ GST Rules for Suppliers</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(TAX_RULE_LABELS).map(([key, { label, desc, variant }]) => (
              <div key={key} className="border rounded-md p-3 space-y-1">
                <Badge variant={variant}>{label}</Badge>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground pt-2 space-y-1">
            <p><strong>NZ domestic suppliers</strong> (GST-registered) charge 15% GST on goods and services. You can claim input tax credits on these invoices.</p>
            <p><strong>Overseas suppliers</strong> generally do not charge NZ GST. Import GST at 15% is assessed by NZ Customs on the CIF value (cost + insurance + freight) at the border.</p>
            <p><strong>Freight:</strong> Domestic freight from a GST-registered NZ carrier attracts 15% GST. International freight legs are typically zero-rated.</p>
            <p><strong>Each charge line</strong> on PO receipts has its own tax rate selector, so you can correctly split charges (e.g. domestic freight at 15%, customs brokerage at 15%, international transport at 0%).</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Supplier Tax Assignments</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Tax Rule</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => {
                const rule = TAX_RULE_LABELS[s.taxRule] ?? TAX_RULE_LABELS.GST15;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.currency}</TableCell>
                    <TableCell><Badge variant={rule.variant}>{rule.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/suppliers/${s.id}`} className="text-xs text-primary underline">Edit</Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {suppliers.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No suppliers yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground pt-3">
            Tax rules are set per supplier. To change a supplier&apos;s tax rule, edit the supplier record.
            The default tax rate will be pre-selected when adding charge lines during PO receiving.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
