/**
 * Canonical list of "areas" a Settings → Support bug report can target.
 *
 * Stored as the `key` (slug) on `BugReport.affectedAreas` so renames of the
 * human-readable label don't invalidate historical data. Add new entries at
 * the bottom; never remove or rename a `key` once it's been used.
 */
export const BUG_AREAS = [
  { key: "dashboard",       label: "Dashboard" },
  { key: "products",        label: "Products" },
  { key: "inventory",       label: "Inventory" },
  { key: "purchase-orders", label: "Purchase Orders" },
  { key: "sales-orders",    label: "Sales Orders" },
  { key: "proforma",        label: "Proforma" },
  { key: "reservations",    label: "Reservations" },
  { key: "suppliers",       label: "Suppliers" },
  { key: "customers",       label: "Customers" },
  { key: "reports",         label: "Reports" },
  { key: "settings",        label: "Settings" },
  { key: "mobile",          label: "Mobile (pick / receive / stocktake)" },
  { key: "qbo-sync",        label: "QuickBooks sync" },
  { key: "auth",            label: "Login / authentication" },
  { key: "other",           label: "Other / not listed" },
] as const;

export type BugAreaKey = (typeof BUG_AREAS)[number]["key"];

export const BUG_AREA_KEYS: readonly BugAreaKey[] = BUG_AREAS.map((a) => a.key);

const LABELS = new Map<string, string>(BUG_AREAS.map((a) => [a.key, a.label]));

/** Look up the human-readable label for a stored key. Falls back to the key. */
export function bugAreaLabel(key: string): string {
  return LABELS.get(key) ?? key;
}
