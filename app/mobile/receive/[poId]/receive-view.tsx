"use client";
/**
 * Receive-by-scan UI. Mirror of PickView but writes to the PO receive path.
 *
 * Commits delegate to `partialReceivePurchaseOrder` which also handles
 * landed-cost pro-rata, batch creation, and stock-level upsert. Receive charges
 * (freight, customs) are **not** captured from the phone — those live on the
 * web app's receive dialog where the supplier invoice is keyed in. Here we
 * just stage and commit quantities.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { BarcodeScanner } from "@/components/mobile/barcode-scanner";
import { resolveBarcode } from "@/actions/mobile";
import { partialReceivePurchaseOrder } from "@/actions/purchase-orders";
import type { ReceiveSheet } from "@/actions/mobile";

type LocalLine = ReceiveSheet["lines"][number] & { qtyReceiving: number };

export function ReceiveView({ sheet }: { sheet: ReceiveSheet }) {
  const router = useRouter();
  const [lines, setLines] = useState<LocalLine[]>(() =>
    sheet.lines.map((l) => ({ ...l, qtyReceiving: 0 })),
  );
  const [scanning, setScanning] = useState(true);
  const [pending, start] = useTransition();

  const currentIdx = useMemo(
    () => lines.findIndex((l) => l.qtyReceived + l.qtyReceiving < l.qtyOrdered),
    [lines],
  );
  const current = currentIdx >= 0 ? lines[currentIdx] : null;
  const totalStaged = lines.reduce((n, l) => n + l.qtyReceiving, 0);

  function bumpLine(lineId: string, delta: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const outstanding = l.qtyOrdered - l.qtyReceived;
        const next = Math.max(0, Math.min(outstanding, l.qtyReceiving + delta));
        return { ...l, qtyReceiving: next };
      }),
    );
  }

  async function handleScan(code: string) {
    const res = await resolveBarcode({ code });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const prod = res.data;
    const match = lines.find((l) => l.productId === prod.productId);
    if (!match) {
      toast.error(`${prod.sku} is not on this PO`);
      return;
    }
    const outstanding = match.qtyOrdered - match.qtyReceived - match.qtyReceiving;
    if (outstanding <= 0) {
      toast.info(`${prod.sku} already fully received`);
      return;
    }
    const step = prod.matched === "case" ? prod.caseQty : 1;
    const add = Math.min(step, outstanding);
    setLines((prev) =>
      prev.map((l) => (l.id === match.id ? { ...l, qtyReceiving: l.qtyReceiving + add } : l)),
    );
    toast.success(`+${add} ${prod.sku}`);
  }

  function handleCommit() {
    const receives = lines
      .filter((l) => l.qtyReceiving > 0)
      .map((l) => ({ lineId: l.id, productId: l.productId, qtyReceiving: l.qtyReceiving }));
    if (receives.length === 0) {
      toast.info("Nothing to commit");
      return;
    }
    start(async () => {
      const res = await partialReceivePurchaseOrder({
        poId: sheet.id,
        lines: receives,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Received ${totalStaged} unit${totalStaged === 1 ? "" : "s"}`);
      router.push("/mobile/receive");
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <MobileHeader
        title={`${sheet.poNumber} · ${sheet.supplierName}`}
        backHref="/mobile/receive"
        right={
          <Button
            size="sm"
            variant={scanning ? "secondary" : "default"}
            onClick={() => setScanning((s) => !s)}
          >
            {scanning ? "Pause" : "Scan"}
          </Button>
        }
      />

      <main className="flex-1 p-3 space-y-3">
        <BarcodeScanner
          active={scanning}
          onDetect={handleScan}
          onError={(m) => toast.error(m)}
          manualHint={current ? `Next: ${current.sku} @ ${current.binLocation ?? "—"}` : undefined}
        />

        <p className="text-xs text-muted-foreground">
          Freight and landed charges are captured on the desktop Receive dialog
          once the supplier invoice arrives.
        </p>

        <ol className="space-y-2">
          {lines.map((l, i) => {
            const received = l.qtyReceived + l.qtyReceiving;
            const done = received >= l.qtyOrdered;
            const isCurrent = i === currentIdx;
            return (
              <li
                key={l.id}
                className={[
                  "rounded-lg border p-3 flex items-center gap-3",
                  done ? "bg-green-500/5 border-green-500/30" : "bg-card",
                  isCurrent ? "ring-2 ring-primary" : "",
                ].join(" ")}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {l.binLocation ?? "—"}
                    </span>
                    <span className="font-semibold truncate">{l.sku}</span>
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{l.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {received} / {l.qtyOrdered} received
                    {l.qtyReceiving > 0 && (
                      <span className="text-primary font-medium"> (+{l.qtyReceiving} staged)</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => bumpLine(l.id, -1)}
                    disabled={l.qtyReceiving === 0}
                    aria-label="Decrease"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => bumpLine(l.id, 1)}
                    disabled={received >= l.qtyOrdered}
                    aria-label="Increase"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </main>

      <footer className="sticky bottom-0 bg-background border-t p-3">
        <Button
          className="w-full h-12 text-base"
          disabled={pending || totalStaged === 0}
          onClick={handleCommit}
        >
          <Check className="h-5 w-5 mr-2" />
          {pending ? "Committing…" : `Commit ${totalStaged} unit${totalStaged === 1 ? "" : "s"}`}
        </Button>
      </footer>
    </div>
  );
}
