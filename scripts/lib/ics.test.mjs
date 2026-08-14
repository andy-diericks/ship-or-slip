import { describe, it, expect } from 'vitest';
import { buildCalendar, escapeIcs, foldLine } from './ics.mjs';

const retirement = (overrides = {}) => ({
  id: 'azure:567979',
  source: 'azure',
  kind: 'retirement',
  title: 'Retirement: Nested confidential VMs will be retired on September 1, 2026',
  date: '2026-09-01',
  products: ['Compute'],
  note: null,
  ...overrides,
});

const build = (items, generated = '2026-08-12T16:00:00.000Z') =>
  buildCalendar({
    items,
    generated,
    siteUrl: 'https://andy-diericks.github.io/ship-or-slip/',
    link: (i) => `https://azure.microsoft.com/updates?id=${i.id.split(':')[1]}`,
  });

describe('escapeIcs', () => {
  it('escapes the four characters RFC 5545 reserves', () => {
    expect(escapeIcs('a;b,c\\d')).toBe('a\\;b\\,c\\\\d');
  });

  it('escapes backslashes first, so our own escapes are not re-escaped', () => {
    expect(escapeIcs('\\;')).toBe('\\\\\\;');
  });

  it('turns newlines into the literal escape', () => {
    expect(escapeIcs('one\ntwo')).toBe('one\\ntwo');
    expect(escapeIcs('one\r\ntwo')).toBe('one\\ntwo');
  });

  it('handles null and undefined', () => {
    expect(escapeIcs(null)).toBe('');
    expect(escapeIcs(undefined)).toBe('');
  });
});

describe('foldLine', () => {
  it('leaves a short line alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds past 75 octets with a leading space on continuations', () => {
    const folded = foldLine(`SUMMARY:${'x'.repeat(200)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(Buffer.from(lines[0], 'utf8').length).toBeLessThanOrEqual(75);
    for (const line of lines.slice(1)) expect(line.startsWith(' ')).toBe(true);
  });

  it('never splits a multi-byte character across a fold', () => {
    // A split UTF-8 sequence corrupts the file for every importer.
    const folded = foldLine(`SUMMARY:${'é'.repeat(100)}`);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'é'.repeat(100)}`);
    for (const line of folded.split('\r\n')) {
      expect(Buffer.from(line, 'utf8').length).toBeLessThanOrEqual(75);
    }
  });

  it('round-trips: unfolding returns the original', () => {
    const original = `DESCRIPTION:${'word '.repeat(60)}`;
    expect(foldLine(original).replace(/\r\n /g, '')).toBe(original);
  });
});

describe('buildCalendar', () => {
  it('produces a valid calendar envelope', () => {
    const ics = build([retirement()]);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:');
  });

  it('uses CRLF throughout, which importers require', () => {
    const ics = build([retirement()]);
    expect(ics.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('writes an all-day event with an exclusive end date', () => {
    const ics = build([retirement({ date: '2026-09-01' })]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260901');
    expect(ics).toContain('DTEND;VALUE=DATE:20260902');
  });

  it('rolls the end date over a month boundary', () => {
    const ics = build([retirement({ date: '2026-09-30' })]);
    expect(ics).toContain('DTEND;VALUE=DATE:20261001');
  });

  it('gives each item a stable UID, so re-subscribing updates rather than duplicates', () => {
    expect(build([retirement()])).toContain('UID:azure:567979@ship-or-slip');
  });

  it('includes only dated retirements', () => {
    const ics = build([
      retirement(),
      retirement({ id: 'azure:2', kind: 'update', title: 'Generally available: something' }),
      retirement({ id: 'azure:3', date: null, title: 'Retirement with no date' }),
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).not.toContain('Generally available');
    expect(ics).not.toContain('no date');
  });

  it('orders events by date', () => {
    const ics = build([
      retirement({ id: 'azure:late', date: '2027-01-31', title: 'Later one' }),
      retirement({ id: 'azure:soon', date: '2026-09-01', title: 'Sooner one' }),
    ]);
    expect(ics.indexOf('Sooner one')).toBeLessThan(ics.indexOf('Later one'));
  });

  it("carries Microsoft's note into the description", () => {
    const ics = build([retirement({
      note: { date: '2026-08-07', dateRaw: 'August 7, 2026', text: 'Date moved.' },
    })]);
    expect(ics).toContain("Microsoft's note: Date moved.");
  });

  it('links back to the Microsoft page', () => {
    expect(build([retirement()])).toContain('URL:https://azure.microsoft.com/updates?id=567979');
  });

  it('is still valid with nothing to report', () => {
    const ics = build([]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('tolerates a malformed date rather than emitting a broken event', () => {
    expect(build([retirement({ date: 'not-a-date' })])).not.toContain('BEGIN:VEVENT');
  });

  it('escapes a title containing a comma or semicolon', () => {
    const ics = build([retirement({ title: 'Retirement: A, B; and C' })]);
    expect(ics).toContain('SUMMARY:Retirement: A\\, B\\; and C');
  });
});
