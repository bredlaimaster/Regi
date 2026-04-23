"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { runFullQboSync } from "@/actions/qbo";

export function QboSyncButton({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant="secondary"
      disabled={!connected || pending}
      onClick={() =>
        start(async () => {
          const res = await runFullQboSync();
          if (!res.ok) { toast.error(res.error); return; }
          const { enqueued, succeeded, failed, pending: stillPending } = res.data as {
            enqueued: number; succeeded: number; failed: number; pending: number;
          };
          if (enqueued === 0 && stillPending === 0) {
            toast.success("Nothing to sync — everything is up to date");
          } else {
            toast.success(
              `Synced ${succeeded} ok${failed ? `, ${failed} failed` : ""}${stillPending ? `, ${stillPending} still pending` : ""}`,
            );
          }
          router.refresh();
        })
      }
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Syncing…" : "Sync all to QuickBooks"}
    </Button>
  );
}
