"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createTenant } from "@/actions/tenant";
import { useRouter } from "next/navigation";

export function OnboardingForm({ email }: { email: string }) {
  const [name, setName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createTenant({ email, name, tenantName });
          if (!res.ok) toast.error(res.error);
          else {
            toast.success("Workspace created");
            router.push("/");
            router.refresh();
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label>Your name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Business name</Label>
        <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating..." : "Create workspace"}
      </Button>
    </form>
  );
}
