import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";

interface Props {
  tenantId: string;
  reportKey: string;
}

export async function LastSentBadge({ tenantId, reportKey }: Props) {
  const last = await prisma.reportDelivery.findFirst({
    where: { tenantId, reportKey },
    orderBy: { deliveredAt: "desc" },
  });

  if (!last) return null;

  const formatted = new Date(last.deliveredAt).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (last.status === "SENT") {
    return (
      <Badge variant="outline" className="text-xs font-normal text-emerald-600 border-emerald-200">
        ✓ Last sent {formatted}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs font-normal text-rose-600 border-rose-200">
      ✗ Failed {formatted}
    </Badge>
  );
}
