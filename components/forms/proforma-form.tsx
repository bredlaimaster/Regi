"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { formatNzd } from "@/lib/utils";
import { createStandaloneProforma } from "@/actions/proforma";

type Line = { productId: string; qtyOrdered: string };
type GroupPriceEntry = { priceGroupId: string; unitPrice: number; minQty: number };
type Product = { id: string; sku: string; name: string; sellPriceNzd: number; stock: number; prices?: GroupPriceEntry[] };
type Customer = { id: string; name: string; priceGroupId?: string | null };
type PriceGroup = { id: string; name: string };

function resolvePrice(product: Product, priceGroupId: string | null | undefined, qty: number): number {
  if (!priceGroupId || !product.prices || product.prices.length === 0) return product.sellPriceNzd;
  const matches = product.prices
    .filter((p) => p.priceGroupId === priceGroupId && p.minQty <= qty)
    .sort((a, b) => b.minQty - a.minQty);
  return matches.length > 0 ? matches[0].unitPrice : product.sellPriceNzd;
}

export function ProformaForm({
  customers,
  products,
  priceGroups,
}: {
  customers: Customer[];
  products: Product[];
  priceGroups: PriceGroup[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", qtyOrdered: "" }]);
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const groupMap = Object.fromEntries(priceGroups.map((g) => [g.id, g.name]));
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const customerGroupId = selectedCustomer?.priceGroupId ?? null;
  const customerGroupName = customerGroupId ? groupMap[customerGroupId] : null;

  const subtotal = lines.reduce((s, l) => {
    const p = productMap[l.productId];
    const qty = parseInt(l.qtyOrdered) || 0;
    return s + (p ? resolvePrice(p, customerGroupId, qty) * qty : 0);
  }, 0);
  const gst = subtotal * 0.15;
  const total = subtotal + gst;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createStandaloneProforma({
            customerId,
            notes,
            lines: lines.filter((l) => l.productId).map((l) => ({
              productId: l.productId,
              qtyOrdered: parseInt(l.qtyOrdered) || 0,
            })),
          });
          if (!res.ok) { toast.error(res.error); return; }
          toast.success(`Proforma ${res.data.pfNumber} created`);
          router.push("/proforma");
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>{customers.map((c) => {
              const groupName = c.priceGroupId ? groupMap[c.priceGroupId] : null;
              return (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}{groupName ? ` (${groupName})` : ""}
                </SelectItem>
              );
            })}</SelectContent>
          </Select>
          {customerGroupName && (
            <p className="text-xs text-muted-foreground mt-1">
              Price group: <span className="font-medium">{customerGroupName}</span>
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Lines</Label>
        <div className="rounded-md border">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
            <div className="col-span-6">Product</div>
            <div className="col-span-2 text-right">Stock</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-1 text-right">Line</div>
            <div className="col-span-1"></div>
          </div>
          {lines.map((l, i) => {
            const p = productMap[l.productId];
            return (
              <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center">
                <div className="col-span-6">
                  <Select value={l.productId} onValueChange={(v) => setLines((xs) => xs.map((x, idx) => idx === i ? { ...x, productId: v } : x))}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 text-right text-sm text-muted-foreground">{p?.stock ?? "—"}</div>
                <div className="col-span-2">
                  <Input type="text" inputMode="numeric" className="text-right" placeholder="0" value={l.qtyOrdered}
                    onChange={(e) => setLines((xs) => xs.map((x, idx) => idx === i ? { ...x, qtyOrdered: e.target.value.replace(/[^0-9]/g, "") } : x))} />
                </div>
                <div className="col-span-1 text-right text-sm">{p ? formatNzd(resolvePrice(p, customerGroupId, parseInt(l.qtyOrdered) || 0) * (parseInt(l.qtyOrdered) || 0)) : "—"}</div>
                <div className="col-span-1 text-right">
                  <Button type="button" variant="ghost" size="icon" onClick={() => setLines((xs) => xs.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((xs) => [...xs, { productId: "", qtyOrdered: "" }])}>
          <Plus className="h-4 w-4 mr-1" /> Add line
        </Button>
      </div>

      <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      <div className="flex justify-end gap-6 text-sm pt-2 border-t">
        <div>Subtotal {formatNzd(subtotal)}</div>
        <div>GST (15%) {formatNzd(gst)}</div>
        <div className="text-lg font-semibold">Total {formatNzd(total)}</div>
      </div>

      <Button type="submit" disabled={pending || !customerId}>{pending ? "Creating..." : "Create proforma"}</Button>
    </form>
  );
}
