import { describe, it, expect } from 'vitest';
import { diffSnapshots, mergeSnapshot } from './diff.mjs';

const TS = '2026-08-06T17:00:00.000Z';

const m365 = (overrides = {}) => ({
  id: 'm365:1',
  source: 'm365',
  title: 'Planner refresh',
  link: 'https://example.test/1',
  status: 'In development',
  date: '2026-09',
  dateRaw: 'September CY2026',
  preview: null,
  products: ['Planner'],
  phases: [],
  clouds: [],
  updated: null,
  ...overrides,
});

const azure = (overrides = {}) => ({
  id: 'azure:1',
  source: 'azure',
  title: 'Retirement: VMs retire on September 1, 2026',
  link: 'https://example.test/a1',
  status: null,
  date: '2026-09-01',
  dateRaw: 'Retirement: VMs retire on September 1, 2026',
  preview: null,
  products: ['Compute'],
  phases: [],
  clouds: [],
  updated: null,
  ...overrides,
});

const types = (events) => events.map((e) => e.type).sort();

describe('diffSnapshots — the slip', () => {
  it('reports a later date as a slip, with its size in months', () => {
    const events = diffSnapshots([m365()], [m365({ date: '2026-12', dateRaw: 'December CY2026' })], { ts: TS });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'slipped',
      from: '2026-09',
      to: '2026-12',
      fromRaw: 'September CY2026',
      toRaw: 'December CY2026',
      months: 3,
      days: null,
    });
  });

  it('reports an earlier date as pulled in, with a negative size', () => {
    const events = diffSnapshots([m365()], [m365({ date: '2026-07' })], { ts: TS });
    expect(events[0].type).toBe('pulled_in');
    expect(events[0].months).toBe(-2);
  });

  it('says nothing when nothing moved', () => {
    expect(diffSnapshots([m365()], [m365()], { ts: TS })).toEqual([]);
  });

  it('stamps every event with the run timestamp', () => {
    const events = diffSnapshots([m365()], [m365({ date: '2026-12' })], { ts: TS });
    expect(events[0].ts).toBe(TS);
  });
});

describe('diffSnapshots — status', () => {
  it('reports reaching Launched as shipped', () => {
    const events = diffSnapshots([m365()], [m365({ status: 'Launched' })], { ts: TS });
    expect(events[0]).toMatchObject({ type: 'shipped', from: 'In development', to: 'Launched' });
  });

  it('reports Cancelled distinctly', () => {
    const events = diffSnapshots([m365()], [m365({ status: 'Cancelled' })], { ts: TS });
    expect(events[0].type).toBe('cancelled');
  });

  it('reports other status moves as a plain status change', () => {
    const events = diffSnapshots([m365()], [m365({ status: 'Rolling out' })], { ts: TS });
    expect(events[0].type).toBe('status_changed');
  });

  it('emits both events when a date and a status move together', () => {
    const events = diffSnapshots([m365()], [m365({ date: '2026-12', status: 'Launched' })], { ts: TS });
    expect(types(events)).toEqual(['shipped', 'slipped']);
  });
});

describe('diffSnapshots — appearance and disappearance', () => {
  it('reports a new roadmap item as added', () => {
    const events = diffSnapshots([], [m365()], { ts: TS });
    expect(events[0]).toMatchObject({ type: 'added', to: '2026-09' });
  });

  it('reports an unshipped item leaving a complete feed as dropped', () => {
    const events = diffSnapshots([m365()], [], { ts: TS });
    expect(events[0]).toMatchObject({ type: 'dropped', from: '2026-09' });
  });

  it('does not report a shipped item leaving the feed', () => {
    expect(diffSnapshots([m365({ status: 'Launched' })], [], { ts: TS })).toEqual([]);
  });

  it('never reports drops for a windowed feed, however much scrolls off', () => {
    const events = diffSnapshots([azure(), azure({ id: 'azure:2' })], [], { ts: TS, windowed: true });
    expect(events).toEqual([]);
  });

  it('reports a date appearing where the feed committed to nothing', () => {
    const events = diffSnapshots([m365({ date: null, dateRaw: null })], [m365()], { ts: TS });
    expect(events[0]).toMatchObject({ type: 'date_added', to: '2026-09' });
  });

  it('stays silent when a date vanishes', () => {
    const events = diffSnapshots([m365()], [m365({ date: null, dateRaw: null })], { ts: TS });
    expect(events).toEqual([]);
  });
});

describe('diffSnapshots — Microsoft notes', () => {
  const note = { date: '2026-08-07', dateRaw: 'August 7, 2026', text: 'We stopped.' };

  it('carries the note onto the event, so the archive holds the primary source', () => {
    const events = diffSnapshots(
      [m365()],
      [m365({ status: 'Cancelled', note })],
      { ts: TS },
    );
    expect(events[0].type).toBe('cancelled');
    expect(events[0].note).toEqual(note);
  });

  it('is null when Microsoft explained nothing', () => {
    const events = diffSnapshots([m365()], [m365({ date: '2026-12' })], { ts: TS });
    expect(events[0].note).toBeNull();
  });

  it('takes the note from the item that disappeared, on a drop', () => {
    const events = diffSnapshots([m365({ note })], [], { ts: TS });
    expect(events[0]).toMatchObject({ type: 'dropped' });
    expect(events[0].note).toEqual(note);
  });
});

describe('diffSnapshots — Azure retirements and updates (A2)', () => {
  it('reports a new retirement notice as announced', () => {
    const events = diffSnapshots([], [azure()], { ts: TS, windowed: true });
    expect(events[0]).toMatchObject({ type: 'retirement_announced', to: '2026-09-01' });
  });

  it('reports a new ordinary Azure update as added, not as a retirement', () => {
    const update = azure({ id: 'azure:2', kind: 'update', date: null, dateRaw: null });
    const events = diffSnapshots([], [update], { ts: TS, windowed: true });
    expect(events[0].type).toBe('added');
  });

  it('reports an Azure preview reaching GA as shipped, same as an M365 feature', () => {
    const before = azure({ kind: 'update', date: null, status: 'In preview' });
    const after = azure({ kind: 'update', date: null, status: 'Launched' });
    const events = diffSnapshots([before], [after], { ts: TS, windowed: true });
    expect(events[0]).toMatchObject({ type: 'shipped', from: 'In preview', to: 'Launched' });
  });

  it('reports a moved retirement date in days, not months', () => {
    const events = diffSnapshots([azure()], [azure({ date: '2027-09-30' })], { ts: TS, windowed: true });
    expect(events[0]).toMatchObject({ type: 'retirement_moved', from: '2026-09-01', to: '2027-09-30', months: null });
    expect(events[0].days).toBe(394);
  });

  it('uses retirement_moved for an earlier date too — sooner is the alarming direction', () => {
    const events = diffSnapshots([azure()], [azure({ date: '2026-07-01' })], { ts: TS, windowed: true });
    expect(events[0].type).toBe('retirement_moved');
    expect(events[0].days).toBeLessThan(0);
  });
});

describe('diffSnapshots — preview dates (the leading indicator)', () => {
  it('reports a preview date slipping, separately from GA', () => {
    const events = diffSnapshots(
      [m365({ preview: '2026-06' })],
      [m365({ preview: '2026-08' })],
      { ts: TS },
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'preview_slipped',
      from: '2026-06',
      to: '2026-08',
      months: 2,
    });
  });

  it('reports a preview date being pulled in', () => {
    const events = diffSnapshots(
      [m365({ preview: '2026-08' })],
      [m365({ preview: '2026-06' })],
      { ts: TS },
    );
    expect(events[0]).toMatchObject({ type: 'preview_pulled_in', months: -2 });
  });

  it('reports a preview date appearing where there was none', () => {
    const events = diffSnapshots([m365()], [m365({ preview: '2026-06' })], { ts: TS });
    expect(events[0]).toMatchObject({ type: 'preview_set', to: '2026-06', from: null });
  });

  it('stays silent when a preview date is withdrawn', () => {
    expect(diffSnapshots([m365({ preview: '2026-06' })], [m365()], { ts: TS })).toEqual([]);
  });

  it('reports preview and GA independently when both move', () => {
    const events = diffSnapshots(
      [m365({ preview: '2026-06' })],
      [m365({ preview: '2026-08', date: '2026-12' })],
      { ts: TS },
    );
    expect(types(events)).toEqual(['preview_slipped', 'slipped']);
  });

  it('says nothing about previews for a source that has none', () => {
    expect(diffSnapshots([azure()], [azure()], { ts: TS, windowed: true })).toEqual([]);
  });
});

describe('diffSnapshots — renames (the quiet scope cut)', () => {
  it('reports a changed title, keeping both versions', () => {
    const events = diffSnapshots(
      [m365({ title: 'Planner: refresh for Web, Desktop and Mobile' })],
      [m365({ title: 'Planner: refresh for Web' })],
      { ts: TS },
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'renamed',
      from: 'Planner: refresh for Web, Desktop and Mobile',
      to: 'Planner: refresh for Web',
    });
  });

  it('carries the new title as the event title', () => {
    const events = diffSnapshots([m365()], [m365({ title: 'New name' })], { ts: TS });
    expect(events[0].title).toBe('New name');
  });

  it('ignores whitespace reflow, which Microsoft does constantly', () => {
    const events = diffSnapshots(
      [m365({ title: 'Planner:  refresh' })],
      [m365({ title: 'Planner: refresh' })],
      { ts: TS },
    );
    expect(events).toEqual([]);
  });

  it('ignores leading and trailing whitespace', () => {
    expect(diffSnapshots([m365({ title: ' A ' })], [m365({ title: 'A' })], { ts: TS })).toEqual([]);
  });

  it('does not fire when a title is empty on either side', () => {
    expect(diffSnapshots([m365({ title: '' })], [m365()], { ts: TS })).toEqual([]);
    expect(diffSnapshots([m365()], [m365({ title: '' })], { ts: TS })).toEqual([]);
  });

  it('reports a rename alongside a slip when both happen', () => {
    const events = diffSnapshots(
      [m365()],
      [m365({ title: 'Renamed thing', date: '2026-12' })],
      { ts: TS },
    );
    expect(types(events)).toEqual(['renamed', 'slipped']);
  });

  it('has no magnitude — a rename is not a distance', () => {
    const events = diffSnapshots([m365()], [m365({ title: 'Other' })], { ts: TS });
    expect(events[0].months).toBeNull();
    expect(events[0].days).toBeNull();
  });
});

describe('diffSnapshots — scope changes (G2)', () => {
  const scoped = (overrides = {}) =>
    m365({ clouds: ['Worldwide', 'GCC High'], platforms: ['Web', 'Desktop', 'Mac'], ...overrides });

  it('reports a cloud being dropped, naming what was lost', () => {
    const events = diffSnapshots([scoped()], [scoped({ clouds: ['Worldwide'] })], { ts: TS });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'scope_reduced',
      dimension: 'clouds',
      from: 'Worldwide, GCC High',
      to: 'Worldwide',
      fromRaw: 'Clouds lost: GCC High',
    });
  });

  it('reports a platform being dropped', () => {
    const events = diffSnapshots([scoped()], [scoped({ platforms: ['Web', 'Desktop'] })], { ts: TS });
    expect(events[0]).toMatchObject({ type: 'scope_reduced', dimension: 'platforms' });
    expect(events[0].fromRaw).toBe('Platforms lost: Mac');
  });

  it('reports scope widening separately', () => {
    const events = diffSnapshots(
      [scoped()],
      [scoped({ platforms: ['Web', 'Desktop', 'Mac', 'Mobile'] })],
      { ts: TS },
    );
    expect(events[0]).toMatchObject({ type: 'scope_expanded', dimension: 'platforms' });
    expect(events[0].fromRaw).toBe('Platforms gained: Mobile');
  });

  it('reports the release phase changing', () => {
    const events = diffSnapshots(
      [scoped({ phases: ['General Availability', 'Preview'] })],
      [scoped({ phases: ['General Availability'] })],
      { ts: TS },
    );
    expect(events[0]).toMatchObject({ type: 'scope_reduced', dimension: 'phases' });
    expect(events[0].fromRaw).toBe('Release phase lost: Preview');
  });

  it('IGNORES a reordering — these lists are sets, and the feed reshuffles them', () => {
    const events = diffSnapshots(
      [scoped()],
      [scoped({ clouds: ['GCC High', 'Worldwide'], platforms: ['Mac', 'Web', 'Desktop'] })],
      { ts: TS },
    );
    expect(events).toEqual([]);
  });

  it('says nothing when a dimension is absent from the previous snapshot', () => {
    // The migration case: `platforms` was not captured until now. Treating
    // absent as empty would report every one of 1,800 items as gaining scope.
    const before = m365();
    delete before.platforms;
    const events = diffSnapshots([before], [m365({ platforms: ['Web'] })], { ts: TS });
    expect(events).toEqual([]);
  });

  it('says nothing when a dimension is absent from the new snapshot', () => {
    const after = m365({ clouds: ['Worldwide'] });
    delete after.clouds;
    expect(diffSnapshots([m365({ clouds: ['Worldwide'] })], [after], { ts: TS })).toEqual([]);
  });

  it('reports both directions when a dimension gains and loses at once', () => {
    const events = diffSnapshots(
      [scoped({ clouds: ['Worldwide', 'GCC High'] })],
      [scoped({ clouds: ['Worldwide', 'DoD'] })],
      { ts: TS },
    );
    expect(types(events)).toEqual(['scope_expanded', 'scope_reduced']);
  });

  it('reports each dimension independently', () => {
    const events = diffSnapshots(
      [scoped()],
      [scoped({ clouds: ['Worldwide'], platforms: ['Web'] })],
      { ts: TS },
    );
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.dimension).sort()).toEqual(['clouds', 'platforms']);
  });

  it('shows an em dash rather than an empty string when a list empties', () => {
    const events = diffSnapshots([scoped()], [scoped({ clouds: [] })], { ts: TS });
    expect(events[0].to).toBe('—');
  });

  it('does not treat products as scope — reassignment is its own thing', () => {
    const events = diffSnapshots([scoped()], [scoped({ products: ['Outlook'] })], { ts: TS });
    expect(events).toEqual([]);
  });

  it('leaves scope alone when only the date moved', () => {
    const events = diffSnapshots([scoped()], [scoped({ date: '2026-12' })], { ts: TS });
    expect(types(events)).toEqual(['slipped']);
  });
});

describe('mergeSnapshot', () => {
  it('replaces wholesale for a complete feed', () => {
    expect(mergeSnapshot([m365(), m365({ id: 'm365:2' })], [m365()])).toHaveLength(1);
  });

  it('carries forward items that scrolled out of a windowed feed', () => {
    const merged = mergeSnapshot([azure(), azure({ id: 'azure:2' })], [azure({ id: 'azure:3' })], {
      windowed: true,
    });
    expect(merged.map((i) => i.id).sort()).toEqual(['azure:1', 'azure:2', 'azure:3']);
  });

  it('lets the new fetch win for an item present in both', () => {
    const merged = mergeSnapshot([azure()], [azure({ date: '2027-01-01' })], { windowed: true });
    expect(merged).toHaveLength(1);
    expect(merged[0].date).toBe('2027-01-01');
  });
});
