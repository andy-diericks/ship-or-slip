import { describe, it, expect } from 'vitest';
import { computeOverdue, summariseOverdue } from './overdue.mjs';

const item = (overrides = {}) => ({
  id: 'm365:1',
  title: 'A feature',
  source: 'm365',
  products: ['Teams'],
  date: '2025-06',
  dateRaw: 'June CY2025',
  status: 'In development',
  note: null,
  ...overrides,
});

const NOW = '2026-08';

describe('computeOverdue', () => {
  it('includes an item whose month has passed and has not shipped', () => {
    const [row] = computeOverdue([item()], NOW);
    expect(row).toMatchObject({ id: 'm365:1', due: '2025-06', monthsLate: 14 });
  });

  it('excludes anything already launched or cancelled', () => {
    expect(computeOverdue([item({ status: 'Launched' })], NOW)).toEqual([]);
    expect(computeOverdue([item({ status: 'Cancelled' })], NOW)).toEqual([]);
  });

  it('excludes an item still in the future', () => {
    expect(computeOverdue([item({ date: '2026-12' })], NOW)).toEqual([]);
  });

  it('does not count the current month as late', () => {
    expect(computeOverdue([item({ date: NOW })], NOW)).toEqual([]);
  });

  it('includes Rolling out, but keeps the status so it can be judged', () => {
    // A rollout in flight is a weaker claim than something still in
    // development two years on; conflating them would overstate the case.
    const [row] = computeOverdue([item({ status: 'Rolling out' })], NOW);
    expect(row.status).toBe('Rolling out');
  });

  it('excludes items with no promised date at all', () => {
    expect(computeOverdue([item({ date: null })], NOW)).toEqual([]);
  });

  it('excludes Azure retirements — a passed retirement date is a promise KEPT', () => {
    // The register is about promises to deliver. A retirement that happened on
    // schedule is the opposite of overdue, and counting it would inflate the
    // headline number with something that is not a failure at all.
    const retirement = item({
      id: 'azure:1', source: 'azure', kind: 'retirement', status: null, date: '2025-06',
    });
    expect(computeOverdue([retirement], NOW)).toEqual([]);
  });

  it('ranks the most overdue first', () => {
    const rows = computeOverdue(
      [item({ id: 'a', date: '2026-01' }), item({ id: 'b', date: '2024-04' })],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
    expect(rows[0].monthsLate).toBe(28);
  });

  it("carries Microsoft's note through, when there is one", () => {
    const note = { date: '2026-01-01', dateRaw: 'January 1, 2026', text: 'Delayed.' };
    expect(computeOverdue([item({ note })], NOW)[0].note).toEqual(note);
  });

  it('refuses nonsense input rather than throwing', () => {
    expect(computeOverdue(null, NOW)).toEqual([]);
    expect(computeOverdue([item()], 'not-a-month')).toEqual([]);
  });
});

describe('summariseOverdue', () => {
  const rows = [
    { status: 'In development', monthsLate: 28 },
    { status: 'In development', monthsLate: 10 },
    { status: 'Rolling out', monthsLate: 4 },
  ];

  it('reports the headline numbers', () => {
    expect(summariseOverdue(rows, 1819)).toMatchObject({
      count: 3,
      tracked: 1819,
      worstMonthsLate: 28,
      stillInDevelopment: 2,
    });
  });

  it('calls out still-in-development separately from rolling out', () => {
    // A late rollout is a delivery problem; something still in development
    // years past its date was never close.
    expect(summariseOverdue(rows, 100).byStatus).toEqual({
      'In development': 2,
      'Rolling out': 1,
    });
  });

  it('computes the share of everything tracked', () => {
    expect(summariseOverdue(rows, 300).share).toBe(1);
    expect(summariseOverdue(rows, 6).share).toBe(50);
  });

  it('handles an empty register without dividing by zero', () => {
    expect(summariseOverdue([], 0)).toMatchObject({ count: 0, share: 0, worstMonthsLate: 0 });
  });
});
