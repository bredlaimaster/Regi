import { NextResponse } from "next/server";
import { fetchAndStoreDailyRates } from "@/lib/fx";

/**
 * Daily cron: fetch ECB reference rates via Frankfurter.app and upsert them
 * into the ExchangeRate table. Runs every day at 06:30 NZT (see vercel.json).
 *
 * Protected by CRON_SECRET so only the platform scheduler can call it.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await fetchAndStoreDailyRates();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
