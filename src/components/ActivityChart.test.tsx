import { describe, it, expect } from 'vitest';
import { bucketByWeek } from './ActivityChart';
import type { ChangeEvent } from '../lib/types';

const event = (ts: string, type: ChangeEvent['type'] = 'slipped'): ChangeEvent => ({
  ts,
  type,
  id: `m365:${ts}-${type}`,
  source: 'm365',
  title: 'Feature',
  link: '',
  products: [],
  from: null,
  to: null,
  fromRaw: null,
  toRaw: null,
  months: null,
  days: null,
});

describe('bucketByWeek', () => {
  it('anchors each bucket to its Monday', () => {
    // 2026-08-06 is a Thursday; its week began Monday 2026-08-03.
    expect(bucketByWeek([event('2026-08-06T12:00:00Z')])[0]?.week).toBe('2026-08-03');
  });

  it('puts Sunday in the week that began the previous Monday', () => {
    // 2026-08-09 is a Sunday — the naive (day - day_index) arithmetic would
    // push it into the following week.
    expect(bucketByWeek([event('2026-08-09T12:00:00Z')])[0]?.week).toBe('2026-08-03');
  });

  it('counts each tracked type separately in one bucket', () => {
    const buckets = bucketByWeek([
      event('2026-08-06T12:00:00Z', 'slipped'),
      event('2026-08-07T12:00:00Z', 'slipped'),
      event('2026-08-05T12:00:00Z', 'shipped'),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ slipped: 2, shipped: 1, dropped: 0 });
  });

  it('returns buckets oldest first, so the chart reads left to right', () => {
    const buckets = bucketByWeek([event('2026-08-12T12:00:00Z'), event('2026-08-05T12:00:00Z')]);
    expect(buckets.map((b) => b.week)).toEqual(['2026-08-03', '2026-08-10']);
  });

  it('ignores event types the chart does not plot', () => {
    expect(bucketByWeek([event('2026-08-06T12:00:00Z', 'status_changed')])).toEqual([]);
  });

  it('skips an unparseable timestamp instead of throwing', () => {
    expect(bucketByWeek([event('not-a-date')])).toEqual([]);
  });
});
