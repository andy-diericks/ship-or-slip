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
 * @property {string} [dimension] Which tag list changed, on scope events
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
  'preview_slipped',
  'preview_pulled_in',
  'preview_set',
  'renamed',
  'scope_reduced',
  'scope_expanded',
]);

/**
 * Tag lists whose shrinking is a scope cut.
 *
 * `products` is deliberately absent: an item moving between product families
 * is a reassignment, not a cut, and belongs to its own event type.
 */
export const SCOPE_DIMENSIONS = /** @type {const} */ (['clouds', 'platforms', 'phases']);

/** Human labels for the dimensions, used in warnings and the UI. */
export const SCOPE_LABELS = {
  clouds: 'Clouds',
  platforms: 'Platforms',
  phases: 'Release phase',
};

/**
 * Compare two tag lists as sets.
 *
 * Order is not meaningful in these feeds and does vary between responses, so
 * comparing them as arrays would report a reshuffle as a scope change on
 * hundreds of items at once.
 */
function setDiff(before, after) {
  const b = new Set(before);
  const a = new Set(after);
  return {
    removed: [...b].filter((v) => !a.has(v)),
    added: [...a].filter((v) => !b.has(v)),
  };
}

/**
 * Titles differing only in whitespace are not renames.
 *
 * Microsoft reflows its own copy constantly — a double space collapsing is not
 * news, and reporting it would bury the renames that actually mean something.
 * Case is deliberately preserved: "Preview" becoming "preview" is noise, but
 * "GA" becoming "Ga" would signal an editorial pass worth seeing.
 */
const canonicalTitle = (title) => String(title ?? '').replace(/\s+/g, ' ').trim();

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

    // The preview date is a leading indicator: it slips weeks before GA does,
    // and the feed exposes it on every item. Tracked with the same vocabulary
    // as the GA date so the two read alike.
    if (old.preview !== item.preview) {
      if (old.preview && item.preview) {
        const months = monthsBetween(old.preview, item.preview);
        events.push({
          ...base(item, ts, (months ?? 0) > 0 ? 'preview_slipped' : 'preview_pulled_in'),
          from: old.preview,
          to: item.preview,
          months,
        });
      } else if (item.preview) {
        events.push({ ...base(item, ts, 'preview_set'), to: item.preview });
      }
      // A preview date being withdrawn is left unreported, for the same reason
      // a withdrawn GA date is: the feed does it transiently and it says less
      // than a slip does.
    }

    // Scope: a feature losing "GCC High" or "Mac" is a commitment shrinking
    // without a single date moving, and nothing else reports it.
    for (const dimension of SCOPE_DIMENSIONS) {
      const before = old[dimension];
      const after = item[dimension];

      // A dimension missing from the previous snapshot is *unknown*, not
      // empty. Without this, the first run after a new dimension starts being
      // captured would report every item as having gained scope — thousands of
      // false events, which is exactly what the archive must never accumulate.
      if (!Array.isArray(before) || !Array.isArray(after)) continue;

      const { removed, added } = setDiff(before, after);
      const label = SCOPE_LABELS[dimension] ?? dimension;

      if (removed.length) {
        events.push({
          ...base(item, ts, 'scope_reduced'),
          dimension,
          from: before.join(', '),
          to: after.join(', ') || '—',
          fromRaw: `${label} lost: ${removed.join(', ')}`,
          toRaw: null,
        });
      }
      if (added.length) {
        events.push({
          ...base(item, ts, 'scope_expanded'),
          dimension,
          from: before.join(', ') || '—',
          to: after.join(', '),
          fromRaw: `${label} gained: ${added.join(', ')}`,
          toRaw: null,
        });
      }
    }

    if (canonicalTitle(old.title) !== canonicalTitle(item.title) && old.title && item.title) {
      // Titles get rewritten to narrow scope without touching a date — the
      // quietest way a commitment shrinks. Both versions are kept so the
      // change speaks for itself.
      events.push({ ...base(item, ts, 'renamed'), from: old.title, to: item.title });
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
