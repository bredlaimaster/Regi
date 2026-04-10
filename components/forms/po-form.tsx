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
import { upsertPurchaseOrder } from "@/actions/purchase-orders";

type Line = { productId: string; qtyOrdered: number; unitCostNzd: number };
type Product = { id: string; sku: string; name: string };

export function PoForm({
  suppliers,
  products,
  initial,
}: {
  suppliers: { id: string; name: string }[];
  products: Product[];
  initial?: {
    id: string;
    supplierId: string;
    expectedDate: Date | null;
    freightNzd: number | null;
    notes: string | null;
    lines: Line[];
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [expectedDate, setExpectedDate] = useState(
    initial?.expectedDate ? initial.expectedDate.toISOString().slice(0, 10) : ""
  );
  const [freight, setFreight] = useState(Number(initial?.freightNzd ?? 0));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial?.lines ?? [{ productId: "", qtyOrdered: 1, unitCostNzd: 0 }]
  );

  const subtotal = lines.reduce((s, l) => s + l.qtyOrdered * l.unitCostNzd, 0);
  const total = subtotal + Number(freight || 0);

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
            expectedDate: expectedDate || null,
            freightNzd: freight || null,
            notes,
            lines: lines.filter((l) => l.productId),
          });
          if (!res.ok) return toast.error(res.error);
          toast.success("PO saved");
          router.push(`/purchase-orders/${res.data.id}`);
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Supplier</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Expected date</Label>
          <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Freight (NZD)</Label>
          <Input type="number" step="0.01" value={freight} onChange={(e) => setFreight(Number(e.target.value))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Lines</Label>
        <div className="rounded-md border">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
            <div className="col-span-6">Product</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit cost</div>
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
                <Input type="number" className="text-right" value={l.qtyOrdered} onChange={(e) => setLine(i, { qtyOrdered: Number(e.target.value) })} />
              </div>
              <div className="col-span-2">
                <Input type="number" step="0.01" className="text-right" value={l.unitCostNzd} onChange={(e) => setLine(i, { unitCostNzd: Number(e.target.value) })} />
              </div>
              <div className="col-span-1 text-right text-sm">{formatNzd(l.qtyOrdered * l.unitCostNzd)}</div>
              <div className="col-span-1 text-right">
                <Button type="button" variant="ghost" size="icon" onClick={() => setLines((xs) => xs.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((xs) => [...xs, { productId: "", qtyOrdered: 1, unitCostNzd: 0 }])}>
          <Plus className="h-4 w-4 mr-1" /> Add line
        </Button>
      </div>

      <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      <div className="flex items-center justify-between border-t pt-4">
        <div className="text-sm text-muted-foreground">Subtotal {formatNzd(subtotal)} &nbsp; · &nbsp; Freight {formatNzd(freight || 0)}</div>
        <div className="text-lg font-semibold">Total {formatNzd(total)}</div>
      </div>

      <Button type="submit" disabled={pending || !supplierId}>{pending ? "Saving..." : "Save PO"}</Button>
    </form>
  );
}
