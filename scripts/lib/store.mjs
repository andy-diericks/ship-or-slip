// Reading and writing the data branch.
//
// Layout (see ADR 0003) — every file here is generated, none is hand-edited:
//
//   index.json            what exists, when it was built, headline totals
//   recent.json           the last RECENT_DAYS of events — the dashboard's one fetch
//   events/YYYY-MM.json   append-only monthly archive
//   timelines.json        per-item date history, only for items that ever changed
//   current/<source>.json the running snapshot the next diff compares against
//   feed.xml              Atom feed of the notable events

import fs from 'node:fs';
import path from 'node:path';
import { buildFeed } from './feed.mjs';
import { computeOverdue, summariseOverdue } from './overdue.mjs';
import { findContradictions, summariseContradictions } from './contradictions.mjs';
import { appendRun, summariseRuns } from './runs.mjs';

/** How much history the dashboard's single request covers. */
export const RECENT_DAYS = 90;

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 0)}\n`);
};

export const monthKey = (iso) => String(iso).slice(0, 7);

export function readSnapshot(dir, source) {
  return readJson(path.join(dir, 'current', `${source}.json`), []);
}

/** The previous run's manifest, or null on a fresh store. */
export function readIndex(dir) {
  return readJson(path.join(dir, 'index.json'), null);
}

export function writeSnapshot(dir, source, items) {
  writeJson(path.join(dir, 'current', `${source}.json`), items);
}

export function readEvents(dir, month) {
  return readJson(path.join(dir, 'events', `${month}.json`), []);
}

/**
 * Append events to their monthly files, de-duplicated.
 *
 * A re-run over unchanged data produces no events at all, but a re-run after a
 * partial failure can legitimately repeat one — keying on id+type+ts+to keeps
 * the archive idempotent either way.
 *
 * @param {string} dir
 * @param {import('./diff.mjs').ChangeEvent[]} events
 * @returns {string[]} months touched
 */
export function appendEvents(dir, events) {
  const byMonth = new Map();
  for (const e of events) {
    const m = monthKey(e.ts);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(e);
  }
  for (const [month, incoming] of byMonth) {
    const existing = readEvents(dir, month);
    const seen = new Set(existing.map((e) => `${e.id}|${e.type}|${e.ts}|${e.to}`));
    const merged = existing.concat(
      incoming.filter((e) => !seen.has(`${e.id}|${e.type}|${e.ts}|${e.to}`)),
    );
    merged.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    writeJson(path.join(dir, 'events', `${month}.json`), merged);
  }
  return [...byMonth.keys()];
}

/** Every month archive present on disk, newest first. */
export function listMonths(dir) {
  try {
    return fs
      .readdirSync(path.join(dir, 'events'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Rebuild `recent.json` from the monthly archives.
 *
 * Derived rather than appended, so a corrected archive always produces a
 * corrected feed and the two can never drift apart.
 */
export function rebuildRecent(dir, now = new Date()) {
  const cutoff = new Date(now.getTime() - RECENT_DAYS * 86400000).toISOString();
  const events = listMonths(dir)
    .slice(0, Math.ceil(RECENT_DAYS / 28) + 1)
    .flatMap((m) => readEvents(dir, m))
    .filter((e) => e.ts >= cutoff)
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  writeJson(path.join(dir, 'recent.json'), events);
  return events;
}

/**
 * Fold new events into the per-item timelines.
 *
 * Only items that have actually moved get an entry, which keeps this file
 * proportional to the interesting part of the data rather than to the 1,800+
 * roadmap items that sit still.
 */
export function updateTimelines(dir, events, snapshots) {
  const file = path.join(dir, 'timelines.json');
  const timelines = readJson(file, {});
  const current = new Map(Object.values(snapshots).flat().map((i) => [i.id, i]));

  // Refresh the current state of *every* tracked item, not only those with new
  // events. A feature's latest note and stage change without anything moving,
  // and an item whose only event predates a field being captured would
  // otherwise never gain it. This is explicitly the item's state *now* — the
  // historical points below keep whatever was true when they were recorded.
  for (const [id, entry] of Object.entries(timelines)) {
    const item = current.get(id);
    if (!item) continue;
    entry.title = item.title ?? entry.title;
    entry.link = item.link ?? entry.link;
    entry.products = item.products ?? entry.products;
    entry.note = item.note ?? null;
    entry.status = item.status ?? null;
    entry.ga = item.date ?? null;
    entry.preview = item.preview ?? null;
    entry.phases = item.phases?.length ? item.phases : null;
  }

  for (const e of events) {
    const item = current.get(e.id);
    const entry = timelines[e.id] ?? {
      title: e.title,
      link: e.link,
      source: e.source,
      products: e.products,
      points: [],
    };
    entry.title = item?.title ?? e.title;
    entry.link = item?.link ?? e.link;
    entry.products = item?.products ?? e.products;
    entry.note = item?.note ?? e.note ?? null;
    entry.status = item?.status ?? null;
    entry.ga = item?.date ?? null;
    entry.preview = item?.preview ?? null;
    entry.phases = item?.phases?.length ? item.phases : null;
    const point = {
      ts: e.ts,
      type: e.type,
      from: e.from,
      to: e.to,
      note: e.note ?? null,
      context: e.context ?? null,
    };
    if (!entry.points.some((p) => p.ts === point.ts && p.type === point.type && p.to === point.to)) {
      entry.points.push(point);
    }
    entry.points.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    timelines[e.id] = entry;
  }

  writeJson(file, timelines);
  return timelines;
}

/**
 * Write the manifest the dashboard reads first.
 *
 * Note the explicit field list: anything not named here is silently dropped.
 * That bit once already — the overdue summary was passed in and never written,
 * so the dashboard banner that depends on it never appeared. Add the field
 * here as well as at the call site.
 */
export function writeIndex(dir, { sources, totals, warnings, generated, overdue, contradictions, runs }) {
  writeJson(path.join(dir, 'index.json'), {
    generated: generated ?? new Date().toISOString(),
    recentDays: RECENT_DAYS,
    months: listMonths(dir),
    sources,
    totals,
    overdue: overdue ?? null,
    contradictions: contradictions ?? null,
    runs: runs ?? null,
    warnings: warnings ?? [],
  });
}

/** Where the published site lives — the feed links back to it. */
export const SITE_URL = 'https://andy-diericks.github.io/ship-or-slip/';
export const FEED_URL =
  'https://raw.githubusercontent.com/andy-diericks/ship-or-slip/data/feed.xml';

/**
 * Write the Atom feed.
 *
 * Derived from the recent events on every run, like `recent.json` — never
 * appended to, so a corrected archive always yields a corrected feed.
 */
export function writeFeed(dir, events, generated) {
  const xml = buildFeed({ events, generated, siteUrl: SITE_URL, feedUrl: FEED_URL });
  const file = path.join(dir, 'feed.xml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, xml);
  return xml;
}

/**
 * Write the overdue register.
 *
 * Derived from the current snapshots on every run, never appended to: an item
 * that finally ships must leave the register, and an item that slips into the
 * past must join it. Kept in its own file because it is large and the feed
 * page never needs it.
 */
export function writeOverdue(dir, snapshots, generated) {
  const month = String(generated).slice(0, 7);
  const items = Object.values(snapshots ?? {}).flat();
  const overdue = computeOverdue(items, month);
  const summary = summariseOverdue(overdue, items.length);

  const file = path.join(dir, 'overdue.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ generated, month, summary, items: overdue }, null, 0)}\n`);
  return summary;
}

/**
 * Write the contradictions register.
 *
 * Small enough to ship whole — five items today — but kept in its own file so
 * it can grow without weighing on the dashboard's first load.
 */
export function writeContradictions(dir, snapshots, generated) {
  const month = String(generated).slice(0, 7);
  const items = Object.values(snapshots ?? {}).flat();
  const found = findContradictions(items, month);
  const summary = summariseContradictions(found);

  const file = path.join(dir, 'contradictions.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ generated, month, summary, items: found }, null, 0)}\n`);
  return summary;
}

/**
 * Record this run in the log and return how the pipeline has been behaving.
 *
 * Written on every run including the quiet ones — a run that found nothing is
 * exactly the evidence that the pipeline is alive, and omitting it would make
 * a healthy quiet week indistinguishable from a dead dispatcher.
 */
export function recordRun(dir, { generated, sourceMeta, events, warnings }) {
  const file = path.join(dir, 'runs.json');
  const existing = readJson(file, []);
  const sources = {};
  for (const [name, meta] of Object.entries(sourceMeta ?? {})) {
    sources[name] = {
      count: meta.count,
      ok: Boolean(meta.ok),
      ...(meta.held ? { held: true } : {}),
      ...(meta.seeded ? { seeded: true } : {}),
    };
  }

  const runs = appendRun(existing, {
    ts: generated,
    sources,
    events: events?.length ?? 0,
    byType: countByType(events ?? []),
    warnings: warnings ?? [],
  });

  writeJson(file, runs);
  return summariseRuns(runs);
}

/** Roll up event counts by type, for the dashboard's hero row. */
export function countByType(events) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}
