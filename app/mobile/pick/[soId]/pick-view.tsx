"use client";
/**
 * Pick-by-scan UI.
 *
 * Flow:
 *  1. Server renders the SO lines in bin-sort order.
 *  2. The UI highlights the **current line** (first line whose
 *     `qtyPicked + qtyPicking < qtyOrdered`).
 *  3. A barcode scan resolves to a product via `resolveBarcode`.
 *     - If the product matches the current line: increment its local
 *       `qtyPicking`. Case-barcode scans add `caseQty` units in one go.
 *     - If it matches a *later* line: a toast warns "scan the top line first"
 *       (we still increment — some warehouses don't follow strict order).
 *     - If it's not in this SO: toast an error, don't increment anything.
 *  4. "Commit picks" calls `partialPickSalesOrder` with the staged deltas.
 *     On success the server advances status to PICKED when everything is
 *     fully picked, and we go back to the pick list.
 *
 * Commits are idempotent: we send only the staged deltas (`qtyPicking`), and
 * the server re-validates "outstanding" server-side. If the network dies
 * mid-commit you get an error toast and can retry — nothing was lost because
 * the server transaction is atomic.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { BarcodeScanner } from "@/components/mobile/barcode-scanner";
import { resolveBarcode } from "@/actions/mobile";
import { partialPickSalesOrder } from "@/actions/sales-orders";
import type { PickSheet } from "@/actions/mobile";

type LocalLine = PickSheet["lines"][number] & { qtyPicking: number };

export function PickView({ sheet }: { sheet: PickSheet }) {
  const router = useRouter();
  const [lines, setLines] = useState<LocalLine[]>(() =>
    sheet.lines.map((l) => ({ ...l, qtyPicking: 0 })),
  );
  const [scanning, setScanning] = useState(true);
  const [pending, start] = useTransition();

  // The "current line" is the first one not yet fully picked. This drives the
  // "top of hierarchy first" behaviour you asked for.
  const currentIdx = useMemo(
    () => lines.findIndex((l) => l.qtyPicked + l.qtyPicking < l.qtyOrdered),
    [lines],
  );
  const current = currentIdx >= 0 ? lines[currentIdx] : null;
  const allStaged = currentIdx < 0;

  const totalStaged = lines.reduce((n, l) => n + l.qtyPicking, 0);

  function bumpLine(lineId: string, delta: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const outstanding = l.qtyOrdered - l.qtyPicked;
        const next = Math.max(0, Math.min(outstanding, l.qtyPicking + delta));
        return { ...l, qtyPicking: next };
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
      toast.error(`${prod.sku} is not on this order`);
      return;
    }
    const outstanding = match.qtyOrdered - match.qtyPicked - match.qtyPicking;
    if (outstanding <= 0) {
      toast.info(`${prod.sku} already fully picked`);
      return;
    }
    // Case barcode bumps by caseQty; unit barcode bumps by 1. Clamp to outstanding.
    const step = prod.matched === "case" ? prod.caseQty : 1;
    const add = Math.min(step, outstanding);
    setLines((prev) =>
      prev.map((l) => (l.id === match.id ? { ...l, qtyPicking: l.qtyPicking + add } : l)),
    );

    // If the scan targeted a line below the current one, warn softly.
    if (match.id !== current?.id) {
      toast.warning(`${prod.sku} picked out of order`);
    } else {
      toast.success(`+${add} ${prod.sku}`);
    }
  }

  function handleCommit() {
    const picks = lines
      .filter((l) => l.qtyPicking > 0)
      .map((l) => ({ lineId: l.id, qtyPicking: l.qtyPicking }));
    if (picks.length === 0) {
      toast.info("Nothing to commit");
      return;
    }
    start(async () => {
      const res = await partialPickSalesOrder({ soId: sheet.id, lines: picks });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Committed ${totalStaged} unit${totalStaged === 1 ? "" : "s"}`);
      router.push("/mobile/pick");
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <MobileHeader
        title={`${sheet.soNumber} · ${sheet.customerName}`}
        backHref="/mobile/pick"
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
          manualHint={current ? `Expecting ${current.sku} @ ${current.binLocation ?? "—"}` : undefined}
        />

        <ol className="space-y-2">
          {lines.map((l, i) => {
            const picked = l.qtyPicked + l.qtyPicking;
            const done = picked >= l.qtyOrdered;
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
                    {picked} / {l.qtyOrdered} picked
                    {l.qtyPicking > 0 && (
                      <span className="text-primary font-medium"> (+{l.qtyPicking} staged)</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => bumpLine(l.id, -1)}
                    disabled={l.qtyPicking === 0}
                    aria-label="Decrease"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => bumpLine(l.id, 1)}
                    disabled={picked >= l.qtyOrdered}
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
          {pending
            ? "Committing…"
            : allStaged && totalStaged > 0
              ? `Commit & finish (${totalStaged})`
              : `Commit ${totalStaged} unit${totalStaged === 1 ? "" : "s"}`}
        </Button>
      </footer>
    </div>
  );
}
