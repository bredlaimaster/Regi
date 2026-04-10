import { ThemeToggle } from "@/components/theme-toggle";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/logout-button";

export async function Topbar() {
  const session = await requireSession();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  return (
    <header className="h-14 flex items-center justify-between border-b px-4 bg-background">
      <div className="font-medium">{tenant?.name}</div>
      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground">{session.email}</div>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
