// The overdue register.
//
// A feature whose rollout month has passed while it sits at "In development"
// is the plainest possible evidence of a promise not kept — and Microsoft's
// roadmap shows no such view. It simply displays the old date as though it
// were still the plan.
//
// Unlike every other analysis in the backlog, this needs no accumulated
// history: it is computed from the current snapshot alone, so it is as good on
// day one as it will ever be. That is why it was built before the league
// tables it superficially resembles.

import { monthsBetween } from './dates.mjs';

/** Statuses that mean the item is no longer waiting to arrive. */
const SETTLED = new Set(['Launched', 'Cancelled']);

/**
 * @typedef {object} OverdueItem
 * @property {string} id
 * @property {string} title
 * @property {string} source
 * @property {string[]} products
 * @property {string} due       `YYYY-MM`, the month it was promised for
 * @property {string|null} dueRaw
 * @property {string|null} status
 * @property {number} monthsLate
 * @property {import('./notes.mjs').UpdateNote|null} note
 */

/**
 * Items whose promised month has passed without them arriving.
 *
 * "Rolling out" is included but kept distinguishable: a rollout genuinely in
 * flight is a weaker claim than something still in development two years after
 * its date, and conflating them would overstate the case. The status travels
 * with every row so the reader can judge.
 *
 * @param {any[]} items    a source snapshot
 * @param {string} nowMonth `YYYY-MM`
 * @returns {OverdueItem[]} most overdue first
 */
export function computeOverdue(items, nowMonth) {
  if (!Array.isArray(items) || !/^\d{4}-\d{2}$/.test(String(nowMonth))) return [];

  return items
    .filter((i) => i?.date && i.date < nowMonth && !SETTLED.has(i.status))
    // A retirement date in the past means the thing was removed on schedule.
    // That is a promise *kept*, and the exact opposite of what this register
    // is for — it tracks promises to deliver, not promises to withdraw.
    .filter((i) => i.kind !== 'retirement')
    .map((i) => ({
      id: i.id,
      title: i.title,
      source: i.source,
      products: i.products ?? [],
      due: i.date,
      dueRaw: i.dateRaw ?? null,
      status: i.status ?? null,
      monthsLate: monthsBetween(i.date, nowMonth) ?? 0,
      note: i.note ?? null,
      // Carried so a reader can ask "does this affect *my* tenant?". The
      // fields were already captured for scope-cut detection and were
      // otherwise going unused by the registers.
      clouds: i.clouds?.length ? i.clouds : null,
      platforms: i.platforms?.length ? i.platforms : null,
    }))
    .sort((a, b) => b.monthsLate - a.monthsLate || a.title.localeCompare(b.title));
}

/**
 * Headline numbers for the register.
 *
 * `stillInDevelopment` is called out separately because it is the damning
 * subset — a rollout that is late is a delivery problem, but something still
 * in development years past its date was never close.
 */
export function summariseOverdue(overdue, trackedCount) {
  const list = overdue ?? [];
  /** @type {Record<string, number>} */
  const byStatus = {};
  for (const item of list) byStatus[item.status ?? 'unknown'] = (byStatus[item.status ?? 'unknown'] ?? 0) + 1;

  return {
    count: list.length,
    tracked: trackedCount ?? 0,
    share: trackedCount ? Math.round((list.length / trackedCount) * 100) : 0,
    worstMonthsLate: list[0]?.monthsLate ?? 0,
    stillInDevelopment: byStatus['In development'] ?? 0,
    byStatus,
  };
}
