// Loading the data branch.
//
// The pipeline commits to an orphan `data` branch rather than to `main`, so a
// data refresh never rebuilds or redeploys the site (ADR 0003). The page reads
// that branch directly over raw.githubusercontent.com, which serves permissive
// CORS headers and caches for a few minutes.

import type {
  ChangeEvent, DataIndex, Timeline, OverdueRegister, ContradictionRegister, RunRecord,
} from './types';

const DEFAULT_BASE =
  'https://raw.githubusercontent.com/andy-diericks/ship-or-slip/data';

/** Overridable so `npm run dev` can point at a local pipeline run. */
export const DATA_BASE: string =
  (import.meta.env.VITE_DATA_BASE as string | undefined)?.replace(/\/$/, '') ?? DEFAULT_BASE;

/**
 * The Atom feed, written by the pipeline alongside the data.
 *
 * Always the real published feed, never the local override — a dev server
 * pointed at a scratch directory should still link somewhere subscribable.
 */
export const FEED_URL = `${DEFAULT_BASE}/feed.xml`;

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${DATA_BASE}/${path}`, { signal });
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
  return (await response.json()) as T;
}

export const loadIndex = (signal?: AbortSignal) => getJson<DataIndex>('index.json', signal);

export const loadRecent = (signal?: AbortSignal) => getJson<ChangeEvent[]>('recent.json', signal);

export const loadTimelines = (signal?: AbortSignal) =>
  getJson<Record<string, Timeline>>('timelines.json', signal);

/**
 * The overdue register — fetched only when that page is opened.
 *
 * It is the largest file the site serves and most visits never look at it, so
 * loading it with the dashboard would tax every reader for a minority's view.
 */
export const loadOverdue = (signal?: AbortSignal) =>
  getJson<OverdueRegister>('overdue.json', signal);

export const loadContradictions = (signal?: AbortSignal) =>
  getJson<ContradictionRegister>('contradictions.json', signal);

/**
 * The run log. Absent on a store written before run recording existed, which
 * the health page reports as "no runs yet" rather than as an error.
 */
export const loadRuns = (signal?: AbortSignal) =>
  getJson<RunRecord[]>('runs.json', signal).catch(() => [] as RunRecord[]);

/**
 * Load the dashboard's data in one go.
 *
 * Timelines are optional: they only exist once something has actually changed,
 * and a first-run repository legitimately has no such file yet. A missing
 * timeline file must not blank the whole page.
 */
export async function loadDashboard(signal?: AbortSignal): Promise<{
  index: DataIndex;
  events: ChangeEvent[];
  timelines: Record<string, Timeline>;
}> {
  const [index, events, timelines] = await Promise.all([
    loadIndex(signal),
    loadRecent(signal).catch(() => [] as ChangeEvent[]),
    loadTimelines(signal).catch(() => ({}) as Record<string, Timeline>),
  ]);
  return { index, events, timelines };
}
