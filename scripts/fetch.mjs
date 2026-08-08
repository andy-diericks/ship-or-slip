#!/usr/bin/env node
// Ship or Slip — one run of the pipeline.
//
//   node scripts/fetch.mjs                     fetch live, write to ./.data
//   node scripts/fetch.mjs --data-dir=path     write somewhere else
//   node scripts/fetch.mjs --offline           use ./fixtures, touch no network
//   node scripts/fetch.mjs --dry-run           report what would change, write nothing
//   node scripts/fetch.mjs --force             accept a run the anomaly guard held
//
// A run never fails the build over one bad feed: a source that cannot be
// fetched is recorded as a warning and its snapshot is left untouched, so the
// next successful run diffs against real data rather than against an empty
// list. Treating a fetch failure as "everything disappeared" would fabricate
// thousands of events.
//
// The same instinct, one level up: a feed that parses cleanly but has *changed
// shape* produces a plausible-looking diff in which everything moved at once.
// The anomaly guard holds those runs instead of writing them — see
// scripts/lib/anomaly.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { normalizeM365, normalizeAzure } from './lib/normalize.mjs';
import { diffSnapshots, mergeSnapshot } from './lib/diff.mjs';
import { detectAnomaly } from './lib/anomaly.mjs';
import {
  readSnapshot, writeSnapshot, appendEvents, rebuildRecent,
  updateTimelines, writeIndex, countByType, writeFeed,
} from './lib/store.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;

const DATA_DIR = path.resolve(option('data-dir', '.data'));
const OFFLINE = flag('offline');
const DRY_RUN = flag('dry-run');
const FORCE = flag('force');
const FIXTURES = path.resolve('fixtures');

const SOURCES = {
  m365: {
    url: 'https://www.microsoft.com/releasecommunications/api/v1/m365',
    fixture: 'm365.json',
    windowed: false,
    parse: (text) => normalizeM365(JSON.parse(text)),
  },
  azure: {
    url: 'https://www.microsoft.com/releasecommunications/api/v2/azure/rss',
    fixture: 'azure.xml',
    // The RSS exposes only the most recent 200 updates.
    windowed: true,
    parse: (text) => normalizeAzure(text),
  },
};

/** Fetch with a timeout and a couple of retries — these feeds 5xx occasionally. */
async function fetchText(url, { attempts = 3, timeoutMs = 60000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'ship-or-slip (+https://github.com/andy-diericks/ship-or-slip)' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 2000 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function loadSource(name) {
  const source = SOURCES[name];
  if (OFFLINE) return fs.readFileSync(path.join(FIXTURES, source.fixture), 'utf8');
  return fetchText(source.url);
}

async function main() {
  const ts = new Date().toISOString();
  const warnings = [];
  const sourceMeta = {};
  const snapshots = {};
  /** @type {import('./lib/diff.mjs').ChangeEvent[]} */
  let allEvents = [];
  let anomalyHeld = false;

  for (const [name, source] of Object.entries(SOURCES)) {
    const previous = readSnapshot(DATA_DIR, name);
    let items;
    try {
      items = source.parse(await loadSource(name));
    } catch (error) {
      warnings.push(`${name}: fetch failed — ${error.message}. Snapshot left unchanged.`);
      sourceMeta[name] = { count: previous.length, fetched: null, ok: false };
      snapshots[name] = previous;
      continue;
    }

    if (!items.length) {
      warnings.push(`${name}: feed parsed to zero items. Snapshot left unchanged.`);
      sourceMeta[name] = { count: previous.length, fetched: ts, ok: false };
      snapshots[name] = previous;
      continue;
    }

    // First run has nothing to compare against — seed the snapshot silently
    // rather than reporting 1,800 features as brand-new events.
    const seeding = previous.length === 0;
    const events = seeding ? [] : diffSnapshots(previous, items, { ts, windowed: source.windowed });

    // A diff this large is a changed feed, not a changed roadmap. Hold it: the
    // snapshot stays put so the next run re-diffs against the same known-good
    // baseline, and nothing enters the append-only archive that would have to
    // be lived with forever.
    const anomaly = FORCE ? { flagged: false } : detectAnomaly(events.length, previous.length);
    if (anomaly.flagged) {
      warnings.push(`${name}: ${anomaly.reason}`);
      sourceMeta[name] = { count: previous.length, fetched: ts, ok: false, held: true };
      snapshots[name] = previous;
      anomalyHeld = true;
      console.error(`${name}: HELD — ${anomaly.reason}`);
      continue;
    }

    const merged = mergeSnapshot(previous, items, { windowed: source.windowed });

    allEvents = allEvents.concat(events);
    snapshots[name] = merged;
    sourceMeta[name] = {
      count: merged.length,
      fetched: ts,
      ok: true,
      windowed: source.windowed,
      ...(seeding ? { seeded: true } : {}),
      ...(FORCE && events.length ? { forced: true } : {}),
    };

    console.log(
      `${name}: ${items.length} items in feed, ${merged.length} tracked, ` +
      `${seeding ? 'seeded (no diff)' : `${events.length} events`}`,
    );
  }

  const counts = countByType(allEvents);
  for (const [type, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${n}`);
  }

  if (DRY_RUN) {
    console.log(`\nDry run — nothing written. ${allEvents.length} event(s) would be recorded.`);
    for (const w of warnings) console.warn(`  warning: ${w}`);
    return;
  }

  for (const [name, items] of Object.entries(snapshots)) {
    if (sourceMeta[name]?.ok) writeSnapshot(DATA_DIR, name, items);
  }
  if (allEvents.length) appendEvents(DATA_DIR, allEvents);
  const recent = rebuildRecent(DATA_DIR);
  updateTimelines(DATA_DIR, allEvents, snapshots);
  writeFeed(DATA_DIR, recent, ts);
  writeIndex(DATA_DIR, {
    generated: ts,
    sources: sourceMeta,
    totals: { recent: recent.length, recentByType: countByType(recent) },
    warnings,
  });

  console.log(`\nWrote ${DATA_DIR} — ${allEvents.length} new event(s), ${recent.length} in recent feed.`);
  for (const w of warnings) console.warn(`  warning: ${w}`);

  // A held run exits non-zero on purpose, and only for an anomaly. A dead feed
  // is transient and self-healing, so it stays a warning; a feed that changed
  // shape needs a person to look at it before any more data is written. The
  // red run in the Actions tab (and GitHub's mail about it) is that summons.
  // Everything healthy has already been written above — the exit code escalates,
  // it does not discard.
  if (anomalyHeld) {
    console.error('\nA source was held by the anomaly guard. Inspect the feed, then re-run');
    console.error('with --force if the change is genuine. Nothing was written for that source.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
