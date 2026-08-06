import type { ChangeEvent } from './types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Render a tracked date for display. The pipeline stores M365 dates as
 * `YYYY-MM` and Azure retirement dates as `YYYY-MM-DD`; both arrive here.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!year || !month || month < 1 || month > 12) return value;
  const name = MONTH_NAMES[month - 1];
  const day = parts[2] ? Number(parts[2]) : null;
  return day ? `${day} ${name} ${year}` : `${name} ${year}`;
}

/**
 * The headline number on a slip: how far the date moved, in whichever unit the
 * source measures. Returns null when the event carries no magnitude (a status
 * change has no distance).
 */
export function formatMagnitude(event: Pick<ChangeEvent, 'months' | 'days'>): string | null {
  if (event.months != null && event.months !== 0) {
    const n = Math.abs(event.months);
    return `${event.months > 0 ? '+' : '−'}${n} ${n === 1 ? 'month' : 'months'}`;
  }
  if (event.days != null && event.days !== 0) {
    const n = Math.abs(event.days);
    if (n >= 60) {
      const m = Math.round(n / 30.44);
      return `${event.days > 0 ? '+' : '−'}${m} ${m === 1 ? 'month' : 'months'}`;
    }
    return `${event.days > 0 ? '+' : '−'}${n} ${n === 1 ? 'day' : 'days'}`;
  }
  return null;
}

/** Absolute size of a move, in days, for sorting "biggest slips" first. */
export function magnitudeDays(event: Pick<ChangeEvent, 'months' | 'days'>): number {
  if (event.days != null) return Math.abs(event.days);
  if (event.months != null) return Math.abs(event.months) * 30;
  return 0;
}

/** "3 hours ago" / "2 days ago" — relative to now, for the freshness badge. */
export function formatAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'unknown';
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** Short day label for grouping the feed, e.g. "6 Aug 2026". */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]?.slice(0, 3)} ${d.getUTCFullYear()}`;
}
