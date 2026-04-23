import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { pickableSalesOrders } from "@/actions/mobile";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { formatNzDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PickListPage() {
  const res = await pickableSalesOrders();
  const rows = res.ok ? res.data : [];

  return (
    <div className="min-h-screen flex flex-col">
      <MobileHeader title="Pick orders" backHref="/mobile" />
      <main className="flex-1 p-3 space-y-2">
        {rows.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">
            No confirmed orders to pick.
          </div>
        )}
        {rows.map((so) => (
          <Link
            key={so.id}
            href={`/mobile/pick/${so.id}`}
            className="flex items-center gap-3 rounded-lg border bg-card p-3 active:bg-accent"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{so.soNumber}</div>
              <div className="text-sm text-muted-foreground truncate">{so.customerName}</div>
              <div className="text-xs text-muted-foreground">
                {formatNzDate(so.orderDate)} · {so.linesOutstanding} unit{so.linesOutstanding === 1 ? "" : "s"} to pick
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
      </main>
    </div>
  );
}
