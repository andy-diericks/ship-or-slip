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
  | 'renamed';

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
  renamed: { label: 'Renamed', tone: 'drop', weight: 6 },
  pulled_in: { label: 'Pulled in', tone: 'pull', weight: 7 },
  preview_pulled_in: { label: 'Preview pulled in', tone: 'pull', weight: 8 },
  shipped: { label: 'Shipped', tone: 'ship', weight: 9 },
  added: { label: 'Added', tone: 'add', weight: 10 },
  date_added: { label: 'Date set', tone: 'add', weight: 11 },
  preview_set: { label: 'Preview dated', tone: 'add', weight: 12 },
  status_changed: { label: 'Status changed', tone: 'drop', weight: 13 },
};
