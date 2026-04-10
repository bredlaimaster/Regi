import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/quickbooks/oauth";

export async function GET() {
  const session = await requireRole(["ADMIN"]);
  // Encode tenant in state for the callback to pick up.
  const url = buildAuthUrl(session.tenantId);
  return NextResponse.redirect(url);
}
