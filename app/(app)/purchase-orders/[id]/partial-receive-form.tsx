"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { partialReceivePurchaseOrder } from "@/actions/purchase-orders";

interface Line {
  id: string;
  productId: string;
  sku: string;
  name: string;
  qtyOrdered: number;
  qtyReceived: number;
}

interface Charge {
  label: string;
  amount: string;
  currency: string;
  taxRate: number;
  invoiceRef: string;
}

const TAX_OPTIONS = [
  { value: "0", label: "0% — Zero rated / Exempt" },
  { value: "15", label: "15% — NZ GST" },
];

const CURRENCY_OPTIONS = [
  { value: "NZD", label: "NZD" },
  { value: "AUD", label: "AUD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "USD", label: "USD" },
];

interface Props {
  poId: string;
  lines: Line[];
  currency: string;
  currentFreight: number;
  supplierTaxRule: string;
}

export function PartialReceiveForm({ poId, lines, currency, currentFreight, supplierTaxRule }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, String(l.qtyOrdered - l.qtyReceived)]))
  );
  const [batchCodes, setBatchCodes] = useState<Record<string, string>>({});
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});

  // Freight override — starts with current PO freight
  const [freight, setFreight] = useState(currentFreight ? currentFreight.toFixed(2) : "");

  // Default tax rate based on supplier tax rule
  const defaultTax = supplierTaxRule === "GST15" ? 15 : 0;

  // Custom charges (duty, handling, etc.)
  const [charges, setCharges] = useState<Charge[]>([]);

  /** Format a currency string to 2 decimal places on blur */
  function fmtCurrency(val: string): string {
    const n = parseFloat(val);
    return isNaN(n) || val === "" ? "" : n.toFixed(2);
  }

  function addCharge() {
    setCharges((c) => [...c, { label: "", amount: "", currency: "NZD", taxRate: defaultTax, invoiceRef: "" }]);
  }
  function removeCharge(idx: number) {
    setCharges((c) => c.filter((_, i) => i !== idx));
  }
  function updateCharge(idx: number, field: keyof Charge, value: string | number) {
    setCharges((c) => c.map((ch, i) => i === idx ? { ...ch, [field]: value } : ch));
  }

  function handleSubmit() {
    const lineData = lines
      .filter((l) => (parseInt(receiveQtys[l.id]) || 0) > 0)
      .map((l) => ({
        lineId: l.id,
        productId: l.productId,
        qtyReceiving: parseInt(receiveQtys[l.id]) || 0,
        batchCode: batchCodes[l.id] ?? null,
        expiryDate: expiryDates[l.id] ?? null,
      }));

    if (lineData.length === 0) {
      toast.error("Enter at least one qty to receive");
      return;
    }

    const validCharges = charges
      .filter((c) => c.label.trim() && (parseFloat(c.amount) || 0) > 0)
      .map((c) => ({
        label: c.label.trim(),
        amount: parseFloat(c.amount) || 0,
        currency: c.currency,
        taxRate: c.taxRate,
        invoiceRef: c.invoiceRef.trim() || null,
      }));

    start(async () => {
      const res = await partialReceivePurchaseOrder({
        poId,
        lines: lineData,
        freightOverride: parseFloat(freight) || 0,
        charges: validCharges,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Stock received and inventory updated");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Receive Stock — Partial or Full</CardTitle>
        <p className="text-xs text-muted-foreground">
          Enter quantities received, freight, and any additional charges from supplier invoices.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Lines table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Receiving Now</TableHead>
              <TableHead>Batch Code</TableHead>
              <TableHead>Expiry Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const outstanding = l.qtyOrdered - l.qtyReceived;
              if (outstanding <= 0) return null;
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                  <TableCell>{l.name}</TableCell>
                  <TableCell className="text-right font-medium text-amber-600">{outstanding}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="text" inputMode="numeric"
                      className="w-20 text-right h-8"
                      placeholder="0"
                      value={receiveQtys[l.id] ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        const num = parseInt(raw) || 0;
                        setReceiveQtys((q) => ({ ...q, [l.id]: String(Math.min(outstanding, num)) }));
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Batch/lot #"
                      className="h-8 text-xs w-28"
                      value={batchCodes[l.id] ?? ""}
                      onChange={(e) => setBatchCodes((b) => ({ ...b, [l.id]: e.target.value }))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-8 text-xs w-36"
                      value={expiryDates[l.id] ?? ""}
                      onChange={(e) => setExpiryDates((d) => ({ ...d, [l.id]: e.target.value }))}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Freight & charges section */}
        <div className="border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold">Freight & Additional Charges</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Freight ({currency})</Label>
              <Input
                type="text" inputMode="decimal"
                className="text-right"
                placeholder="0.00"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
                onBlur={() => setFreight(fmtCurrency(freight))}
              />
            </div>
          </div>

          {/* Custom charge lines */}
          {charges.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                <div className="col-span-3">Description</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-1">Ccy</div>
                <div className="col-span-2">Tax</div>
                <div className="col-span-3">Invoice Ref</div>
                <div className="col-span-1"></div>
              </div>
              {charges.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <Input
                      className="h-8 text-sm"
                      placeholder="e.g. Customs duty, Handling"
                      value={c.label}
                      onChange={(e) => updateCharge(i, "label", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="text" inputMode="decimal"
                      className="h-8 text-right"
                      placeholder="0.00"
                      value={c.amount}
                      onChange={(e) => updateCharge(i, "amount", e.target.value)}
                      onBlur={() => updateCharge(i, "amount", fmtCurrency(c.amount))}
                    />
                  </div>
                  <div className="col-span-1">
                    <Select value={c.currency} onValueChange={(v) => updateCharge(i, "currency", v)}>
                      <SelectTrigger className="h-8 text-xs px-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Select value={String(c.taxRate)} onValueChange={(v) => updateCharge(i, "taxRate", Number(v))}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input
                      className="h-8 text-sm"
                      placeholder="Invoice # (optional)"
                      value={c.invoiceRef}
                      onChange={(e) => updateCharge(i, "invoiceRef", e.target.value)}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeCharge(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button type="button" variant="outline" size="sm" onClick={addCharge}>
            <Plus className="h-4 w-4 mr-1" /> Add charge line
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Receiving..." : "Receive Stock"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
