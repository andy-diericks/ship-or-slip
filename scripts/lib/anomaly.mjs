// The anomaly guard.
//
// Every other safeguard in this pipeline protects against a feed being *down*.
// This one protects against a feed being *different*: a renamed field, a
// changed id scheme, a reshaped payload. Those do not fail — they parse
// cleanly and produce a diff in which everything Microsoft has ever promised
// appears to have moved at once.
//
// That is the one failure this project cannot absorb. A missed run costs a few
// hours of detection; a thousand fabricated events poison the archive
// permanently, because the archive is append-only by design and Microsoft will
// not serve the old values again for us to re-derive the truth. So when a run
// looks implausible, the pipeline refuses to write rather than guessing.
//
// The guard is deliberately dumb. A clever detector that occasionally lets a
// bad run through is worth less than a blunt one that stops the line and asks
// for a human.

export const ANOMALY_DEFAULTS = {
  /**
   * Never flag a run smaller than this, whatever the ratio says.
   *
   * Real days are quiet: the first live run produced 23 events against 1,814
   * tracked items. A floor keeps small or newly-added sources — where a
   * handful of events is a large *share* but a trivial *number* — from
   * tripping the guard for no reason.
   */
  minEvents: 50,

  /**
   * Flag when more than this share of tracked items changed in a single run.
   *
   * Microsoft moves features in batches, but it does not move a quarter of the
   * roadmap between two runs six hours apart. Anything at that scale is a
   * change in the feed, not a change in the plan.
   */
  maxRatio: 0.25,
};

/**
 * @typedef {object} AnomalyVerdict
 * @property {boolean} flagged
 * @property {string} [reason] Human-readable, surfaced on the dashboard
 */

/**
 * Decide whether a run's diff is too large to be believable.
 *
 * Both conditions must hold: the run is large in absolute terms *and* large
 * relative to what we were tracking. Either alone produces false positives —
 * ratio alone punishes small sources, count alone punishes big ones.
 *
 * @param {number} eventCount   Events this run wants to record for one source
 * @param {number} trackedCount Items in the *previous* snapshot — the baseline
 *                              the diff was taken against
 * @param {Partial<typeof ANOMALY_DEFAULTS>} [options]
 * @returns {AnomalyVerdict}
 */
export function detectAnomaly(eventCount, trackedCount, options = {}) {
  const { minEvents, maxRatio } = { ...ANOMALY_DEFAULTS, ...options };

  if (!Number.isFinite(eventCount) || eventCount <= 0) return { flagged: false };
  if (eventCount < minEvents) return { flagged: false };

  const limit = Math.max(0, Number(trackedCount) || 0) * maxRatio;
  if (eventCount <= limit) return { flagged: false };

  const share = trackedCount > 0 ? Math.round((eventCount / trackedCount) * 100) : 100;
  return {
    flagged: true,
    reason:
      `${eventCount} events against ${trackedCount} tracked items (${share}% in one run, ` +
      `over the ${Math.round(maxRatio * 100)}% limit). Held: this looks like a feed change, ` +
      `not a roadmap change. Snapshot left untouched — inspect, then re-run with --force to accept.`,
  };
}
