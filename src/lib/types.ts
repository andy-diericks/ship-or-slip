// The shapes the pipeline writes to the data branch. Kept in one place so a
// change to the pipeline's output surfaces here as a type error.

export type Source = 'm365' | 'azure';

export type EventType =
  | 'slipped'
  | 'pulled_in'
  | 'shipped'
  | 'cancelled'
  | 'status_changed'
  | 'dropped'
  | 'added'
  | 'retirement_announced'
  | 'retirement_moved'
  | 'date_added'
  | 'preview_slipped'
  | 'preview_pulled_in'
  | 'preview_set'
  | 'renamed'
  | 'scope_reduced'
  | 'scope_expanded';

/** Tag lists whose membership is tracked for scope changes. */
export type ScopeDimension = 'clouds' | 'platforms' | 'phases';

export interface ChangeEvent {
  ts: string;
  type: EventType;
  id: string;
  source: Source;
  title: string;
  link: string;
  products: string[];
  from: string | null;
  to: string | null;
  fromRaw: string | null;
  toRaw: string | null;
  months: number | null;
  days: number | null;
  /** Present on scope_reduced / scope_expanded: which tag list changed. */
  dimension?: ScopeDimension;
}

export interface TimelinePoint {
  ts: string;
  type: EventType;
  from: string | null;
  to: string | null;
}

export interface Timeline {
  title: string;
  link: string;
  source: Source;
  products: string[];
  points: TimelinePoint[];
}

export interface SourceMeta {
  count: number;
  fetched: string | null;
  ok: boolean;
  windowed?: boolean;
  seeded?: boolean;
}

export interface DataIndex {
  generated: string;
  recentDays: number;
  months: string[];
  sources: Record<string, SourceMeta>;
  totals: { recent: number; recentByType: Partial<Record<EventType, number>> };
  warnings: string[];
}

export const SOURCE_LABELS: Record<Source, string> = {
  m365: 'Microsoft 365',
  azure: 'Azure',
};

/**
 * How each event type presents itself. `tone` maps to a colour token; `weight`
 * orders the hero tiles so the interesting events lead.
 */
export const EVENT_META: Record<
  EventType,
  { label: string; tone: 'slip' | 'pull' | 'ship' | 'drop' | 'add' | 'retire'; weight: number }
> = {
  slipped: { label: 'Slipped', tone: 'slip', weight: 0 },
  dropped: { label: 'Dropped', tone: 'drop', weight: 1 },
  cancelled: { label: 'Cancelled', tone: 'drop', weight: 2 },
  retirement_moved: { label: 'Retirement moved', tone: 'retire', weight: 3 },
  retirement_announced: { label: 'Retirement announced', tone: 'retire', weight: 4 },
  // The preview date moves before the GA date does — a slip here is the early
  // warning, so it ranks just below the real thing rather than with the noise.
  preview_slipped: { label: 'Preview slipped', tone: 'slip', weight: 5 },
  // A scope cut is a promise shrinking without any date moving — the quietest
  // bad news in the feed, so it ranks with the slips rather than the noise.
  scope_reduced: { label: 'Scope cut', tone: 'slip', weight: 6 },
  renamed: { label: 'Renamed', tone: 'drop', weight: 7 },
  pulled_in: { label: 'Pulled in', tone: 'pull', weight: 8 },
  preview_pulled_in: { label: 'Preview pulled in', tone: 'pull', weight: 9 },
  scope_expanded: { label: 'Scope widened', tone: 'pull', weight: 10 },
  shipped: { label: 'Shipped', tone: 'ship', weight: 11 },
  added: { label: 'Added', tone: 'add', weight: 12 },
  date_added: { label: 'Date set', tone: 'add', weight: 13 },
  preview_set: { label: 'Preview dated', tone: 'add', weight: 14 },
  status_changed: { label: 'Status changed', tone: 'drop', weight: 15 },
};
