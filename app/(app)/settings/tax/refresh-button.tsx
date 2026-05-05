"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { refreshQboTaxCodes } from "@/actions/qbo";

/**
 * Drops the in-memory QBO TaxCode cache for this tenant, refetches from
 * QBO, and reloads the page so the resolved-name column updates. Lives on
 * Settings → Tax for admins who've just edited their QBO tax setup and
 * want to see the change reflected without waiting on the TTL.
 */
export function RefreshTaxCodesButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function onClick() {
    start(async () => {
      const res = await refreshQboTaxCodes();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tax codes refreshed from QuickBooks");
      router.refresh();
    });
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
    >
      <RefreshCw className={"h-4 w-4 mr-1.5" + (pending ? " animate-spin" : "")} />
      {pending ? "Refreshing…" : "Refresh from QuickBooks"}
    </Button>
  );
}
