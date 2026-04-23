"use client";
/**
 * Stock-take by scan.
 *
 * Flow:
 *  1. Scan → `resolveBarcode` returns product + current stock.
 *  2. Show "counted now" input with current qty as default.
 *  3. "Save" → `adjustStock` with delta = counted − current, notes "Stock take".
 *  4. Auto-resume scanning for the next item.
 *
 * This differs from the Web app's AdjustDialog in that we don't need the user
 * to pick a product — the scanner does. Reason defaults to "Stock take" and
 * can be overridden.
 */
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarcodeScanner } from "@/components/mobile/barcode-scanner";
import { resolveBarcode, type ResolvedBarcode } from "@/actions/mobile";
import { adjustStock } from "@/actions/inventory";

type State =
  | { kind: "scanning" }
  | { kind: "counting"; product: ResolvedBarcode; counted: string }
  | { kind: "saving" };

export function StockTakeView() {
  const [state, setState] = useState<State>({ kind: "scanning" });
  const [notes, setNotes] = useState("Stock take");
  const [pending, start] = useTransition();

  async function handleScan(code: string) {
    const res = await resolveBarcode({ code });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setState({ kind: "counting", product: res.data, counted: String(res.data.stockQty) });
  }

  function save() {
    if (state.kind !== "counting") return;
    const { product, counted } = state;
    const counted_ = parseInt(counted, 10);
    if (Number.isNaN(counted_) || counted_ < 0) {
      toast.error("Enter a valid count");
      return;
    }
    const delta = counted_ - product.stockQty;
    if (delta === 0) {
      toast.info("No change");
      setState({ kind: "scanning" });
      return;
    }
    start(async () => {
      const res = await adjustStock({
        productId: product.productId,
        qtyChange: delta,
        notes: notes || "Stock take",
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${product.sku}: ${delta > 0 ? "+" : ""}${delta}`);
      setState({ kind: "scanning" });
    });
  }

  return (
    <main className="flex-1 p-3 space-y-3">
      {state.kind === "scanning" && (
        <BarcodeScanner
          active
          onDetect={handleScan}
          onError={(m) => toast.error(m)}
          manualHint="Scan any product to count it"
        />
      )}

      {state.kind === "counting" && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div>
            <div className="font-semibold">{state.product.sku}</div>
            <div className="text-sm text-muted-foreground">{state.product.name}</div>
            <div className="text-xs text-muted-foreground">
              Bin {state.product.binLocation ?? "—"} · system shows{" "}
              <span className="font-mono">{state.product.stockQty}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Counted now</Label>
            <Input
              type="text"
              inputMode="numeric"
              className="text-2xl h-14 text-center font-mono"
              value={state.counted}
              onChange={(e) =>
                setState({ ...state, counted: e.target.value.replace(/[^0-9]/g, "") })
              }
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setState({ kind: "scanning" })}
            >
              Cancel
            </Button>
            <Button className="flex-1 h-12" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save & scan next"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
