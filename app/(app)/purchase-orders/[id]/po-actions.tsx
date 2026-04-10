"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setPoStatus, receivePurchaseOrder } from "@/actions/purchase-orders";
import type { POStatus } from "@prisma/client";

export function PoActions({ poId, status }: { poId: string; status: POStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error ?? "Error");
      toast.success("Updated");
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      {status === "DRAFT" && (
        <>
          <Button disabled={pending} onClick={() => run(() => setPoStatus(poId, "ORDERED"))}>Mark Ordered</Button>
          <Button variant="destructive" disabled={pending} onClick={() => run(() => setPoStatus(poId, "CANCELLED"))}>Cancel</Button>
        </>
      )}
      {status === "ORDERED" && (
        <Button disabled={pending} onClick={() => run(() => receivePurchaseOrder(poId))}>Receive into stock</Button>
      )}
    </div>
  );
}
