import { describe, it, expect } from 'vitest';
import {
  buildFeed, feedEntries, entryTitle, entrySummary, escapeXml, entryId,
  NOTABLE_TYPES, FEED_LIMIT,
} from './feed.mjs';

const SITE = 'https://andy-diericks.github.io/ship-or-slip/';
const FEED = 'https://raw.githubusercontent.com/andy-diericks/ship-or-slip/data/feed.xml';

const event = (overrides = {}) => ({
  ts: '2026-08-08T09:43:00.000Z',
  type: 'slipped',
  id: 'm365:1',
  source: 'm365',
  title: 'Planner: Refreshed experience',
  link: 'https://www.microsoft.com/microsoft-365/roadmap?featureid=1',
  products: ['Planner'],
  from: '2026-09',
  to: '2026-12',
  fromRaw: 'September CY2026',
  toRaw: 'December CY2026',
  months: 3,
  days: null,
  ...overrides,
});

describe('escapeXml', () => {
  it('escapes all five XML characters', () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`))
      .toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;');
  });

  it('escapes ampersands first, so entities are not double-escaped wrongly', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });

  it('handles null and undefined', () => {
    expect(escapeXml(null)).toBe('');
    expect(escapeXml(undefined)).toBe('');
  });
});

describe('feedEntries', () => {
  it('keeps only the notable event types', () => {
    const events = [
      event({ type: 'slipped' }),
      event({ id: 'm365:2', type: 'added' }),
      event({ id: 'm365:3', type: 'shipped' }),
      event({ id: 'm365:4', type: 'cancelled' }),
    ];
    expect(feedEntries(events).map((e) => e.type)).toEqual(['slipped', 'cancelled']);
  });

  it('excludes routine announcements — a noisy feed gets unsubscribed from', () => {
    for (const noisy of ['added', 'shipped', 'date_added', 'preview_set', 'status_changed']) {
      expect(NOTABLE_TYPES.has(noisy)).toBe(false);
    }
  });

  it('includes scope cuts and retirements', () => {
    for (const notable of ['slipped', 'cancelled', 'dropped', 'scope_reduced',
      'retirement_moved', 'retirement_announced']) {
      expect(NOTABLE_TYPES.has(notable)).toBe(true);
    }
  });

  it('is newest first', () => {
    const events = [
      event({ id: 'a', ts: '2026-08-01T00:00:00Z' }),
      event({ id: 'b', ts: '2026-08-08T00:00:00Z' }),
    ];
    expect(feedEntries(events).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('caps the entry count', () => {
    const many = Array.from({ length: 80 }, (_, i) => event({ id: `m365:${i}` }));
    expect(feedEntries(many)).toHaveLength(FEED_LIMIT);
    expect(feedEntries(many, 5)).toHaveLength(5);
  });

  it('handles an empty or missing list', () => {
    expect(feedEntries([])).toEqual([]);
    expect(feedEntries(undefined)).toEqual([]);
  });
});

describe('entryTitle', () => {
  it('leads with the news, because readers show titles in a list', () => {
    expect(entryTitle(event())).toBe('Slipped +3 months — Planner: Refreshed experience');
  });

  it('signs a pulled-in slip correctly', () => {
    expect(entryTitle(event({ months: -2 }))).toContain('-2 months');
  });

  it('uses the singular for one — these titles are read by humans', () => {
    expect(entryTitle(event({ months: 1 }))).toBe('Slipped +1 month — Planner: Refreshed experience');
    expect(entryTitle(event({ months: -1 }))).toContain('-1 month —');
    expect(entryTitle(event({ type: 'retirement_moved', days: 1 }))).toContain('+1 day —');
  });

  it('describes each notable type distinctly', () => {
    expect(entryTitle(event({ type: 'cancelled' }))).toMatch(/^Cancelled — /);
    expect(entryTitle(event({ type: 'dropped' }))).toMatch(/^Dropped from the roadmap — /);
    expect(entryTitle(event({ type: 'retirement_announced' }))).toMatch(/^Retirement announced — /);
    expect(entryTitle(event({ type: 'retirement_moved', days: 394 }))).toContain('+394 days');
  });

  it('names what a scope cut lost', () => {
    const title = entryTitle(event({ type: 'scope_reduced', fromRaw: 'Clouds lost: GCC High' }));
    expect(title).toBe('Scope cut (Clouds lost: GCC High) — Planner: Refreshed experience');
  });
});

describe('entrySummary', () => {
  it('carries the move, the product, the source and the roadmap id', () => {
    expect(entrySummary(event())).toBe('2026-09 → 2026-12 · Planner · Microsoft 365 · ID 1');
  });

  it('names Azure for retirement events', () => {
    expect(entrySummary(event({ source: 'azure', products: [] }))).toContain('Azure');
  });

  it('copes with an event that has no move', () => {
    expect(entrySummary(event({ from: null, to: null, products: [] })))
      .toBe('Microsoft 365 · ID 1');
  });
});

describe('entryId', () => {
  it('is unique per occurrence, so a feature slipping twice is two entries', () => {
    const first = entryId(event({ ts: '2026-08-01T00:00:00Z' }), SITE);
    const second = entryId(event({ ts: '2026-09-01T00:00:00Z' }), SITE);
    expect(first).not.toBe(second);
  });

  it('distinguishes two kinds of change to the same item at the same moment', () => {
    expect(entryId(event({ type: 'slipped' }), SITE))
      .not.toBe(entryId(event({ type: 'scope_reduced' }), SITE));
  });
});

describe('buildFeed', () => {
  const feed = (events, generated = '2026-08-08T10:00:00.000Z') =>
    buildFeed({ events, generated, siteUrl: SITE, feedUrl: FEED });

  it('produces a well-formed Atom document', () => {
    const xml = feed([event()]);
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml.trimEnd().endsWith('</feed>')).toBe(true);
  });

  it('declares itself with rel=self, which readers require', () => {
    expect(feed([event()])).toContain(`<link rel="self" href="${FEED}"/>`);
  });

  it('links each entry to its page on the site', () => {
    expect(feed([event()])).toContain('href="https://andy-diericks.github.io/ship-or-slip/#/item/m365%3A1"');
  });

  it('links out to the Microsoft page as a related link', () => {
    expect(feed([event()])).toContain('rel="related"');
  });

  it('takes updated from the newest entry', () => {
    expect(feed([event({ ts: '2026-08-08T09:43:00.000Z' })]))
      .toContain('<updated>2026-08-08T09:43:00.000Z</updated>');
  });

  it('falls back to the run timestamp when there are no entries', () => {
    const xml = feed([]);
    expect(xml).toContain('<updated>2026-08-08T10:00:00.000Z</updated>');
    expect(xml).not.toContain('<entry>');
  });

  it('escapes titles containing XML characters', () => {
    const xml = feed([event({ title: 'Teams & Outlook <beta> "preview"' })]);
    expect(xml).toContain('Teams &amp; Outlook &lt;beta&gt; &quot;preview&quot;');
    expect(xml).not.toMatch(/<title>[^<]*<beta>/);
  });

  it('omits the noisy types entirely', () => {
    const xml = feed([event({ type: 'added', title: 'Some new thing' })]);
    expect(xml).not.toContain('Some new thing');
  });
});
