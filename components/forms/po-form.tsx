"use client";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { formatNzd } from "@/lib/utils";
import {
  SUPPORTED_CURRENCIES, CURRENCY_META, formatCurrency, type Currency,
} from "@/lib/currency";
import { upsertPurchaseOrder } from "@/actions/purchase-orders";

type Line = { productId: string; qtyOrdered: string; unitCost: string };
type Product = { id: string; sku: string; name: string };
type Rates = Record<Currency, { nzdPerUnit: number; date: string }>;

export function PoForm({
  suppliers,
  products,
  rates,
  initial,
}: {
  suppliers: { id: string; name: string; currency: string }[];
  products: Product[];
  rates: Rates;
  initial?: {
    id: string;
    supplierId: string;
    currency: Currency;
    fxRate: number;
    expectedDate: Date | null;
    freight: number | null;
    notes: string | null;
    lines: { productId: string; qtyOrdered: number; unitCost: number }[];
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "NZD");
  const [expectedDate, setExpectedDate] = useState(
    initial?.expectedDate ? initial.expectedDate.toISOString().slice(0, 10) : ""
  );
  const [freight, setFreight] = useState(initial?.freight != null ? Number(initial.freight).toFixed(2) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.map((l) => ({ productId: l.productId, qtyOrdered: String(l.qtyOrdered), unitCost: l.unitCost.toFixed(2) }))
    ?? [{ productId: "", qtyOrdered: "", unitCost: "" }]
  );

  /** Format a currency string to 2 decimal places on blur */
  function fmtCurrency(val: string): string {
    const n = parseFloat(val);
    return isNaN(n) || val === "" ? "" : n.toFixed(2);
  }

  const rateInfo = rates[currency];
  const fxRate = rateInfo.nzdPerUnit;

  const subtotalSrc = lines.reduce((s, l) => s + (parseInt(l.qtyOrdered) || 0) * (parseFloat(l.unitCost) || 0), 0);
  const totalSrc = subtotalSrc + (parseFloat(freight) || 0);
  const totalNzd = useMemo(() => Math.round(totalSrc * fxRate * 100) / 100, [totalSrc, fxRate]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((xs) => xs.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await upsertPurchaseOrder({
            id: initial?.id,
            supplierId,
            currency,
            expectedDate: expectedDate || null,
            freight: parseFloat(freight) || null,
            notes,
            lines: lines.filter((l) => l.productId).map((l) => ({
              productId: l.productId,
              qtyOrdered: parseInt(l.qtyOrdered) || 0,
              unitCost: parseFloat(l.unitCost) || 0,
            })),
          });
          if (!res.ok) { toast.error(res.error); return; }
          toast.success("PO saved");
          router.push(`/purchase-orders/${res.data.id}`);
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Supplier</Label>
          <Select
            value={supplierId}
            onValueChange={(id) => {
              setSupplierId(id);
              const sup = suppliers.find((s) => s.id === id);
              if (sup && (SUPPORTED_CURRENCIES as readonly string[]).includes(sup.currency)) {
                setCurrency(sup.currency as Currency);
              }
            }}
          >
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CURRENCY_META[c].flag} {c} — {CURRENCY_META[c].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currency !== "NZD" && (
            <p className="text-xs text-muted-foreground">
              Rate: 1 {currency} = {fxRate.toFixed(4)} NZD
              {rateInfo.date && <> · {new Date(rateInfo.date).toISOString().slice(0, 10)}</>}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Expected date</Label>
          <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Freight ({currency})</Label>
          <Input type="text" inputMode="decimal" className="text-right" placeholder="0.00" value={freight} onChange={(e) => setFreight(e.target.value)} onBlur={() => setFreight(fmtCurrency(freight))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Lines</Label>
        <div className="rounded-md border">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
            <div className="col-span-6">Product</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit cost ({currency})</div>
            <div className="col-span-1 text-right">Line</div>
            <div className="col-span-1"></div>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center">
              <div className="col-span-6">
                <Select value={l.productId} onValueChange={(v) => setLine(i, { productId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Input type="text" inputMode="numeric" className="text-right" placeholder="0" value={l.qtyOrdered} onChange={(e) => setLine(i, { qtyOrdered: e.target.value.replace(/[^0-9]/g, "") })} />
              </div>
              <div className="col-span-2">
                <Input type="text" inputMode="decimal" className="text-right" placeholder="0.00" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} onBlur={() => setLine(i, { unitCost: fmtCurrency(l.unitCost) })} />
              </div>
              <div className="col-span-1 text-right text-sm">{formatCurrency((parseInt(l.qtyOrdered) || 0) * (parseFloat(l.unitCost) || 0), currency)}</div>
              <div className="col-span-1 text-right">
                <Button type="button" variant="ghost" size="icon" onClick={() => setLines((xs) => xs.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((xs) => [...xs, { productId: "", qtyOrdered: "", unitCost: "" }])}>
          <Plus className="h-4 w-4 mr-1" /> Add line
        </Button>
      </div>

      <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      <div className="rounded-md border p-4 space-y-1 bg-muted/30">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(subtotalSrc, currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Freight</span>
          <span>{formatCurrency(parseFloat(freight) || 0, currency)}</span>
        </div>
        <div className="flex justify-between text-lg font-semibold pt-1 border-t">
          <span>Total ({currency})</span>
          <span>{formatCurrency(totalSrc, currency)}</span>
        </div>
        {currency !== "NZD" && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>≈ NZD equivalent</span>
            <span>{formatNzd(totalNzd)}</span>
          </div>
        )}
      </div>

      <Button type="submit" disabled={pending || !supplierId}>{pending ? "Saving..." : "Save PO"}</Button>
    </form>
  );
}
