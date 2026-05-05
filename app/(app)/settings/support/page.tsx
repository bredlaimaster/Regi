import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BugTracker } from "./bug-tracker";

export default async function SupportPage() {
  const session = await requireRole(["ADMIN"]);

  const rows = await prisma.bugReport.findMany({
    where: { tenantId: session.tenantId },
    // Open first, then by recency. Stable ordering so the page doesn't
    // jump around as items are toggled.
    orderBy: [{ solved: "asc" }, { createdAt: "desc" }],
  });

  // Serialise dates before passing to a client component.
  const bugs = rows.map((b) => ({
    id: b.id,
    description: b.description,
    affectedAreas: b.affectedAreas,
    driveLink: b.driveLink,
    reporter: b.reporter,
    solved: b.solved,
    resolvedAt: b.resolvedAt?.toISOString() ?? null,
    aiFix: b.aiFix,
    aiFlaggedAt: b.aiFlaggedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <div className="text-xs text-muted-foreground">
          <Link href="/settings" className="hover:underline">Settings</Link>
          {" > "}
          <span>Support</span>
        </div>
        <h1 className="text-2xl font-semibold mt-1">Support</h1>
        <p className="text-sm text-muted-foreground">
          Track bugs, regressions, and follow-up items for the team. Tick the
          box on the left to mark something solved. Use the Drive link field to
          point at a folder of screenshots or screen recordings.
        </p>
      </div>

      <BugTracker bugs={bugs} />
    </div>
  );
}
