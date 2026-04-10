"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/types";

type Contact = {
  id?: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  currency?: string;
};

export function ContactForm({
  kind,
  initial,
  upsert,
  remove,
  listPath,
}: {
  kind: "supplier" | "customer";
  initial?: Contact;
  upsert: (input: unknown) => Promise<ActionResult>;
  remove: (id: string) => Promise<ActionResult>;
  listPath: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Contact>(initial ?? { name: "", currency: "NZD" });

  return (
    <form
      className="space-y-4 max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await upsert(f);
          if (!res.ok) return toast.error(res.error);
          toast.success("Saved");
          router.push(listPath);
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
        <div className="space-y-2"><Label>Contact person</Label><Input value={f.contactName ?? ""} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></div>
        <div className="space-y-2"><Label>Email</Label><Input type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="space-y-2"><Label>Phone</Label><Input value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        {kind === "supplier" && (
          <div className="space-y-2"><Label>Currency</Label><Input value={f.currency ?? "NZD"} onChange={(e) => setF({ ...f, currency: e.target.value })} /></div>
        )}
      </div>
      <div className="space-y-2"><Label>Address</Label><Textarea value={f.address ?? ""} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
        {initial?.id && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => start(async () => {
              if (!confirm("Delete?")) return;
              const res = await remove(initial.id!);
              if (!res.ok) return toast.error(res.error);
              router.push(listPath); router.refresh();
            })}
          >Delete</Button>
        )}
      </div>
    </form>
  );
}
