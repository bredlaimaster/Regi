"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { partialPickSalesOrder } from "@/actions/sales-orders";

interface Line {
  id: string;
  sku: string;
  name: string;
  qtyOrdered: number;
  qtyPicked: number;
}

interface Props {
  soId: string;
  lines: Line[];
}

export function PartialPickForm({ soId, lines }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pickQtys, setPickQtys] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, String(l.qtyOrdered - l.qtyPicked)]))
  );

  function handleSubmit() {
    const lineData = lines
      .filter((l) => (parseInt(pickQtys[l.id]) || 0) > 0)
      .map((l) => ({ lineId: l.id, qtyPicking: parseInt(pickQtys[l.id]) || 0 }));

    if (lineData.length === 0) {
      toast.error("Enter at least one qty to pick");
      return;
    }

    start(async () => {
      const res = await partialPickSalesOrder({ soId, lines: lineData });
      if (!res.ok) { toast.error(res.error ?? "Error"); return; }
      toast.success("Pick quantities saved");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pick Stock — Partial or Full</CardTitle>
        <p className="text-xs text-muted-foreground">
          Enter quantities picked per line. Order advances to PICKED when all lines are fully picked.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Already Picked</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Picking Now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const outstanding = l.qtyOrdered - l.qtyPicked;
              if (outstanding <= 0) return null;
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                  <TableCell>{l.name}</TableCell>
                  <TableCell className="text-right">{l.qtyOrdered}</TableCell>
                  <TableCell className={`text-right ${l.qtyPicked > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {l.qtyPicked > 0 ? l.qtyPicked : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium text-amber-600">{outstanding}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="text" inputMode="numeric"
                      className="w-20 text-right h-8"
                      placeholder="0"
                      value={pickQtys[l.id] ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        const num = parseInt(raw) || 0;
                        setPickQtys((q) => ({ ...q, [l.id]: String(Math.min(outstanding, num)) }));
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex justify-end mt-4">
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Saving…" : "Save Picks"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
