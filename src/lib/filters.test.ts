import { describe, it, expect } from 'vitest';
import {
  applyFilters, productOptions, hasActiveFilters, filtersToQuery, queryToFilters,
  toggleFacet, EMPTY_FILTERS,
} from './filters';
import type { ChangeEvent } from './types';

const event = (overrides: Partial<ChangeEvent> = {}): ChangeEvent => ({
  ts: '2026-08-06T17:00:00.000Z',
  type: 'slipped',
  id: 'm365:1',
  source: 'm365',
  title: 'Planner refresh',
  link: 'https://example.test/1',
  products: ['Planner'],
  from: '2026-09',
  to: '2026-12',
  fromRaw: 'September CY2026',
  toRaw: 'December CY2026',
  months: 3,
  days: null,
  ...overrides,
});

describe('applyFilters', () => {
  const events = [
    event(),
    event({ id: 'm365:2', type: 'shipped', title: 'Teams meeting notes', products: ['Microsoft Teams'], months: null }),
    event({ id: 'azure:1', source: 'azure', type: 'retirement_moved', title: 'VM series retirement', products: ['Compute'], months: null, days: 394 }),
  ];

  it('returns everything when no facet is set', () => {
    expect(applyFilters(events, EMPTY_FILTERS)).toHaveLength(3);
  });

  it('filters by type', () => {
    const result = applyFilters(events, { ...EMPTY_FILTERS, types: ['slipped'] });
    expect(result.map((e) => e.id)).toEqual(['m365:1']);
  });

  it('treats multiple values in one facet as OR', () => {
    const result = applyFilters(events, { ...EMPTY_FILTERS, types: ['slipped', 'shipped'] });
    expect(result).toHaveLength(2);
  });

  it('treats different facets as AND', () => {
    const result = applyFilters(events, { ...EMPTY_FILTERS, types: ['slipped'], sources: ['azure'] });
    expect(result).toHaveLength(0);
  });

  it('searches titles case-insensitively', () => {
    expect(applyFilters(events, { ...EMPTY_FILTERS, search: 'TEAMS' })).toHaveLength(1);
  });

  it('searches product names too', () => {
    expect(applyFilters(events, { ...EMPTY_FILTERS, search: 'compute' })).toHaveLength(1);
  });

  it('ignores surrounding whitespace in the search', () => {
    expect(applyFilters(events, { ...EMPTY_FILTERS, search: '  planner  ' })).toHaveLength(1);
  });

  it('sorts most recent first by default', () => {
    const older = event({ id: 'm365:old', ts: '2026-08-01T00:00:00.000Z' });
    const result = applyFilters([older, ...events], EMPTY_FILTERS);
    expect(result[0]?.ts).toBe('2026-08-06T17:00:00.000Z');
    expect(result[result.length - 1]?.id).toBe('m365:old');
  });

  it('sorts by absolute move size when asked, across both units', () => {
    const result = applyFilters(events, { ...EMPTY_FILTERS, sort: 'biggest' });
    // 394 days beats 3 months (90); the status change has no magnitude.
    expect(result.map((e) => e.id)).toEqual(['azure:1', 'm365:1', 'm365:2']);
  });

  it('does not mutate the input array', () => {
    const input = [...events];
    applyFilters(input, { ...EMPTY_FILTERS, sort: 'biggest' });
    expect(input.map((e) => e.id)).toEqual(events.map((e) => e.id));
  });
});

describe('productOptions', () => {
  it('ranks products by how often they appear', () => {
    const events = [
      event({ products: ['Teams'] }),
      event({ products: ['Teams'] }),
      event({ products: ['Planner'] }),
    ];
    expect(productOptions(events)).toEqual(['Teams', 'Planner']);
  });

  it('respects the limit', () => {
    const events = ['a', 'b', 'c'].map((p) => event({ products: [p] }));
    expect(productOptions(events, 2)).toHaveLength(2);
  });

  it('handles events with no products', () => {
    expect(productOptions([event({ products: [] })])).toEqual([]);
  });
});

describe('URL round-tripping', () => {
  it('writes only non-default values', () => {
    expect(filtersToQuery(EMPTY_FILTERS)).toBe('');
  });

  it('round-trips a fully populated filter set', () => {
    const filters = {
      search: 'teams',
      types: ['slipped', 'shipped'] as const,
      sources: ['m365'] as const,
      products: ['Microsoft Teams'],
      sort: 'biggest' as const,
    };
    expect(queryToFilters(filtersToQuery({ ...filters, types: [...filters.types], sources: [...filters.sources] })))
      .toEqual({ ...filters, types: [...filters.types], sources: [...filters.sources] });
  });

  it('reads a query string with a leading question mark', () => {
    expect(queryToFilters('?q=planner').search).toBe('planner');
  });

  it('falls back to defaults for junk input', () => {
    expect(queryToFilters('')).toEqual(EMPTY_FILTERS);
    expect(queryToFilters('sort=nonsense').sort).toBe('recent');
  });

  it('drops empty entries from a trailing comma', () => {
    expect(queryToFilters('type=slipped,').types).toEqual(['slipped']);
  });
});

describe('hasActiveFilters', () => {
  it('ignores sort, which is always set', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, sort: 'biggest' })).toBe(false);
  });

  it('notices a facet or a search', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, types: ['slipped'] })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: 'x' })).toBe(true);
  });

  it('ignores a whitespace-only search', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: '   ' })).toBe(false);
  });
});

describe('toggleFacet', () => {
  it('adds then removes', () => {
    expect(toggleFacet<string>([], 'a')).toEqual(['a']);
    expect(toggleFacet(['a', 'b'], 'a')).toEqual(['b']);
  });
});
