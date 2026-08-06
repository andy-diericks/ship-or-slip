import type { ChangeEvent, EventType, Source } from './types';
import { magnitudeDays } from './format';

export type SortKey = 'recent' | 'biggest';

export interface Filters {
  search: string;
  types: EventType[];
  sources: Source[];
  products: string[];
  sort: SortKey;
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  types: [],
  sources: [],
  products: [],
  sort: 'recent',
};

/** An empty facet means "no constraint", not "match nothing". */
const matchesFacet = <T,>(selected: T[], value: T) => selected.length === 0 || selected.includes(value);

export function applyFilters(events: ChangeEvent[], filters: Filters): ChangeEvent[] {
  const needle = filters.search.trim().toLowerCase();
  const filtered = events.filter((event) => {
    if (!matchesFacet(filters.types, event.type)) return false;
    if (!matchesFacet(filters.sources, event.source)) return false;
    if (filters.products.length && !event.products.some((p) => filters.products.includes(p))) {
      return false;
    }
    if (needle && !event.title.toLowerCase().includes(needle)
      && !event.products.some((p) => p.toLowerCase().includes(needle))) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered];
  if (filters.sort === 'biggest') {
    sorted.sort((a, b) => magnitudeDays(b) - magnitudeDays(a) || b.ts.localeCompare(a.ts));
  } else {
    sorted.sort((a, b) => b.ts.localeCompare(a.ts));
  }
  return sorted;
}

/** Every product mentioned in the data, most common first, for the facet list. */
export function productOptions(events: ChangeEvent[], limit = 24): string[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    for (const product of event.products) {
      counts.set(product, (counts.get(product) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

export const hasActiveFilters = (filters: Filters): boolean =>
  filters.search.trim() !== ''
  || filters.types.length > 0
  || filters.sources.length > 0
  || filters.products.length > 0;

/**
 * Filters live in the URL so a filtered view is shareable and the back button
 * works. Only non-default values are written, keeping the common URL clean.
 */
export function filtersToQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('q', filters.search.trim());
  if (filters.types.length) params.set('type', filters.types.join(','));
  if (filters.sources.length) params.set('source', filters.sources.join(','));
  if (filters.products.length) params.set('product', filters.products.join(','));
  if (filters.sort !== 'recent') params.set('sort', filters.sort);
  return params.toString();
}

const splitList = (value: string | null): string[] =>
  value ? value.split(',').map((v) => v.trim()).filter(Boolean) : [];

export function queryToFilters(query: string): Filters {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const sort = params.get('sort');
  return {
    search: params.get('q') ?? '',
    types: splitList(params.get('type')) as EventType[],
    sources: splitList(params.get('source')) as Source[],
    products: splitList(params.get('product')),
    sort: sort === 'biggest' ? 'biggest' : 'recent',
  };
}

/** Add or remove one value from a facet — the click handler for every chip. */
export function toggleFacet<T>(selected: T[], value: T): T[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}
