/**
 * Exchange rate handling.
 *
 * Rates are fetched daily from Frankfurter.app (ECB reference rates — free,
 * no API key). Source of truth for historical rates is the ExchangeRate table.
 *
 * All rates are stored as `nzdPerUnit` — the number of NZD required to buy
 * 1 unit of the foreign currency. Example: if 1 USD = 1.69 NZD, nzdPerUnit
 * for USD is 1.69000000.
 */

import { prisma } from "@/lib/prisma";
import { FOREIGN_CURRENCIES, type Currency } from "@/lib/currency";

const FRANKFURTER_BASE = "https://api.frankfurter.app";

type FrankfurterResponse = {
  amount: number;
  base: string;
  date: string;   // YYYY-MM-DD
  rates: Record<string, number>;
};

/** Fetch today's reference rates and upsert them into the DB. */
export async function fetchAndStoreDailyRates(): Promise<{ date: Date; rows: number }> {
  // base=NZD gives us "1 NZD = X foreign" for each requested symbol.
  // We invert below to store nzdPerUnit (NZD per 1 unit of foreign).
  const symbols = FOREIGN_CURRENCIES.join(",");
  const url = `${FRANKFURTER_BASE}/latest?from=NZD&to=${symbols}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Frankfurter ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as FrankfurterResponse;

  const date = new Date(data.date + "T00:00:00Z");

  let rows = 0;
  for (const currency of FOREIGN_CURRENCIES) {
    const nzdInForeign = data.rates[currency];
    if (!nzdInForeign || nzdInForeign <= 0) continue;
    const nzdPerUnit = 1 / nzdInForeign;
    await prisma.exchangeRate.upsert({
      where: { date_currency: { date, currency } },
      create: { date, currency, nzdPerUnit },
      update: { nzdPerUnit },
    });
    rows++;
  }
  return { date, rows };
}

/**
 * Get the most recent rate for a currency.
 * - NZD always returns 1.
 * - If no rate exists yet, fetches synchronously as a fallback.
 * Returns an object with the rate value and the date it applies to.
 */
export async function getLatestRate(
  currency: Currency | string
): Promise<{ nzdPerUnit: number; date: Date }> {
  if (currency === "NZD") return { nzdPerUnit: 1, date: new Date() };

  let latest = await prisma.exchangeRate.findFirst({
    where: { currency },
    orderBy: { date: "desc" },
  });

  // Bootstrap: if we've never fetched rates, do it now so the caller can't
  // block on a missing feed.
  if (!latest) {
    await fetchAndStoreDailyRates();
    latest = await prisma.exchangeRate.findFirst({
      where: { currency },
      orderBy: { date: "desc" },
    });
  }

  if (!latest) throw new Error(`No FX rate available for ${currency}`);
  return { nzdPerUnit: Number(latest.nzdPerUnit), date: latest.date };
}

/** Get the latest rate for every supported currency (including NZD = 1). */
export async function getLatestRatesAll(): Promise<
  Record<Currency, { nzdPerUnit: number; date: Date }>
> {
  const rows = await Promise.all(
    FOREIGN_CURRENCIES.map(async (c) => [c, await getLatestRate(c)] as const)
  );
  return {
    NZD: { nzdPerUnit: 1, date: new Date() },
    ...Object.fromEntries(rows),
  } as Record<Currency, { nzdPerUnit: number; date: Date }>;
}
