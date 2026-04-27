/**
 * NZ GST → QuickBooks Online tax-code mapping.
 *
 * Single source of truth for how the four app tax rules (GST15, ZERO,
 * IMPORT_GST, EXEMPT) translate into QBO NZ TaxCode names. Income and expense
 * sides use different codes in QBO so each rule has two mappings.
 *
 * Names can vary slightly between QBO tenants (older NZ files use "GST Free
 * Income/Expenses", newer ones use "Zero Rated"/"Zero Rated Expenses"), so
 * each rule resolves against a fallback chain — the first name that exists
 * in the tenant's QBO file wins. If nothing matches we return undefined and
 * the caller omits TaxCodeRef, letting QBO apply its company default.
 *
 * All amounts pushed to QBO are GST-EXCLUSIVE NZD — invoices and bills set
 * GlobalTaxCalculation: "TaxExcluded" so QBO adds 15% based on the per-line
 * code rather than us pre-calculating tax.
 */
import { qboFetch } from "./client";

export type TaxRule = "GST15" | "ZERO" | "IMPORT_GST" | "EXEMPT";

/**
 * Income-side fallback chain per tax rule. Keyed by app TaxRule.
 * Customers on IMPORT_GST are treated as domestic-standard — import GST only
 * applies to supplier-side transactions at the border.
 */
export const INCOME_FALLBACKS: Record<TaxRule, readonly string[]> = {
  GST15:      ["GST on Income"],
  ZERO:       ["Zero Rated", "GST Free Income", "Zero Rated Income"],
  IMPORT_GST: ["GST on Income"],
  EXEMPT:     ["Out of Scope", "Exempt Income", "No GST"],
};

/**
 * Expense-side fallback chain per tax rule. Keyed by app TaxRule.
 * IMPORT_GST means the overseas supplier itself does not charge NZ GST
 * (GST is paid separately to Customs at the border), so their bill lines
 * go in at zero-rated. A separate Customs bill carries "GST on Imports".
 */
export const EXPENSE_FALLBACKS: Record<TaxRule, readonly string[]> = {
  GST15:      ["GST on Expenses"],
  ZERO:       ["Zero Rated Expenses", "GST Free Expenses"],
  IMPORT_GST: ["Zero Rated Expenses", "GST Free Expenses"],
  EXEMPT:     ["Out of Scope", "Exempt Expenses", "No GST"],
};

/**
 * Rate-driven expense code for per-line receive charges (freight, brokerage,
 * etc.). Caller passes the charge's stored rate.
 */
export function expenseFallbacksForRate(rate: number): readonly string[] {
  if (rate >= 15) return EXPENSE_FALLBACKS.GST15;
  return EXPENSE_FALLBACKS.ZERO;
}

type TaxCodeEntry = { Id: string; Name: string };

const taxCodeCache = new Map<string, Promise<Map<string, string>>>();

/**
 * Fetch every TaxCode from the tenant's QBO file into a Name→Id map.
 * Memoised per tenant for the lifetime of the process.
 */
async function getTaxCodeMap(tenantId: string): Promise<Map<string, string>> {
  const cached = taxCodeCache.get(tenantId);
  if (cached) return cached;

  const promise = (async () => {
    const map = new Map<string, string>();
    // Page through (QBO caps at 1000 per page; NZ files never have that many).
    const q = encodeURIComponent("select Id, Name from TaxCode maxresults 1000");
    const res = await qboFetch(tenantId, `/query?query=${q}`);
    const codes: TaxCodeEntry[] = res?.QueryResponse?.TaxCode ?? [];
    for (const tc of codes) map.set(tc.Name, tc.Id);
    return map;
  })();

  taxCodeCache.set(tenantId, promise);
  try {
    return await promise;
  } catch (e) {
    taxCodeCache.delete(tenantId); // don't cache failures
    throw e;
  }
}

/**
 * Resolve the first matching QBO TaxCode Id for a fallback chain.
 * Returns undefined if none of the candidates exist in the tenant's file.
 */
export async function resolveTaxCodeId(
  tenantId: string,
  candidates: readonly string[],
): Promise<{ id: string; name: string } | undefined> {
  const map = await getTaxCodeMap(tenantId);
  for (const name of candidates) {
    const id = map.get(name);
    if (id) return { id, name };
  }
  return undefined;
}

/**
 * Dump the tenant's TaxCode list for display in the Settings UI.
 * Also returns the NZ→QBO mapping we would use so the user can verify.
 */
export async function listTaxCodes(tenantId: string): Promise<{
  available: { id: string; name: string }[];
  income: Record<TaxRule, { resolved?: string; chain: readonly string[] }>;
  expense: Record<TaxRule, { resolved?: string; chain: readonly string[] }>;
}> {
  const map = await getTaxCodeMap(tenantId);
  const available = Array.from(map.entries())
    .map(([name, id]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const resolveChain = (chain: readonly string[]) =>
    chain.find((name) => map.has(name));

  const income = Object.fromEntries(
    (Object.keys(INCOME_FALLBACKS) as TaxRule[]).map((rule) => [
      rule,
      { chain: INCOME_FALLBACKS[rule], resolved: resolveChain(INCOME_FALLBACKS[rule]) },
    ]),
  ) as Record<TaxRule, { resolved?: string; chain: readonly string[] }>;

  const expense = Object.fromEntries(
    (Object.keys(EXPENSE_FALLBACKS) as TaxRule[]).map((rule) => [
      rule,
      { chain: EXPENSE_FALLBACKS[rule], resolved: resolveChain(EXPENSE_FALLBACKS[rule]) },
    ]),
  ) as Record<TaxRule, { resolved?: string; chain: readonly string[] }>;

  return { available, income, expense };
}
