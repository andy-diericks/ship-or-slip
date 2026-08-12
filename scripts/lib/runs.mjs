// The run log.
//
// `index.json` says what the pipeline knows *now*. This says whether the
// pipeline has been working — which is a different question, and the one that
// went unanswered for a day when GitHub's scheduler silently fired nothing.
//
// Kept deliberately small: a run record is a handful of numbers, not a copy of
// the data. The point is to make gaps visible, and a gap is visible from
// timestamps alone.

/** How many runs to keep. At four a day this is about seven weeks. */
export const RUN_HISTORY = 200;

/** The pipeline is dispatched every six hours (ADR 0003). */
export const EXPECTED_INTERVAL_HOURS = 6;

/**
 * A run counts as having missed a window once it is this far past due. The
 * dispatcher fires at :37 and a run takes a couple of minutes, so a little
 * slack keeps ordinary jitter from reading as failure.
 */
export const MISSED_AFTER_HOURS = EXPECTED_INTERVAL_HOURS * 1.5;

/**
 * @typedef {object} RunRecord
 * @property {string} ts
 * @property {Record<string, {count: number, ok: boolean, held?: boolean, seeded?: boolean}>} sources
 * @property {number} events
 * @property {Record<string, number>} byType
 * @property {string[]} warnings
 * @property {{overdue?: number|null, stillInDevelopment?: number|null, contradictions?: number|null}} [registers]
 *   The register counts at this run. Recorded because `overdue.json` is
 *   *derived* and overwritten every run: without a per-run snapshot of the
 *   count, the trend — is Microsoft's backlog of late features growing or
 *   shrinking? — is destroyed each time and can never be reconstructed. The
 *   same failure this whole project exists to document, committed against
 *   ourselves.
 */

/**
 * Add a run to the log, newest first, capped.
 *
 * De-duplicated on the timestamp so a re-run against the same store cannot
 * double-count — the log is evidence about cadence, and a phantom run would
 * make a gap disappear.
 *
 * @param {RunRecord[]} existing
 * @param {RunRecord} record
 * @param {number} [cap]
 * @returns {RunRecord[]}
 */
export function appendRun(existing, record, cap = RUN_HISTORY) {
  const runs = (existing ?? []).filter((r) => r && r.ts !== record.ts);
  return [record, ...runs]
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    .slice(0, Math.max(1, cap));
}

/**
 * Hours between each run and the one before it.
 *
 * Returned newest first and aligned with the run list, so `gaps[i]` is the
 * wait that preceded `runs[i]`. The most recent run has no predecessor in the
 * window, hence null.
 *
 * @param {RunRecord[]} runs newest first
 * @returns {(number|null)[]}
 */
export function runGaps(runs) {
  const list = runs ?? [];
  return list.map((run, i) => {
    const previous = list[i + 1];
    if (!previous) return null;
    const a = Date.parse(run.ts);
    const b = Date.parse(previous.ts);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.round(((a - b) / 3_600_000) * 10) / 10;
  });
}

/**
 * How the pipeline has actually been behaving.
 *
 * `missedWindows` counts gaps long enough to mean a dispatch did not happen —
 * the number that would have caught the silent scheduler on day one.
 */
export function summariseRuns(runs, now = new Date()) {
  const list = runs ?? [];
  if (!list.length) {
    return { total: 0, missedWindows: 0, medianGapHours: null, lastRun: null, heldRuns: 0, warningRuns: 0 };
  }

  const gaps = runGaps(list).filter((g) => typeof g === 'number');
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : Math.round(((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) * 10) / 10
    : null;

  const sinceLast = (now.getTime() - Date.parse(list[0].ts)) / 3_600_000;

  return {
    total: list.length,
    missedWindows: gaps.filter((g) => g > MISSED_AFTER_HOURS).length,
    medianGapHours: median,
    lastRun: list[0].ts,
    hoursSinceLastRun: Number.isFinite(sinceLast) ? Math.round(sinceLast * 10) / 10 : null,
    heldRuns: list.filter((r) => Object.values(r.sources ?? {}).some((s) => s?.held)).length,
    warningRuns: list.filter((r) => (r.warnings ?? []).length > 0).length,
  };
}

/**
 * The overdue count over time, oldest first, for plotting.
 *
 * Only runs that recorded a count appear: runs from before this was captured
 * are omitted rather than treated as zero, because a missing measurement is
 * not a measurement of nothing. Showing a phantom climb from zero would be a
 * lie of exactly the kind this project is built to catch.
 *
 * @param {RunRecord[]} runs newest first
 * @returns {{ts: string, overdue: number, stillInDevelopment: number|null}[]}
 */
export function overdueTrend(runs) {
  return (runs ?? [])
    .filter((r) => typeof r?.registers?.overdue === 'number')
    .map((r) => ({
      ts: r.ts,
      overdue: r.registers.overdue,
      stillInDevelopment: typeof r.registers.stillInDevelopment === 'number'
        ? r.registers.stillInDevelopment
        : null,
    }))
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
