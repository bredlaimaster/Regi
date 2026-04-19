import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DimensionManager } from "./dimension-manager";
import {
  upsertBrand, deleteBrand,
  upsertChannel, deleteChannel,
  upsertTerritory, deleteTerritory,
} from "@/actions/dimensions";

export default async function DimensionsPage() {
  const session = await requireSession();
  const [brands, channels, territories] = await Promise.all([
    prisma.brand.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.channel.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
    prisma.territory.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Brands, Channels &amp; Territories</h1>
        <p className="text-sm text-muted-foreground">
          Dimension tables used for reporting, budgets, and customer segmentation
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Brands</CardTitle></CardHeader>
        <CardContent>
          <DimensionManager
            label="Brand"
            items={brands}
            upsert={upsertBrand}
            remove={deleteBrand}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sales Channels</CardTitle></CardHeader>
        <CardContent>
          <DimensionManager
            label="Channel"
            items={channels}
            upsert={upsertChannel}
            remove={deleteChannel}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Territories</CardTitle></CardHeader>
        <CardContent>
          <DimensionManager
            label="Territory"
            items={territories}
            upsert={upsertTerritory}
            remove={deleteTerritory}
          />
        </CardContent>
      </Card>
    </div>
  );
}
