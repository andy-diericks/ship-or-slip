// The differ: two snapshots in, a list of events out.
//
// This is the whole product in one file. Microsoft publishes only the present
// tense; every event here exists because we kept yesterday's copy.

import { monthsBetween, daysBetween } from './dates.mjs';

/**
 * @typedef {import('./normalize.mjs').TrackedItem} TrackedItem
 *
 * @typedef {object} ChangeEvent
 * @property {string} ts        Run timestamp, ISO
 * @property {string} type      See EVENT_TYPES
 * @property {string} id
 * @property {'m365'|'azure'} source
 * @property {string} title
 * @property {string} link
 * @property {string[]} products
 * @property {string|null} from Previous value (date or status)
 * @property {string|null} to   New value
 * @property {string|null} fromRaw
 * @property {string|null} toRaw
 * @property {number|null} months Slip size in months (M365)
 * @property {number|null} days   Slip size in days (Azure)
 */

export const EVENT_TYPES = /** @type {const} */ ([
  'slipped',
  'pulled_in',
  'shipped',
  'cancelled',
  'status_changed',
  'dropped',
  'added',
  'retirement_announced',
  'retirement_moved',
  'date_added',
]);

const byId = (items) => new Map(items.map((i) => [i.id, i]));

function base(item, ts, type) {
  return {
    ts,
    type,
    id: item.id,
    source: item.source,
    title: item.title,
    link: item.link,
    products: item.products ?? [],
    from: null,
    to: null,
    fromRaw: null,
    toRaw: null,
    months: null,
    days: null,
  };
}

/**
 * Compare two snapshots of the same source.
 *
 * `windowed` marks a feed that only exposes a rolling window of recent items
 * (the Azure RSS shows the last 200). For those, an item's absence carries no
 * information — it scrolled off the end — so disappearance never becomes a
 * `dropped` event. Emitting drops for a windowed feed would produce a torrent
 * of false "Microsoft cancelled this" claims, which is the one mistake this
 * project cannot afford to make.
 *
 * @param {TrackedItem[]} prev
 * @param {TrackedItem[]} next
 * @param {{ts?: string, windowed?: boolean}} [options]
 * @returns {ChangeEvent[]}
 */
export function diffSnapshots(prev, next, options = {}) {
  const ts = options.ts ?? new Date().toISOString();
  const windowed = options.windowed ?? false;
  const before = byId(prev ?? []);
  const after = byId(next ?? []);
  /** @type {ChangeEvent[]} */
  const events = [];

  for (const item of after.values()) {
    const old = before.get(item.id);

    if (!old) {
      const type = item.source === 'azure' ? 'retirement_announced' : 'added';
      events.push({
        ...base(item, ts, type),
        to: item.date,
        toRaw: item.dateRaw,
      });
      continue;
    }

    if (old.date !== item.date) {
      if (old.date && item.date) {
        const months = monthsBetween(old.date, item.date);
        const days = daysBetween(old.date, item.date);
        const later = (days ?? months ?? 0) > 0;
        events.push({
          ...base(item, ts, item.source === 'azure' ? 'retirement_moved' : later ? 'slipped' : 'pulled_in'),
          from: old.date,
          to: item.date,
          fromRaw: old.dateRaw,
          toRaw: item.dateRaw,
          months: item.source === 'm365' ? months : null,
          days: item.source === 'azure' ? days : null,
        });
      } else if (item.date) {
        // A date appeared where the feed previously committed to nothing.
        events.push({ ...base(item, ts, 'date_added'), to: item.date, toRaw: item.dateRaw });
      }
      // A date vanishing is left unreported: the feed does this transiently and
      // it says less than a slip does.
    }

    if (old.status !== item.status && item.status) {
      const type =
        item.status === 'Launched' ? 'shipped'
        : item.status === 'Cancelled' ? 'cancelled'
        : 'status_changed';
      events.push({ ...base(item, ts, type), from: old.status, to: item.status });
    }
  }

  if (!windowed) {
    for (const old of before.values()) {
      if (after.has(old.id)) continue;
      // Something that already shipped and then left the feed is housekeeping,
      // not a cancellation.
      if (old.status === 'Launched') continue;
      events.push({ ...base(old, ts, 'dropped'), from: old.date, fromRaw: old.dateRaw });
    }
  }

  return events;
}

/**
 * Fold a new fetch into the running snapshot.
 *
 * For a windowed feed the new fetch is only the recent slice, so items that
 * scrolled out are carried forward. Without this the Azure history would be
 * permanently capped at whatever the last 200 updates happened to contain,
 * and a retirement date that moves a year from now would go unnoticed.
 *
 * @param {TrackedItem[]} prev
 * @param {TrackedItem[]} next
 * @param {{windowed?: boolean}} [options]
 * @returns {TrackedItem[]}
 */
export function mergeSnapshot(prev, next, options = {}) {
  if (!options.windowed) return next;
  const merged = byId(prev ?? []);
  for (const item of next) merged.set(item.id, item);
  return [...merged.values()];
}
