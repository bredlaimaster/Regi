/**
 * Pick-path ordering.
 *
 * The warehouse bin hierarchy dictates pick order. Bin codes observed in the
 * client data look like `F08B01`, `G07A01`, etc. — lexicographic order walks
 * the aisles top-to-bottom, which matches the path a picker takes.
 *
 * Products with a null/empty binLocation sort to the END (unallocated stock
 * is usually staged at the shipping bench, so it's visited last). Within the
 * unallocated group we order by SKU for determinism.
 *
 * This is a pure function — easy to unit test, easy to swap out for an
 * explicit lookup table once we have one.
 */
export type SortableLine<T> = T & {
  binLocation: string | null;
  sku: string;
};

export function sortLinesByBin<T>(lines: SortableLine<T>[]): SortableLine<T>[] {
  const copy = [...lines];
  copy.sort((a, b) => {
    const aBin = a.binLocation?.trim() ?? "";
    const bBin = b.binLocation?.trim() ?? "";
    // Empty bins sort last.
    if (!aBin && bBin) return 1;
    if (aBin && !bBin) return -1;
    if (aBin !== bBin) return aBin.localeCompare(bBin);
    return a.sku.localeCompare(b.sku);
  });
  return copy;
}
