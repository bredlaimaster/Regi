import { NextResponse } from "next/server";
import { processQboSyncJobs } from "@/lib/quickbooks/sync";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await processQboSyncJobs();
  return NextResponse.json({ ok: true });
}
