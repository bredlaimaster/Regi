"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { releaseReservation } from "@/actions/reservations";

export function ReleaseReservationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleRelease() {
    start(async () => {
      const res = await releaseReservation(id);
      if (!res.ok) { toast.error(res.error ?? "Failed"); return; }
      toast.success("Reservation released");
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-xs h-7 text-muted-foreground hover:text-foreground"
      disabled={pending}
      onClick={handleRelease}
    >
      {pending ? "…" : "Release"}
    </Button>
  );
}
