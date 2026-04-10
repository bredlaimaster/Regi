"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setSoStatus, shipSalesOrder } from "@/actions/sales-orders";
import type { SOStatus } from "@prisma/client";

export function SoActions({ soId, status, trackingRef }: { soId: string; status: SOStatus; trackingRef: string | null }) {
  const router = useRouter();
  const [tracking, setTracking] = useState(trackingRef ?? "");
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? "Error"); return; }
      toast.success("Updated");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" && (<>
        <Button disabled={pending} onClick={() => run(() => setSoStatus(soId, "CONFIRMED"))}>Confirm</Button>
        <Button variant="destructive" disabled={pending} onClick={() => run(() => setSoStatus(soId, "CANCELLED"))}>Cancel</Button>
      </>)}
      {status === "CONFIRMED" && (
        <Button disabled={pending} onClick={() => run(() => setSoStatus(soId, "PICKED"))}>Mark Picked</Button>
      )}
      {status === "PICKED" && (
        <div className="flex items-center gap-2">
          <Input placeholder="Tracking reference" value={tracking} onChange={(e) => setTracking(e.target.value)} className="w-64" />
          <Button disabled={pending || !tracking} onClick={() => run(() => shipSalesOrder({ id: soId, trackingRef: tracking }))}>Ship</Button>
        </div>
      )}
      {status === "SHIPPED" && trackingRef && (
        <div className="text-sm text-muted-foreground">Tracking: <span className="font-mono">{trackingRef}</span></div>
      )}
    </div>
  );
}
