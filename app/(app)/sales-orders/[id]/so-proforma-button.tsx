"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createProforma } from "@/actions/proforma";

export function SoProformaButton({ soId }: { soId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleIssue() {
    start(async () => {
      const res = await createProforma(soId);
      if (!res.ok) { toast.error(res.error ?? "Failed to create proforma"); return; }
      toast.success(`Proforma ${res.data.pfNumber} issued`);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={handleIssue}>
      {pending ? "Issuing…" : "Issue Proforma"}
    </Button>
  );
}
