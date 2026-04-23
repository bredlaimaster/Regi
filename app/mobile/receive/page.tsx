import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { receivablePurchaseOrders } from "@/actions/mobile";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { formatNzDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReceiveListPage() {
  const res = await receivablePurchaseOrders();
  const rows = res.ok ? res.data : [];

  return (
    <div className="min-h-screen flex flex-col">
      <MobileHeader title="Receive goods" backHref="/mobile" />
      <main className="flex-1 p-3 space-y-2">
        {rows.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">
            No purchase orders awaiting receipt.
          </div>
        )}
        {rows.map((po) => (
          <Link
            key={po.id}
            href={`/mobile/receive/${po.id}`}
            className="flex items-center gap-3 rounded-lg border bg-card p-3 active:bg-accent"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{po.poNumber}</div>
              <div className="text-sm text-muted-foreground truncate">{po.supplierName}</div>
              <div className="text-xs text-muted-foreground">
                {formatNzDate(po.orderDate)} · {po.linesOutstanding} unit{po.linesOutstanding === 1 ? "" : "s"} to receive
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
      </main>
    </div>
  );
}
