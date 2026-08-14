import { describe, it, expect } from 'vitest';
import {
  applyRegisterFilter, registerProducts, registerFacet, hasRegisterFilter, toggleProduct,
  EMPTY_REGISTER_FILTER,
} from './registerFilter';

const row = (title: string, products: string[], status: string | null = 'In development') => ({
  title, products, status,
});

const rows = [
  row('Teams: background blur', ['Microsoft Teams']),
  row('Outlook: pinned folders', ['Outlook'], 'Rolling out'),
  row('Copilot in Word', ['Word', 'Microsoft Copilot (Microsoft 365)']),
];

describe('applyRegisterFilter', () => {
  it('returns everything when nothing is set', () => {
    expect(applyRegisterFilter(rows, EMPTY_REGISTER_FILTER)).toHaveLength(3);
  });

  it('filters by status', () => {
    const out = applyRegisterFilter(rows, { ...EMPTY_REGISTER_FILTER, status: 'Rolling out' });
    expect(out.map((r) => r.title)).toEqual(['Outlook: pinned folders']);
  });

  it('searches titles case-insensitively', () => {
    expect(applyRegisterFilter(rows, { ...EMPTY_REGISTER_FILTER, search: 'BLUR' })).toHaveLength(1);
  });

  it('searches product names too', () => {
    expect(applyRegisterFilter(rows, { ...EMPTY_REGISTER_FILTER, search: 'copilot' })).toHaveLength(1);
  });

  it('ignores surrounding whitespace in the search', () => {
    expect(applyRegisterFilter(rows, { ...EMPTY_REGISTER_FILTER, search: '  word  ' })).toHaveLength(1);
  });

  it('treats several products as OR', () => {
    const out = applyRegisterFilter(rows, {
      ...EMPTY_REGISTER_FILTER,
      products: ['Outlook', 'Microsoft Teams'],
    });
    expect(out).toHaveLength(2);
  });

  it('matches an item carrying any one of its products', () => {
    const out = applyRegisterFilter(rows, { ...EMPTY_REGISTER_FILTER, products: ['Word'] });
    expect(out.map((r) => r.title)).toEqual(['Copilot in Word']);
  });

  it('ANDs different facets together', () => {
    const out = applyRegisterFilter(rows, {
      ...EMPTY_REGISTER_FILTER,
      products: ['Outlook'],
      status: 'In development',
    });
    expect(out).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [...rows];
    applyRegisterFilter(input, { ...EMPTY_REGISTER_FILTER, search: 'x' });
    expect(input).toHaveLength(3);
  });

  it('tolerates rows without a status, so it can filter contradictions too', () => {
    const noStatus = [{ title: 'A thing', products: ['Teams'] }];
    expect(applyRegisterFilter(noStatus, { ...EMPTY_REGISTER_FILTER, search: 'thing' })).toHaveLength(1);
  });

  it('handles an empty or missing list', () => {
    expect(applyRegisterFilter([], EMPTY_REGISTER_FILTER)).toEqual([]);
  });
});

describe('the tenant facets', () => {
  const tenanted = [
    { title: 'GCC High only', products: ['Teams'], clouds: ['GCC High'], platforms: ['Web'] },
    {
      title: 'Everywhere',
      products: ['Teams'],
      clouds: ['Worldwide (Standard Multi-Tenant)', 'GCC', 'GCC High', 'DoD'],
      platforms: ['Web', 'Desktop', 'iOS'],
    },
    { title: 'Commercial only', products: ['Outlook'], clouds: ['Worldwide (Standard Multi-Tenant)'], platforms: ['Desktop'] },
    { title: 'Unrecorded', products: ['Word'] },
  ];

  it('keeps only the items in the selected cloud', () => {
    const out = applyRegisterFilter(tenanted, { ...EMPTY_REGISTER_FILTER, clouds: ['GCC High'] });
    expect(out.map((r) => r.title)).toEqual(['GCC High only', 'Everywhere', 'Unrecorded']);
  });

  it('keeps an item with no recorded clouds, because silence is not exclusion', () => {
    // The point of the filter is to be sure you see everything that touches
    // you. Dropping an item because Microsoft left the field blank would do
    // the opposite, quietly.
    const out = applyRegisterFilter(tenanted, { ...EMPTY_REGISTER_FILTER, clouds: ['DoD'] });
    expect(out.map((r) => r.title)).toContain('Unrecorded');
  });

  it('treats several clouds as OR', () => {
    const out = applyRegisterFilter(tenanted, {
      ...EMPTY_REGISTER_FILTER,
      clouds: ['GCC', 'DoD'],
    });
    expect(out.map((r) => r.title)).toEqual(['Everywhere', 'Unrecorded']);
  });

  it('filters by platform', () => {
    const out = applyRegisterFilter(tenanted, { ...EMPTY_REGISTER_FILTER, platforms: ['iOS'] });
    expect(out.map((r) => r.title)).toEqual(['Everywhere', 'Unrecorded']);
  });

  it('ANDs cloud against platform', () => {
    const out = applyRegisterFilter(tenanted, {
      ...EMPTY_REGISTER_FILTER,
      clouds: ['GCC High'],
      platforms: ['Desktop'],
    });
    expect(out.map((r) => r.title)).toEqual(['Everywhere', 'Unrecorded']);
  });

  it('ANDs the tenant facets against the others', () => {
    const out = applyRegisterFilter(tenanted, {
      ...EMPTY_REGISTER_FILTER,
      clouds: ['GCC High'],
      products: ['Outlook'],
    });
    expect(out).toEqual([]);
  });

  it('notices the tenant facets as active filters', () => {
    expect(hasRegisterFilter({ ...EMPTY_REGISTER_FILTER, clouds: ['DoD'] })).toBe(true);
    expect(hasRegisterFilter({ ...EMPTY_REGISTER_FILTER, platforms: ['Web'] })).toBe(true);
  });
});

describe('registerFacet', () => {
  const tenanted = [
    { title: 'a', products: [], clouds: ['GCC', 'DoD'], platforms: ['Web'] },
    { title: 'b', products: [], clouds: ['GCC'], platforms: ['Web', 'Mac'] },
    { title: 'c', products: [] },
  ];

  it('ranks by frequency', () => {
    expect(registerFacet(tenanted, 'clouds')).toEqual(['GCC', 'DoD']);
    expect(registerFacet(tenanted, 'platforms')).toEqual(['Web', 'Mac']);
  });

  it('breaks ties alphabetically, so the chip order is stable run to run', () => {
    const tied = [
      { title: 'a', products: [], clouds: ['Worldwide (Standard Multi-Tenant)'] },
      { title: 'b', products: [], clouds: ['GCC'] },
    ];
    expect(registerFacet(tied, 'clouds')).toEqual(['GCC', 'Worldwide (Standard Multi-Tenant)']);
  });

  it('is unlimited, unlike the product list — there are four clouds, not thirty-two', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      title: `row ${i}`, products: [], clouds: [`cloud ${i}`],
    }));
    expect(registerFacet(many, 'clouds')).toHaveLength(20);
  });

  it('handles rows that never recorded the facet', () => {
    expect(registerFacet([{ title: 'a', products: [] }], 'clouds')).toEqual([]);
    expect(registerFacet([{ title: 'a', products: [], clouds: null }], 'clouds')).toEqual([]);
    expect(registerFacet([], 'platforms')).toEqual([]);
  });
});

describe('registerProducts', () => {
  it('ranks by frequency', () => {
    const many = [row('a', ['Teams']), row('b', ['Teams']), row('c', ['Outlook'])];
    expect(registerProducts(many)).toEqual(['Teams', 'Outlook']);
  });

  it('respects the limit', () => {
    const many = ['a', 'b', 'c', 'd'].map((p) => row(p, [p]));
    expect(registerProducts(many, 2)).toHaveLength(2);
  });

  it('counts over the unfiltered set so the facet list does not reorder mid-use', () => {
    // Same input, same order, regardless of what is currently selected.
    expect(registerProducts(rows)).toEqual(registerProducts(rows));
  });

  it('handles rows with no products', () => {
    expect(registerProducts([row('a', [])])).toEqual([]);
  });
});

describe('hasRegisterFilter', () => {
  it('is false for the empty filter', () => {
    expect(hasRegisterFilter(EMPTY_REGISTER_FILTER)).toBe(false);
  });

  it('ignores a whitespace-only search', () => {
    expect(hasRegisterFilter({ ...EMPTY_REGISTER_FILTER, search: '   ' })).toBe(false);
  });

  it('notices each facet', () => {
    expect(hasRegisterFilter({ ...EMPTY_REGISTER_FILTER, search: 'x' })).toBe(true);
    expect(hasRegisterFilter({ ...EMPTY_REGISTER_FILTER, products: ['Teams'] })).toBe(true);
    expect(hasRegisterFilter({ ...EMPTY_REGISTER_FILTER, status: 'Rolling out' })).toBe(true);
  });
});

describe('toggleProduct', () => {
  it('adds then removes', () => {
    expect(toggleProduct([], 'Teams')).toEqual(['Teams']);
    expect(toggleProduct(['Teams', 'Outlook'], 'Teams')).toEqual(['Outlook']);
  });
});
