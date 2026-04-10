"use client";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={async () => {
        const sb = createClient();
        await sb.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      aria-label="Log out"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
