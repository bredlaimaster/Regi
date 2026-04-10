import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/settings/users"><Card className="hover:border-primary/50"><CardHeader><CardTitle>Users & roles</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Invite teammates and manage access.</CardContent></Card></Link>
        <Link href="/settings/quickbooks"><Card className="hover:border-primary/50"><CardHeader><CardTitle>QuickBooks Online</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Connect and monitor sync jobs.</CardContent></Card></Link>
        <Link href="/settings/audit"><Card className="hover:border-primary/50"><CardHeader><CardTitle>Audit trail</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Every stock movement, ever.</CardContent></Card></Link>
      </div>
    </div>
  );
}
