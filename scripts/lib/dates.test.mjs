import { describe, it, expect } from 'vitest';
import { parseRoadmapDate, parseRetirementDate, monthsBetween, daysBetween } from './dates.mjs';

describe('parseRoadmapDate', () => {
  it('parses the standard month form the roadmap actually uses', () => {
    expect(parseRoadmapDate('September CY2026')).toBe('2026-09');
    expect(parseRoadmapDate('January CY2026')).toBe('2026-01');
    expect(parseRoadmapDate('December CY2025')).toBe('2025-12');
  });

  it('anchors a quarter to its first month so slips measure cleanly', () => {
    expect(parseRoadmapDate('Q1 CY2026')).toBe('2026-01');
    expect(parseRoadmapDate('Q3 CY2026')).toBe('2026-07');
    expect(monthsBetween(parseRoadmapDate('Q3 CY2026'), parseRoadmapDate('Q4 CY2026'))).toBe(3);
  });

  it('anchors a half-year to its first month', () => {
    expect(parseRoadmapDate('H1 CY2027')).toBe('2027-01');
    expect(parseRoadmapDate('H2 CY2027')).toBe('2027-07');
  });

  it('falls back to January for a bare year', () => {
    expect(parseRoadmapDate('CY2026')).toBe('2026-01');
  });

  it('tolerates abbreviations and stray whitespace', () => {
    expect(parseRoadmapDate('  Sep CY2026 ')).toBe('2026-09');
    expect(parseRoadmapDate('Sept. CY2026')).toBe('2026-09');
  });

  it('returns null for the empty values the feed is full of', () => {
    expect(parseRoadmapDate('')).toBeNull();
    expect(parseRoadmapDate(null)).toBeNull();
    expect(parseRoadmapDate(undefined)).toBeNull();
    expect(parseRoadmapDate('To be announced')).toBeNull();
  });
});

describe('parseRetirementDate', () => {
  it('parses the month-first form Azure titles use most', () => {
    expect(parseRetirementDate('Nested confidential VMs will be retired on September 1, 2026'))
      .toBe('2026-09-01');
    expect(parseRetirementDate('Migrate from Azure Blueprints by January 31, 2027'))
      .toBe('2027-01-31');
  });

  it('parses the day-first form', () => {
    expect(parseRetirementDate('AV36 Node Retirement now on 30 September 2027')).toBe('2027-09-30');
  });

  it('parses an ISO date in prose', () => {
    expect(parseRetirementDate('Support ends 2027-03-15 for this SKU')).toBe('2027-03-15');
  });

  it('anchors a month with no day to the first', () => {
    expect(parseRetirementDate('will be retired in September 2026')).toBe('2026-09-01');
  });

  it('returns null when the notice commits to no date', () => {
    expect(parseRetirementDate('This service will be retired in the coming months')).toBeNull();
    expect(parseRetirementDate('')).toBeNull();
    expect(parseRetirementDate(null)).toBeNull();
  });

  it('ignores a year that is not part of a date', () => {
    expect(parseRetirementDate('Retirement of the 2019 edition')).toBeNull();
  });
});

describe('monthsBetween', () => {
  it('is positive when the target moved later', () => {
    expect(monthsBetween('2026-09', '2026-12')).toBe(3);
  });

  it('is negative when the target was pulled in', () => {
    expect(monthsBetween('2026-09', '2026-07')).toBe(-2);
  });

  it('crosses year boundaries', () => {
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
  });

  it('returns null when either side is missing', () => {
    expect(monthsBetween(null, '2026-01')).toBeNull();
    expect(monthsBetween('2026-01', null)).toBeNull();
  });
});

describe('daysBetween', () => {
  it('counts days across a month boundary', () => {
    expect(daysBetween('2026-09-01', '2026-10-01')).toBe(30);
  });

  it('is negative when the date was pulled in', () => {
    expect(daysBetween('2026-09-30', '2026-09-01')).toBe(-29);
  });

  it('is unaffected by daylight saving transitions', () => {
    // Europe/Brussels shifts on 2026-10-25; a naive local-time diff yields 30.041…
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
  });

  it('returns null for unparseable input', () => {
    expect(daysBetween('nonsense', '2026-01-01')).toBeNull();
  });
});
