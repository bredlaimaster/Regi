import { ClipboardList, PackageCheck, Boxes, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { TileLink } from "@/components/mobile/tile-link";
import { signOutAction } from "@/actions/users";

export default async function MobileHome() {
  const session = await requireSession();

  return (
    <main className="p-4 pb-8">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">NZ Inventory</h1>
          <p className="text-sm text-muted-foreground">{session.email}</p>
          <p className="text-xs text-muted-foreground capitalize">{session.role.toLowerCase()}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            className="p-2 rounded-md active:bg-accent"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </header>

      <div className="space-y-3">
        <TileLink
          href="/mobile/pick"
          icon={ClipboardList}
          title="Pick orders"
          subtitle="Pick sales orders with the scanner"
        />
        <TileLink
          href="/mobile/receive"
          icon={PackageCheck}
          title="Receive goods"
          subtitle="Scan incoming purchase orders"
        />
        <TileLink
          href="/mobile/stocktake"
          icon={Boxes}
          title="Stock take"
          subtitle="Scan and adjust stock levels"
        />
      </div>

      <p className="mt-6 text-xs text-muted-foreground text-center">
        Tip: add to Home Screen in Chrome &rsaquo; ⋮ &rsaquo; Install app.
      </p>
    </main>
  );
}
