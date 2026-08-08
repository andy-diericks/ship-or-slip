import { describe, it, expect } from 'vitest';
import { detectAnomaly, ANOMALY_DEFAULTS } from './anomaly.mjs';
import { diffSnapshots } from './diff.mjs';
import { normalizeM365 } from './normalize.mjs';

describe('detectAnomaly', () => {
  it('passes a normal day', () => {
    // The first live run: 23 events against 1,814 tracked items.
    expect(detectAnomaly(23, 1814).flagged).toBe(false);
  });

  it('passes a busy but believable day', () => {
    expect(detectAnomaly(120, 1814).flagged).toBe(false);
  });

  it('holds a run where the whole feed appears to have moved', () => {
    // The shape of a renamed id field: everything dropped, everything re-added.
    const verdict = detectAnomaly(3628, 1814);
    expect(verdict.flagged).toBe(true);
    expect(verdict.reason).toMatch(/feed change/i);
    expect(verdict.reason).toMatch(/--force/);
  });

  it('holds a run just over the ratio', () => {
    expect(detectAnomaly(500, 1814).flagged).toBe(true);
  });

  it('passes a run just under the ratio', () => {
    expect(detectAnomaly(453, 1814).flagged).toBe(false);
  });

  it('never flags below the absolute floor, however large the share', () => {
    // 40 events against 10 tracked items is 400% — but 40 events cannot poison
    // an archive, and small sources would otherwise trip the guard constantly.
    expect(detectAnomaly(40, 10).flagged).toBe(false);
    expect(ANOMALY_DEFAULTS.minEvents).toBe(50);
  });

  it('flags a small source once it is both large and disproportionate', () => {
    expect(detectAnomaly(60, 100).flagged).toBe(true);
  });

  it('treats a seed as unremarkable', () => {
    expect(detectAnomaly(0, 0).flagged).toBe(false);
  });

  it('flags a large diff against an empty baseline', () => {
    // Should not arise (seeding emits no events), but if it ever did, writing
    // 1,800 "added" events into the archive is exactly what must not happen.
    expect(detectAnomaly(1800, 0).flagged).toBe(true);
  });

  it('honours custom thresholds', () => {
    expect(detectAnomaly(30, 100, { minEvents: 10, maxRatio: 0.2 }).flagged).toBe(true);
    expect(detectAnomaly(30, 100, { minEvents: 10, maxRatio: 0.5 }).flagged).toBe(false);
  });

  it('ignores nonsense input rather than throwing', () => {
    expect(detectAnomaly(NaN, 100).flagged).toBe(false);
    expect(detectAnomaly(-5, 100).flagged).toBe(false);
    expect(detectAnomaly(100, NaN).flagged).toBe(true);
  });

  it('states the numbers, so the warning is actionable without the logs', () => {
    const { reason } = detectAnomaly(900, 1800);
    expect(reason).toContain('900 events');
    expect(reason).toContain('1800 tracked items');
    expect(reason).toContain('50%');
  });
});

describe('the failure it exists to catch', () => {
  const roadmapItem = (id, overrides = {}) => ({
    id,
    title: `Feature ${id}`,
    publicDisclosureAvailabilityDate: 'September CY2026',
    publicPreviewDate: '',
    status: 'In development',
    modified: '2026-08-05T22:47:32',
    tagsContainer: { products: [{ tagName: 'Teams' }], cloudInstances: [], releasePhase: [] },
    ...overrides,
  });

  const feed = (n, overrides = {}) =>
    Array.from({ length: n }, (_, i) => roadmapItem(1000 + i, overrides));

  it('catches Microsoft renaming the id field', () => {
    const before = normalizeM365(feed(400));
    // Ids shift: every old item looks dropped, every new one looks added.
    const after = normalizeM365(feed(400).map((r) => ({ ...r, id: r.id + 500000 })));

    const events = diffSnapshots(before, after, { ts: '2026-08-08T00:00:00Z' });
    expect(events.length).toBe(800);
    expect(detectAnomaly(events.length, before.length).flagged).toBe(true);
  });

  it('catches a date format Microsoft changes under us', () => {
    const before = normalizeM365(feed(400));
    // "September CY2026" becomes something the parser cannot read: every
    // tracked date reads as null, which the differ correctly declines to
    // report — the guard is the second line of defence, not the first.
    const after = normalizeM365(feed(400, { publicDisclosureAvailabilityDate: 'FY27 H1' }));

    const events = diffSnapshots(before, after, { ts: '2026-08-08T00:00:00Z' });
    expect(events).toEqual([]);
  });

  it('catches a status vocabulary change', () => {
    const before = normalizeM365(feed(400));
    const after = normalizeM365(feed(400, { status: 'In Development' })); // capital D

    const events = diffSnapshots(before, after, { ts: '2026-08-08T00:00:00Z' });
    expect(events.length).toBe(400);
    expect(events.every((e) => e.type === 'status_changed')).toBe(true);
    expect(detectAnomaly(events.length, before.length).flagged).toBe(true);
  });

  it('still lets a genuinely busy day through', () => {
    const before = normalizeM365(feed(400));
    const moved = feed(400).map((r, i) =>
      i < 60 ? { ...r, publicDisclosureAvailabilityDate: 'December CY2026' } : r,
    );
    const events = diffSnapshots(before, normalizeM365(moved), { ts: '2026-08-08T00:00:00Z' });

    expect(events.length).toBe(60);
    expect(detectAnomaly(events.length, before.length).flagged).toBe(false);
  });
});
