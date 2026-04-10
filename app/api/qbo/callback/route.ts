import { NextResponse } from "next/server";
import { exchangeCode, storeConnection } from "@/lib/quickbooks/oauth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const tenantId = searchParams.get("state");
  if (!code || !realmId || !tenantId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }
  const tok = await exchangeCode(code);
  await storeConnection(tenantId, realmId, tok);
  return NextResponse.redirect(`${process.env.APP_URL}/settings/quickbooks?connected=1`);
}
