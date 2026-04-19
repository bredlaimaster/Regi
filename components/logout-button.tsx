"use client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/actions/users";

export function LogoutButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => signOutAction()}
      aria-label="Log out"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
