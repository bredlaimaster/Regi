export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};
