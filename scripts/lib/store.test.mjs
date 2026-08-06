import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendEvents, readEvents, listMonths, rebuildRecent, updateTimelines,
  writeIndex, countByType, readSnapshot, writeSnapshot, monthKey,
} from './store.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sos-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const event = (overrides = {}) => ({
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

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

describe('snapshots', () => {
  it('round-trips', () => {
    writeSnapshot(dir, 'm365', [{ id: 'm365:1' }]);
    expect(readSnapshot(dir, 'm365')).toEqual([{ id: 'm365:1' }]);
  });

  it('reads an absent snapshot as empty rather than throwing', () => {
    expect(readSnapshot(dir, 'azure')).toEqual([]);
  });
});

describe('appendEvents', () => {
  it('files events under the month of their timestamp', () => {
    appendEvents(dir, [event()]);
    expect(readEvents(dir, '2026-08')).toHaveLength(1);
    expect(monthKey('2026-08-06T17:00:00.000Z')).toBe('2026-08');
  });

  it('splits a batch across month boundaries', () => {
    appendEvents(dir, [event(), event({ ts: '2026-09-01T00:00:00.000Z', id: 'm365:2' })]);
    expect(listMonths(dir)).toEqual(['2026-09', '2026-08']);
  });

  it('is idempotent — replaying the same events adds nothing', () => {
    appendEvents(dir, [event()]);
    appendEvents(dir, [event()]);
    expect(readEvents(dir, '2026-08')).toHaveLength(1);
  });

  it('keeps a genuinely different event at the same timestamp', () => {
    appendEvents(dir, [event()]);
    appendEvents(dir, [event({ type: 'shipped', to: 'Launched' })]);
    expect(readEvents(dir, '2026-08')).toHaveLength(2);
  });

  it('appends to an existing month without losing history', () => {
    appendEvents(dir, [event()]);
    appendEvents(dir, [event({ id: 'm365:2', ts: '2026-08-07T17:00:00.000Z' })]);
    const stored = readEvents(dir, '2026-08');
    expect(stored).toHaveLength(2);
    expect(stored[0].ts).toBe('2026-08-07T17:00:00.000Z'); // newest first
  });
});

describe('rebuildRecent', () => {
  it('includes events inside the window and excludes older ones', () => {
    appendEvents(dir, [
      event({ ts: '2026-08-06T17:00:00.000Z' }),
      event({ id: 'm365:old', ts: '2026-01-06T17:00:00.000Z' }),
    ]);
    const recent = rebuildRecent(dir, new Date('2026-08-06T18:00:00.000Z'));
    expect(recent.map((e) => e.id)).toEqual(['m365:1']);
    expect(readJson('recent.json')).toHaveLength(1);
  });

  it('is derived, so a stale recent file is replaced not merged', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'recent.json'), JSON.stringify([event({ id: 'ghost' })]));
    appendEvents(dir, [event()]);
    const recent = rebuildRecent(dir, new Date('2026-08-06T18:00:00.000Z'));
    expect(recent.map((e) => e.id)).toEqual(['m365:1']);
  });

  it('handles an empty store', () => {
    expect(rebuildRecent(dir, new Date('2026-08-06T18:00:00.000Z'))).toEqual([]);
  });
});

describe('updateTimelines', () => {
  it('records a point per event and prefers the live title', () => {
    updateTimelines(dir, [event()], { m365: [{ id: 'm365:1', title: 'Planner refresh (renamed)', link: 'x', products: ['Planner'] }] });
    const timelines = readJson('timelines.json');
    expect(timelines['m365:1'].title).toBe('Planner refresh (renamed)');
    expect(timelines['m365:1'].points).toHaveLength(1);
  });

  it('accumulates points across runs in chronological order', () => {
    updateTimelines(dir, [event({ ts: '2026-08-06T17:00:00.000Z' })], {});
    updateTimelines(dir, [event({ ts: '2026-07-06T17:00:00.000Z', to: '2026-09' })], {});
    const points = readJson('timelines.json')['m365:1'].points;
    expect(points).toHaveLength(2);
    expect(points[0].ts).toBe('2026-07-06T17:00:00.000Z');
  });

  it('does not duplicate a replayed point', () => {
    updateTimelines(dir, [event()], {});
    updateTimelines(dir, [event()], {});
    expect(readJson('timelines.json')['m365:1'].points).toHaveLength(1);
  });

  it('only tracks items that changed', () => {
    updateTimelines(dir, [event()], { m365: [{ id: 'm365:1' }, { id: 'm365:999' }] });
    expect(Object.keys(readJson('timelines.json'))).toEqual(['m365:1']);
  });
});

describe('writeIndex', () => {
  it('lists the months on disk and carries warnings through', () => {
    appendEvents(dir, [event()]);
    writeIndex(dir, {
      generated: '2026-08-06T17:00:00.000Z',
      sources: { m365: { count: 1814, ok: true } },
      totals: { recent: 1 },
      warnings: ['azure: fetch failed'],
    });
    const index = readJson('index.json');
    expect(index.months).toEqual(['2026-08']);
    expect(index.warnings).toEqual(['azure: fetch failed']);
    expect(index.recentDays).toBe(90);
  });
});

describe('countByType', () => {
  it('rolls up counts per event type', () => {
    expect(countByType([event(), event({ type: 'shipped' }), event({ type: 'shipped' })]))
      .toEqual({ slipped: 1, shipped: 2 });
  });

  it('returns an empty object for no events', () => {
    expect(countByType([])).toEqual({});
  });
});
