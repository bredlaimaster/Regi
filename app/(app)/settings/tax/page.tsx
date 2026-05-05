import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listTaxCodes, INCOME_FALLBACKS, EXPENSE_FALLBACKS, type TaxRule } from "@/lib/quickbooks/tax-codes";
import { RefreshTaxCodesButton } from "./refresh-button";

type LabelMeta = { label: string; desc: string; variant: "default" | "secondary" | "outline" | "destructive" };

const TAX_RULE_LABELS: Record<TaxRule, LabelMeta> = {
  GST15:      { label: "GST 15%",    desc: "Standard NZ domestic — 15% GST on all transactions",                           variant: "default" },
  ZERO:       { label: "Zero Rated", desc: "0% GST — exports, overseas services, zero-rated supplies (on GST return)",      variant: "secondary" },
  IMPORT_GST: { label: "Import GST", desc: "Overseas supplier — supplier bill has no GST; import GST billed separately by Customs", variant: "outline" },
  EXEMPT:     { label: "Exempt",     desc: "Exempt or out of scope — not on GST return (e.g. wages, residential rent)",    variant: "destructive" },
};

// Which tax rules are valid on each side. IMPORT_GST makes no sense for customers.
const INCOME_RULES: TaxRule[]  = ["GST15", "ZERO", "EXEMPT"];
const EXPENSE_RULES: TaxRule[] = ["GST15", "ZERO", "IMPORT_GST", "EXEMPT"];

export default async function TaxSettingsPage() {
  const session = await requireRole(["ADMIN"]);

  const [suppliers, customers, conn] = await Promise.all([
    prisma.supplier.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true, taxRule: true },
    }),
    prisma.customer.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, taxRule: true },
    }),
    prisma.qboConnection.findUnique({ where: { tenantId: session.tenantId } }),
  ]);

  // Pull the live QBO tax-code list only if connected. Swallow errors so
  // a transient QBO failure doesn't break the whole Settings page.
  let qbo: Awaited<ReturnType<typeof listTaxCodes>> | null = null;
  let qboError: string | null = null;
  if (conn) {
    try {
      qbo = await listTaxCodes(session.tenantId);
    } catch (e: any) {
      qboError = String(e?.message ?? e);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Tax (NZ GST)</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">How tax works in this system</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>All prices and costs in this app are stored <strong>GST-exclusive in NZD</strong>. When invoices and bills are pushed to QuickBooks, QuickBooks adds 15% GST on top based on the tax code attached to each line (i.e. amounts go across with <code>GlobalTaxCalculation: TaxExcluded</code>).</p>
          <p>Each customer and supplier carries a <strong>tax rule</strong> that determines which QBO tax code is used when their transactions sync. Tax rules map 1:1 to the standard NZ QBO tax codes shown below. If a code with the exact name is not found in your QBO file, a fallback is tried.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">NZ GST rules</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {(Object.keys(TAX_RULE_LABELS) as TaxRule[]).map((key) => {
              const { label, desc, variant } = TAX_RULE_LABELS[key];
              return (
                <div key={key} className="border rounded-md p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={variant}>{label}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">{key}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Mapping to QuickBooks NZ tax codes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-2">Income side (Customer → Invoice line)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[25%]">App rule</TableHead>
                  <TableHead>Preferred QBO code</TableHead>
                  <TableHead>Fallbacks</TableHead>
                  <TableHead>In your QBO file</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {INCOME_RULES.map((rule) => {
                  const chain = INCOME_FALLBACKS[rule];
                  const resolved = qbo?.income?.[rule]?.resolved;
                  return (
                    <TableRow key={rule}>
                      <TableCell><Badge variant={TAX_RULE_LABELS[rule].variant}>{TAX_RULE_LABELS[rule].label}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{chain[0]}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{chain.slice(1).join(", ") || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {!conn ? <span className="text-muted-foreground">Not connected</span>
                          : resolved ? <span className="text-emerald-700 font-mono">{resolved}</span>
                          : <span className="text-red-700">Not found</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Expense side (Supplier → Bill line)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[25%]">App rule</TableHead>
                  <TableHead>Preferred QBO code</TableHead>
                  <TableHead>Fallbacks</TableHead>
                  <TableHead>In your QBO file</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {EXPENSE_RULES.map((rule) => {
                  const chain = EXPENSE_FALLBACKS[rule];
                  const resolved = qbo?.expense?.[rule]?.resolved;
                  return (
                    <TableRow key={rule}>
                      <TableCell><Badge variant={TAX_RULE_LABELS[rule].variant}>{TAX_RULE_LABELS[rule].label}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{chain[0]}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{chain.slice(1).join(", ") || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {!conn ? <span className="text-muted-foreground">Not connected</span>
                          : resolved ? <span className="text-emerald-700 font-mono">{resolved}</span>
                          : <span className="text-red-700">Not found</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Per-line receive charges (freight, brokerage, import GST) are mapped by <em>rate</em>: any charge with rate ≥ 15% uses the 15% expense code; 0% uses the zero-rated expense code.
          </p>
        </CardContent>
      </Card>

      {conn && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Tax codes in your QuickBooks file</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Connected to QBO realm <code className="font-mono">{conn.realmId}</code>.
                  Match this against the URL in your QBO browser tab to confirm
                  you're looking at the same file Regi is.
                </p>
              </div>
              <RefreshTaxCodesButton />
            </div>
          </CardHeader>
          <CardContent>
            {qboError ? (
              <p className="text-sm text-red-700">Could not read QBO tax codes: {qboError}</p>
            ) : qbo && qbo.available.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {qbo.available.map((tc) => (
                  <Badge key={tc.id} variant="outline" className="font-mono text-xs">{tc.name}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No tax codes visible — make sure GST is enabled in your QBO file.</p>
            )}
            <p className="text-xs text-muted-foreground pt-3">
              If a row above shows <em>Not found</em>, the preferred code name does not exist in this QBO file. Either enable the standard NZ GST codes in QuickBooks (Taxes → Set up tax) or rename one of your existing codes to match a fallback shown above. Already added the code in QBO? Click <strong>Refresh from QuickBooks</strong> above — Regi caches the list for up to 60 seconds.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Supplier tax assignments ({suppliers.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Tax rule</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => {
                const rule = TAX_RULE_LABELS[s.taxRule as TaxRule] ?? TAX_RULE_LABELS.GST15;
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Customer tax assignments ({customers.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Tax rule</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const rule = TAX_RULE_LABELS[c.taxRule as TaxRule] ?? TAX_RULE_LABELS.GST15;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><Badge variant={rule.variant}>{rule.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/customers/${c.id}`} className="text-xs text-primary underline">Edit</Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {customers.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No customers yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
