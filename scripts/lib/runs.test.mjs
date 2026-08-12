import { describe, it, expect } from 'vitest';
import {
  appendRun, runGaps, summariseRuns, overdueTrend, RUN_HISTORY, MISSED_AFTER_HOURS,
} from './runs.mjs';

const run = (ts, overrides = {}) => ({
  ts,
  sources: { m365: { count: 1819, ok: true }, azure: { count: 200, ok: true } },
  events: 0,
  byType: {},
  warnings: [],
  ...overrides,
});

describe('appendRun', () => {
  it('puts the newest run first', () => {
    const runs = appendRun([run('2026-08-08T00:00:00Z')], run('2026-08-08T06:00:00Z'));
    expect(runs.map((r) => r.ts)).toEqual(['2026-08-08T06:00:00Z', '2026-08-08T00:00:00Z']);
  });

  it('never double-counts a replayed run', () => {
    // A phantom run would make a real gap disappear, which is the one thing
    // this log exists to show.
    const first = appendRun([], run('2026-08-08T00:00:00Z'));
    const again = appendRun(first, run('2026-08-08T00:00:00Z'));
    expect(again).toHaveLength(1);
  });

  it('caps the history', () => {
    let runs = [];
    for (let i = 0; i < 250; i += 1) {
      runs = appendRun(runs, run(`2026-01-01T${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`));
    }
    expect(runs.length).toBeLessThanOrEqual(RUN_HISTORY);
  });

  it('starts a log from nothing', () => {
    expect(appendRun(undefined, run('2026-08-08T00:00:00Z'))).toHaveLength(1);
  });
});

describe('runGaps', () => {
  it('reports the wait that preceded each run', () => {
    const runs = [run('2026-08-08T12:00:00Z'), run('2026-08-08T06:00:00Z'), run('2026-08-08T00:00:00Z')];
    expect(runGaps(runs)).toEqual([6, 6, null]);
  });

  it('exposes a missed window as an outsized gap', () => {
    const runs = [run('2026-08-08T20:00:00Z'), run('2026-08-08T00:00:00Z')];
    expect(runGaps(runs)[0]).toBe(20);
    expect(runGaps(runs)[0] > MISSED_AFTER_HOURS).toBe(true);
  });

  it('handles an empty log and unparseable timestamps', () => {
    expect(runGaps([])).toEqual([]);
    expect(runGaps([run('nonsense'), run('also nonsense')])[0]).toBeNull();
  });
});

describe('summariseRuns', () => {
  const now = new Date('2026-08-08T13:00:00Z');

  it('counts missed windows', () => {
    const runs = [
      run('2026-08-08T12:00:00Z'),
      run('2026-08-07T20:00:00Z'), // 16h gap — missed
      run('2026-08-07T14:00:00Z'),
    ];
    expect(summariseRuns(runs, now).missedWindows).toBe(1);
  });

  it('reports a healthy cadence as zero missed', () => {
    const runs = [
      run('2026-08-08T12:00:00Z'),
      run('2026-08-08T06:00:00Z'),
      run('2026-08-08T00:00:00Z'),
    ];
    const s = summariseRuns(runs, now);
    expect(s.missedWindows).toBe(0);
    expect(s.medianGapHours).toBe(6);
  });

  it('counts runs held by the anomaly guard', () => {
    const held = run('2026-08-08T12:00:00Z', {
      sources: { m365: { count: 1819, ok: false, held: true }, azure: { count: 200, ok: true } },
    });
    expect(summariseRuns([held, run('2026-08-08T06:00:00Z')], now).heldRuns).toBe(1);
  });

  it('counts runs that carried warnings', () => {
    const warned = run('2026-08-08T12:00:00Z', { warnings: ['azure: fetch failed'] });
    expect(summariseRuns([warned], now).warningRuns).toBe(1);
  });

  it('reports how long since the last run', () => {
    expect(summariseRuns([run('2026-08-08T07:00:00Z')], now).hoursSinceLastRun).toBe(6);
  });

  it('handles an empty log', () => {
    expect(summariseRuns([], now)).toMatchObject({ total: 0, missedWindows: 0, lastRun: null });
    expect(summariseRuns(undefined, now).total).toBe(0);
  });
});

describe('overdueTrend', () => {
  const withCounts = (ts, overdue, stillInDevelopment = 347) =>
    run(ts, { registers: { overdue, stillInDevelopment, contradictions: 5 } });

  it('returns the series oldest first, ready to plot', () => {
    const runs = [withCounts('2026-08-09T12:00:00Z', 580), withCounts('2026-08-08T12:00:00Z', 578)];
    expect(overdueTrend(runs).map((p) => p.overdue)).toEqual([578, 580]);
  });

  it('OMITS runs that recorded no count, rather than reading them as zero', () => {
    // Runs predating this feature have no measurement. Treating them as zero
    // would draw a phantom climb from nothing — exactly the kind of invented
    // history this project exists to catch.
    const runs = [withCounts('2026-08-09T12:00:00Z', 578), run('2026-08-08T12:00:00Z')];
    const series = overdueTrend(runs);
    expect(series).toHaveLength(1);
    expect(series[0].overdue).toBe(578);
  });

  it('carries the still-in-development subset when present', () => {
    expect(overdueTrend([withCounts('2026-08-09T12:00:00Z', 578, 347)])[0].stillInDevelopment).toBe(347);
  });

  it('reports a null subset rather than guessing when it was not recorded', () => {
    const partial = run('2026-08-09T12:00:00Z', { registers: { overdue: 578 } });
    expect(overdueTrend([partial])[0].stillInDevelopment).toBeNull();
  });

  it('handles an empty log', () => {
    expect(overdueTrend([])).toEqual([]);
    expect(overdueTrend(undefined)).toEqual([]);
  });
});
