// ─── Business rules ──────────────────────────────────────────────────────────
// Centralised constants for values that were previously hardcoded ("magic numbers").

/** Auto-rebate percentage applied as a credit note when a sales order ships. */
export const AUTO_REBATE_PCT = 0.025; // 2.5%

/** Number of days a proforma invoice is valid from issuance. */
export const PROFORMA_EXPIRY_DAYS = 30;

/** Default number of days for the dashboard activity window. */
export const DASHBOARD_WINDOW_DAYS = 30;

/** Maximum rows returned by list pages (until pagination is implemented). */
export const LIST_PAGE_LIMIT = 50;

/** Pagination: default page size for paginated list queries. */
export const DEFAULT_PAGE_SIZE = 50;

/** NZ fiscal year starts in April (month 4). Period 1 = April. */
export const FISCAL_YEAR_START_MONTH = 4;
