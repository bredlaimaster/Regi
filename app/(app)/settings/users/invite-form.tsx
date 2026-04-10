"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteUser } from "@/actions/users";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"ADMIN" | "SALES" | "WAREHOUSE">("WAREHOUSE");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await inviteUser({ email, name, role });
          if (!res.ok) { toast.error(res.error); return; }
          toast.success("Invited");
          setEmail(""); setName("");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="SALES">Sales</SelectItem>
            <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Inviting..." : "Invite"}</Button>
    </form>
  );
}
