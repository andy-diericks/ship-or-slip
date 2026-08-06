import { describe, it, expect } from 'vitest';
import { formatDate, formatMagnitude, magnitudeDays, formatAge, formatDay } from './format';

describe('formatDate', () => {
  it('renders a month-precision roadmap date without inventing a day', () => {
    expect(formatDate('2026-09')).toBe('September 2026');
  });

  it('renders a day-precision retirement date', () => {
    expect(formatDate('2026-09-01')).toBe('1 September 2026');
  });

  it('renders an em dash for a missing date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('passes through anything it cannot parse rather than showing NaN', () => {
    expect(formatDate('Launched')).toBe('Launched');
    expect(formatDate('2026-13')).toBe('2026-13');
  });
});

describe('formatMagnitude', () => {
  it('signs a slip positively and a pull-in negatively', () => {
    expect(formatMagnitude({ months: 3, days: null })).toBe('+3 months');
    expect(formatMagnitude({ months: -2, days: null })).toBe('−2 months');
  });

  it('uses the singular for one', () => {
    expect(formatMagnitude({ months: 1, days: null })).toBe('+1 month');
    expect(formatMagnitude({ months: null, days: 1 })).toBe('+1 day');
  });

  it('keeps small day moves in days', () => {
    expect(formatMagnitude({ months: null, days: 45 })).toBe('+45 days');
  });

  it('promotes large day moves to months so a year-long slip reads at a glance', () => {
    expect(formatMagnitude({ months: null, days: 394 })).toBe('+13 months');
  });

  it('returns null when there is no move to describe', () => {
    expect(formatMagnitude({ months: null, days: null })).toBeNull();
    expect(formatMagnitude({ months: 0, days: 0 })).toBeNull();
  });
});

describe('magnitudeDays', () => {
  it('normalises months to days so the two sources sort together', () => {
    expect(magnitudeDays({ months: 3, days: null })).toBe(90);
    expect(magnitudeDays({ months: null, days: 45 })).toBe(45);
  });

  it('is absolute, so a big pull-in ranks with a big slip', () => {
    expect(magnitudeDays({ months: -4, days: null })).toBe(120);
  });

  it('is zero for a status-only event', () => {
    expect(magnitudeDays({ months: null, days: null })).toBe(0);
  });
});

describe('formatAge', () => {
  const now = new Date('2026-08-06T18:00:00Z');

  it('reads just now for a fresh run', () => {
    expect(formatAge('2026-08-06T17:59:30Z', now)).toBe('just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(formatAge('2026-08-06T17:20:00Z', now)).toBe('40 min ago');
    expect(formatAge('2026-08-06T12:00:00Z', now)).toBe('6 hours ago');
    expect(formatAge('2026-08-03T18:00:00Z', now)).toBe('3 days ago');
  });

  it('handles missing and unparseable timestamps', () => {
    expect(formatAge(null, now)).toBe('never');
    expect(formatAge('not a date', now)).toBe('unknown');
  });

  it('never reports a negative age from clock skew', () => {
    expect(formatAge('2026-08-06T18:05:00Z', now)).toBe('just now');
  });
});

describe('formatDay', () => {
  it('renders a short UTC day label', () => {
    expect(formatDay('2026-08-06T17:00:00Z')).toBe('6 Aug 2026');
  });
});
