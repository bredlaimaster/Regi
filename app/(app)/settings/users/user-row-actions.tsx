"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setUserPassword, deleteUser } from "@/actions/users";

export function UserRowActions({
  userId,
  email,
  hasPassword,
  canDelete,
}: {
  userId: string;
  email: string;
  hasPassword: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState("");

  function save() {
    if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    start(async () => {
      const res = await setUserPassword({ id: userId, password: pw });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Password set for ${email}`);
      setPw(""); setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    start(async () => {
      const res = await deleteUser(userId);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("User deleted");
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex gap-2 items-center">
        <Input
          type="password"
          placeholder="New password (min 8)"
          className="h-8 w-48"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          minLength={8}
        />
        <Button size="sm" onClick={save} disabled={pending || pw.length < 8}>
          {pending ? "..." : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setPw(""); }}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-center justify-end">
      <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={pending}>
        {hasPassword ? "Reset password" : "Set password"}
      </Button>
      {canDelete && (
        <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
          Delete
        </Button>
      )}
    </div>
  );
}
