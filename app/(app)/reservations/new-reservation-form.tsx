"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createReservation } from "@/actions/reservations";

interface Product { id: string; sku: string; name: string }
interface Customer { id: string; name: string }

interface Props {
  products: Product[];
  customers: Customer[];
}

export function NewReservationForm({ products, customers }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [qty, setQty] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);

  function handleSubmit() {
    if (!productId) { toast.error("Select a product"); return; }
    start(async () => {
      const res = await createReservation({
        productId,
        customerId: customerId === "__none__" ? null : customerId || null,
        qtyReserved: parseInt(qty) || 1,
        expiresAt: expiresAt || null,
        notes: notes || null,
      });
      if (!res.ok) { toast.error(res.error ?? "Failed"); return; }
      toast.success("Reservation created");
      setProductId("");
      setCustomerId("");
      setQty("");
      setExpiresAt("");
      setNotes("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline">
        + New Reservation
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New Reservation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Product *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Select product…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Any customer…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Any —</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Qty Reserved *</Label>
            <Input
              type="text" inputMode="numeric"
              placeholder="0"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-28 text-right"
            />
          </div>

          <div className="space-y-1">
            <Label>Expires</Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="col-span-2 space-y-1">
            <Label>Notes</Label>
            <Input
              placeholder="Optional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Saving…" : "Create Reservation"}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
