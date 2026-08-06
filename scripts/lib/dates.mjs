// Date parsing for the two Microsoft feeds.
//
// Microsoft never publishes a machine-readable target date. The M365 roadmap
// gives a human string ("September CY2026", sometimes "Q3 CY2026"); Azure
// buries retirement dates in prose ("will be retired on 30 September 2027").
// Everything downstream compares dates, so parsing happens exactly once, here.

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Month index (1-12) for a month name or three-letter abbreviation. */
function monthNumber(name) {
  const n = String(name).trim().toLowerCase();
  const i = MONTHS.findIndex((m) => m === n || m.slice(0, 3) === n.slice(0, 3));
  return i === -1 ? null : i + 1;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Parse an M365 roadmap availability string into a comparable month.
 *
 * Accepts "September CY2026", "Q3 CY2026", "H2 CY2026" and the bare-year
 * "CY2026". Returns a `YYYY-MM` string, or null when the feed gives us
 * nothing usable (a large minority of items have an empty preview date).
 *
 * Quarters and halves resolve to their FIRST month: a slip out of a quarter
 * is what we want to detect, and anchoring to the start makes "Q3 → Q4" a
 * clean three-month move rather than a fuzzy one.
 *
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function parseRoadmapDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const year = s.match(/CY\s*(\d{4})/i) ?? s.match(/\b(20\d{2})\b/);
  if (!year) return null;
  const y = Number(year[1]);

  const quarter = s.match(/\bQ([1-4])\b/i);
  if (quarter) return `${y}-${pad((Number(quarter[1]) - 1) * 3 + 1)}`;

  const half = s.match(/\bH([12])\b/i);
  if (half) return `${y}-${pad(Number(half[1]) === 1 ? 1 : 7)}`;

  const month = s.match(/\b([A-Za-z]{3,9})\b/g)?.map(monthNumber).find((m) => m !== null);
  if (month) return `${y}-${pad(month)}`;

  // Bare "CY2026" — a year with no finer commitment. Anchor to January so it
  // still compares, and let the raw string carry the nuance in the UI.
  return `${y}-01`;
}

/**
 * Pull a retirement date out of Azure update prose.
 *
 * Azure titles carry the date in whatever shape the author felt like:
 * "on September 1, 2026", "by January 31, 2027", "on 30 September 2027",
 * "on 2027-09-30". Returns `YYYY-MM-DD`, or null when no date is present
 * (plenty of retirement notices only say "in the coming months").
 *
 * @param {string | null | undefined} text
 * @returns {string | null}
 */
export function parseRetirementDate(text) {
  if (!text) return null;
  const s = String(text);

  const iso = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "September 1, 2026" / "September 2026"
  const monthFirst = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/);
  if (monthFirst) {
    const m = monthNumber(monthFirst[1]);
    if (m) return `${monthFirst[3]}-${pad(m)}-${pad(monthFirst[2])}`;
  }

  // "30 September 2027"
  const dayFirst = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/);
  if (dayFirst) {
    const m = monthNumber(dayFirst[2]);
    if (m) return `${dayFirst[3]}-${pad(m)}-${pad(dayFirst[1])}`;
  }

  // "September 2026" with no day — anchor to the 1st.
  const monthYear = s.match(/\b([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);
  if (monthYear) {
    const m = monthNumber(monthYear[1]);
    if (m) return `${monthYear[2]}-${pad(m)}-01`;
  }

  return null;
}

/**
 * Whole months from one `YYYY-MM` to another. Positive means `to` is later,
 * i.e. the feature slipped. Returns null if either side is missing.
 *
 * @param {string | null} from
 * @param {string | null} to
 * @returns {number | null}
 */
export function monthsBetween(from, to) {
  if (!from || !to) return null;
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (!fy || !fm || !ty || !tm) return null;
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Whole days between two `YYYY-MM-DD` dates. Positive means `to` is later.
 * Both dates are treated as UTC midnight, so DST never enters the arithmetic.
 *
 * @param {string | null} from
 * @param {string | null} to
 * @returns {number | null}
 */
export function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}
