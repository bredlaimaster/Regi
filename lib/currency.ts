/** Supported purchase order currencies. Display order is deliberate: NZD first. */
export const SUPPORTED_CURRENCIES = ["NZD", "USD", "GBP", "EUR", "AUD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_META: Record<Currency, { symbol: string; name: string; flag: string }> = {
  NZD: { symbol: "NZ$", name: "New Zealand Dollar", flag: "🇳🇿" },
  USD: { symbol: "US$", name: "United States Dollar", flag: "🇺🇸" },
  GBP: { symbol: "£", name: "British Pound", flag: "🇬🇧" },
  EUR: { symbol: "€", name: "Euro", flag: "🇪🇺" },
  AUD: { symbol: "A$", name: "Australian Dollar", flag: "🇦🇺" },
};

/** Non-NZD foreign currencies that need exchange rates. */
export const FOREIGN_CURRENCIES = SUPPORTED_CURRENCIES.filter((c) => c !== "NZD") as Exclude<Currency, "NZD">[];

/** Format an amount with the currency symbol. */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: Currency | string = "NZD"
): string {
  if (amount === null || amount === undefined) return "—";
  const v = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

/** Convert a source-currency amount into NZD using a stored fxRate. */
export function toNzd(amount: number, fxRate: number): number {
  return Math.round(amount * fxRate * 100) / 100;
}
