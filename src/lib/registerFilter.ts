/**
 * Filtering for the registers.
 *
 * The overdue register is 578 rows across 32 products and was filterable by
 * status alone, which made the site's strongest page its least usable one.
 *
 * Shared by both registers rather than written twice, and kept as pure
 * functions so the behaviour is testable without mounting a page.
 */

export interface RegisterRow {
  title: string;
  products: string[];
  status?: string | null;
}

export interface RegisterFilter {
  search: string;
  products: string[];
  status: string | null;
}

export const EMPTY_REGISTER_FILTER: RegisterFilter = { search: '', products: [], status: null };

/**
 * Apply the filter.
 *
 * Search matches the title or any product name; products are OR'd within
 * themselves and AND'd against the rest, matching the behaviour of the main
 * feed's facets so the two pages do not need to be learned separately.
 */
export function applyRegisterFilter<T extends RegisterRow>(rows: T[], filter: RegisterFilter): T[] {
  const needle = filter.search.trim().toLowerCase();

  return (rows ?? []).filter((row) => {
    if (filter.status && row.status !== filter.status) return false;
    if (filter.products.length && !row.products.some((p) => filter.products.includes(p))) {
      return false;
    }
    if (needle) {
      const inTitle = row.title.toLowerCase().includes(needle);
      const inProduct = row.products.some((p) => p.toLowerCase().includes(needle));
      if (!inTitle && !inProduct) return false;
    }
    return true;
  });
}

/**
 * Products present in the rows, most common first.
 *
 * Counted over the *unfiltered* set so the option list does not shift under
 * the reader as they narrow — a facet list that reorders on every click is
 * disorienting.
 */
export function registerProducts<T extends RegisterRow>(rows: T[], limit = 16): string[] {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    for (const product of row.products) counts.set(product, (counts.get(product) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

export const hasRegisterFilter = (filter: RegisterFilter): boolean =>
  filter.search.trim() !== '' || filter.products.length > 0 || filter.status !== null;

/** Add or remove one product from the selection. */
export function toggleProduct(selected: string[], product: string): string[] {
  return selected.includes(product)
    ? selected.filter((p) => p !== product)
    : [...selected, product];
}
