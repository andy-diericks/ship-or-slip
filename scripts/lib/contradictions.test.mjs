import { describe, it, expect } from 'vitest';
import { findContradictions, summariseContradictions } from './contradictions.mjs';

const NOW = '2026-08';

const item = (overrides = {}) => ({
  id: 'm365:1',
  title: 'A feature',
  source: 'm365',
  products: ['Teams'],
  status: 'Launched',
  date: '2026-06',
  dateRaw: 'June CY2026',
  note: null,
  ...overrides,
});

const note = (text) => ({ date: '2026-06-05', dateRaw: 'June 5, 2026', text });

describe('findContradictions', () => {
  it('catches Launched with a note saying it is still in development', () => {
    const [c] = findContradictions(
      [item({ note: note('This feature is still in development and will begin rolling out mid-June 2026.') })],
      NOW,
    );
    expect(c.kind).toBe('launched_unshipped');
    expect(c.claim).toBe('Roadmap status: Launched');
    expect(c.evidence).toContain('still in development');
  });

  it('catches a rollback admitted in a note', () => {
    const [c] = findContradictions(
      [item({ status: 'In development', note: note('We have temporarily rolled back this feature.') })],
      NOW,
    );
    expect(c.kind).toBe('rolled_back');
    expect(c.claim).toBe('Roadmap status: In development');
  });

  it('catches Launched with a rollout date still in the future', () => {
    const [c] = findContradictions([item({ date: '2026-10', dateRaw: 'October CY2026', note: null })], NOW);
    expect(c.kind).toBe('launched_future');
    expect(c.evidence).toContain('October CY2026');
  });

  it('reports each item once, under its most specific description', () => {
    const both = item({
      date: '2026-10',
      note: note('This feature is still in development.'),
    });
    const found = findContradictions([both], NOW);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('launched_unshipped');
  });

  it('stays silent on a consistent record', () => {
    expect(findContradictions([item({ note: null })], NOW)).toEqual([]);
    expect(findContradictions([item({ status: 'In development', date: '2026-12' })], NOW)).toEqual([]);
  });

  it('does not fire on an ordinary note', () => {
    const quiet = item({ note: note('We have updated the documentation for this feature.') });
    expect(findContradictions([quiet], NOW)).toEqual([]);
  });

  it('does not call a launched item with a past date a contradiction', () => {
    // Launched and its date has passed is exactly what success looks like.
    expect(findContradictions([item({ date: '2026-01' })], NOW)).toEqual([]);
  });

  it('does not treat Launched in the current month as premature', () => {
    expect(findContradictions([item({ date: NOW })], NOW)).toEqual([]);
  });

  it('quotes Microsoft rather than paraphrasing — the claim must be theirs', () => {
    const text = 'This feature is still in development and will begin rolling out mid-June 2026.';
    const [c] = findContradictions([item({ note: note(text) })], NOW);
    expect(c.evidence).toContain(text);
  });

  it('refuses nonsense input rather than throwing', () => {
    expect(findContradictions(null, NOW)).toEqual([]);
    expect(findContradictions([item()], 'not-a-month')).toEqual([]);
    expect(findContradictions([null, undefined, item({ note: null, date: '2026-01' })], NOW)).toEqual([]);
  });
});

describe('summariseContradictions', () => {
  it('counts by kind', () => {
    const found = findContradictions(
      [
        item({ id: 'a', note: note('still in development') }),
        item({ id: 'b', note: note('We have rolled back this feature.') }),
        item({ id: 'c', date: '2026-11' }),
      ],
      NOW,
    );
    expect(summariseContradictions(found)).toEqual({
      count: 3,
      byKind: { launched_unshipped: 1, rolled_back: 1, launched_future: 1 },
    });
  });

  it('handles an empty register', () => {
    expect(summariseContradictions([])).toEqual({ count: 0, byKind: {} });
    expect(summariseContradictions(undefined)).toEqual({ count: 0, byKind: {} });
  });
});
