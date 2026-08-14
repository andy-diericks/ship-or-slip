// Where Microsoft's roadmap disagrees with itself.
//
// Not a slip, not a cancellation — a feature whose own record is internally
// inconsistent. Marked "Launched" while its own note says it is still in
// development; marked "Launched" with a rollout date months in the future.
// Nobody publishes these because you only see them by reading one item's
// fields against each other, which no roadmap UI invites you to do.
//
// Deliberately conservative. A false contradiction is worse than a missed one:
// the claim here is that Microsoft contradicted itself, and that has to be
// true every single time or the whole page is dismissible. Every rule below
// fires only on Microsoft's own words or Microsoft's own dates — never on an
// inference of ours.

/** Notes that say, in Microsoft's words, that the thing has not shipped. */
const NOT_SHIPPED = /still in development|will begin rolling out|has not (?:yet )?(?:begun|started)|not yet (?:available|rolled out)/i;

/** Notes admitting a withdrawal after release. */
const ROLLED_BACK = /rolled back/i;

/**
 * @typedef {object} Contradiction
 * @property {string} id
 * @property {string} title
 * @property {string} source
 * @property {string[]} products
 * @property {'launched_unshipped'|'rolled_back'|'launched_future'} kind
 * @property {string} claim    What the roadmap asserts
 * @property {string} evidence What contradicts it, in Microsoft's own words
 * @property {import('./notes.mjs').UpdateNote|null} note
 */

const KIND_LABELS = {
  launched_unshipped: 'Marked launched, but not shipped',
  rolled_back: 'Rolled back after release',
  launched_future: 'Marked launched before its own rollout date',
};

export const CONTRADICTION_LABELS = KIND_LABELS;

/**
 * Classify one item, or return null when its record is consistent.
 *
 * Order matters: an item can satisfy more than one rule, and each appears once
 * under its most specific description.
 */
function classify(item, nowMonth) {
  const noteText = item?.note?.text ?? '';

  if (item.status === 'Launched' && NOT_SHIPPED.test(noteText)) {
    return {
      kind: 'launched_unshipped',
      claim: 'Roadmap status: Launched',
      evidence: `Microsoft's own note: “${noteText}”`,
    };
  }

  if (ROLLED_BACK.test(noteText)) {
    return {
      kind: 'rolled_back',
      claim: `Roadmap status: ${item.status ?? 'unknown'}`,
      evidence: `Microsoft's own note: “${noteText}”`,
    };
  }

  if (item.status === 'Launched' && item.date && item.date > nowMonth) {
    return {
      kind: 'launched_future',
      claim: 'Roadmap status: Launched',
      // Both halves are Microsoft's; we only put them next to each other.
      evidence: `…but its own rollout date is ${item.dateRaw ?? item.date}, still in the future`,
    };
  }

  return null;
}

/**
 * Find every item whose own record disagrees with itself.
 *
 * @param {any[]} items
 * @param {string} nowMonth `YYYY-MM`
 * @returns {Contradiction[]}
 */
export function findContradictions(items, nowMonth) {
  if (!Array.isArray(items) || !/^\d{4}-\d{2}$/.test(String(nowMonth))) return [];

  const found = [];
  for (const item of items) {
    if (!item) continue;
    const verdict = classify(item, nowMonth);
    if (!verdict) continue;
    found.push({
      id: item.id,
      title: item.title,
      source: item.source,
      products: item.products ?? [],
      note: item.note ?? null,
      clouds: item.clouds?.length ? item.clouds : null,
      platforms: item.platforms?.length ? item.platforms : null,
      ...verdict,
    });
  }
  return found.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
}

/** Headline counts for the dashboard. */
export function summariseContradictions(found) {
  const list = found ?? [];
  /** @type {Record<string, number>} */
  const byKind = {};
  for (const c of list) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  return { count: list.length, byKind };
}
