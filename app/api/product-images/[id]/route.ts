/**
 * Stream the raw bytes of a stored ProductImage.
 *
 * Authentication: any authenticated user with a session can fetch any image
 * within their own tenant. Cross-tenant requests are rejected via the same
 * `assertTenant` guard the actions use.
 *
 * Caching: 24h max-age. The id is a cuid so URLs are unguessable and stable
 * for the lifetime of the row; deletes purge the row entirely so there's no
 * stale-cache-after-delete concern.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, assertTenant } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;

  const img = await prisma.productImage.findUnique({
    where: { id },
    select: {
      bytes: true,
      contentType: true,
      filename: true,
      product: { select: { tenantId: true } },
    },
  });
  if (!img) return new NextResponse("Not found", { status: 404 });
  assertTenant(img.product.tenantId, session.tenantId);

  const headers: Record<string, string> = {
    "Content-Type": img.contentType,
    "Cache-Control": "private, max-age=86400, immutable",
  };
  if (img.filename) {
    // Sanitise quotes for header safety.
    const safe = img.filename.replace(/"/g, "");
    headers["Content-Disposition"] = `inline; filename="${safe}"`;
  }

  return new NextResponse(Buffer.from(img.bytes), { status: 200, headers });
}
