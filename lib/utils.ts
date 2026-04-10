import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatInTimeZone } from "date-fns-tz";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const NZ_TZ = "Pacific/Auckland";

export function formatNzDate(d: Date | string | null | undefined, fmt = "dd MMM yyyy") {
  if (!d) return "";
  return formatInTimeZone(new Date(d), NZ_TZ, fmt);
}

export function formatNzDateTime(d: Date | string | null | undefined) {
  return formatNzDate(d, "dd MMM yyyy, h:mma");
}

const nzd = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  minimumFractionDigits: 2,
});
export function formatNzd(n: number | string | null | undefined) {
  if (n === null || n === undefined) return "—";
  const v = typeof n === "string" ? Number(n) : n;
  return nzd.format(v);
}

/** Generate a sequential number like PO-000123 from a numeric id. */
export function formatDocNumber(prefix: "PO" | "SO", count: number) {
  return `${prefix}-${String(count + 1).padStart(6, "0")}`;
}
