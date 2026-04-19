import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "./invite-form";
import { UserRowActions } from "./user-row-actions";

export default async function UsersPage() {
  const session = await requireRole(["ADMIN"]);
  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "asc" },
  });
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="text-sm text-muted-foreground">
        Create users with an immediate password — they can sign in right away. No email required.
      </p>
      <InviteForm />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isSelf = u.id === session.userId;
              return (
                <TableRow key={u.id}>
                  <TableCell>{u.email}{isSelf && <span className="text-muted-foreground text-xs ml-2">(you)</span>}</TableCell>
                  <TableCell>{u.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{u.role}</Badge></TableCell>
                  <TableCell>
                    {u.passwordHash
                      ? <Badge variant="success">Can sign in</Badge>
                      : <Badge variant="destructive">No password</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserRowActions
                      userId={u.id}
                      email={u.email}
                      hasPassword={!!u.passwordHash}
                      canDelete={!isSelf}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
