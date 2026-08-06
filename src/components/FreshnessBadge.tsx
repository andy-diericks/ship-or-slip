import { useEffect, useState } from 'react';
import { formatAge } from '../lib/format';

/** The pipeline runs every 6 hours; see ADR 0003. */
const RUN_INTERVAL_HOURS = 6;
/** One missed run is a wobble, two is a fault. */
const WARN_AFTER_HOURS = RUN_INTERVAL_HOURS * 1.5;
const BAD_AFTER_HOURS = RUN_INTERVAL_HOURS * 3;

export type Freshness = 'ok' | 'warn' | 'bad';

/**
 * Grade the data's age against the schedule rather than against the clock.
 * A warning the reader learns to ignore is worse than no warning at all, so
 * only a genuinely missed run turns this amber.
 */
export function gradeFreshness(
  generated: string | null | undefined,
  hasWarnings: boolean,
  now: Date = new Date(),
): Freshness {
  if (!generated) return 'bad';
  const then = Date.parse(generated);
  if (Number.isNaN(then)) return 'bad';
  const hours = (now.getTime() - then) / 3_600_000;
  if (hours > BAD_AFTER_HOURS) return 'bad';
  if (hours > WARN_AFTER_HOURS || hasWarnings) return 'warn';
  return 'ok';
}

interface Props {
  generated: string | null;
  warnings: string[];
}

export function FreshnessBadge({ generated, warnings }: Props) {
  // The page can sit open on a phone for days, so the age recomputes rather
  // than freezing at whatever it was when the tab was opened.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const grade = gradeFreshness(generated, warnings.length > 0, now);
  const label =
    grade === 'bad' && !generated ? 'no data yet' : `updated ${formatAge(generated, now)}`;

  return (
    <span
      className={`freshness freshness--${grade}`}
      title={generated ? new Date(generated).toUTCString() : 'The pipeline has not run yet'}
    >
      <span className="freshness__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
