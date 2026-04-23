import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNzDateTime } from "@/lib/utils";
import { QboSyncButton } from "./sync-button";

export default async function QboSettingsPage() {
  const session = await requireRole(["ADMIN"]);
  const conn = await prisma.qboConnection.findUnique({ where: { tenantId: session.tenantId } });
  const failing = await prisma.qboSyncJob.findMany({
    where: { tenantId: session.tenantId, status: { in: ["PENDING", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">QuickBooks Online</h1>

      <Card>
        <CardHeader><CardTitle>Connection</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {conn ? (
            <div className="space-y-1 text-sm">
              <div>Connected to Realm <span className="font-mono">{conn.realmId}</span></div>
              <div className="text-muted-foreground">
                Connection valid until {conn.refreshTokenExpiresAt ? formatNzDateTime(conn.refreshTokenExpiresAt) : "unknown"}
                {" · "}Access token auto-refreshes every hour
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Not connected.</div>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button asChild>
              <Link href="/api/qbo/connect">{conn ? "Reconnect" : "Connect QuickBooks"}</Link>
            </Button>
            <QboSyncButton connected={!!conn} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pending / failed sync jobs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {failing.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="text-xs">{formatNzDateTime(j.createdAt)}</TableCell>
                  <TableCell>{j.entityType}</TableCell>
                  <TableCell><Badge variant={j.status === "FAILED" ? "destructive" : "secondary"}>{j.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{j.lastError ?? "—"}</TableCell>
                </TableRow>
              ))}
              {failing.length === 0 && (<TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">All clear</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
