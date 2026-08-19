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
  /** Microsoft's own "Updated <date>: …" explanation, when they gave one. */
  note?: UpdateNote | null;
  /** Where the feature stood when this happened. */
  context?: EventContext | null;
}

/**
 * The item's stage at the moment of an event.
 *
 * Captured on the event rather than looked up, because the dashboard never
 * loads the full snapshot — and because the stage at the time is what matters,
 * not the stage today.
 */
export interface EventContext {
  /** Microsoft's "Rollout start" date, `YYYY-MM`. */
  ga: string | null;
  gaRaw: string | null;
  /** Microsoft's "Preview available" date, `YYYY-MM`. */
  preview: string | null;
  previewRaw: string | null;
  phases: string[] | null;
  status: string | null;
}

/** Microsoft's own explanation of a change, quoted verbatim. */
export interface UpdateNote {
  /** `YYYY-MM-DD`, when Microsoft says they changed it. */
  date: string | null;
  /** Microsoft's own rendering of that date, typos and all. */
  dateRaw: string;
  text: string;
}

export interface TimelinePoint {
  ts: string;
  type: EventType;
  from: string | null;
  to: string | null;
  note?: UpdateNote | null;
  context?: EventContext | null;
}

export interface Timeline {
  title: string;
  link: string;
  source: Source;
  products: string[];
  points: TimelinePoint[];
  /** The item's state *now*, refreshed every run — not history. */
  note?: UpdateNote | null;
  status?: string | null;
  ga?: string | null;
  preview?: string | null;
  phases?: string[] | null;
}

export interface SourceMeta {
  count: number;
  fetched: string | null;
  ok: boolean;
  windowed?: boolean;
  seeded?: boolean;
  /** Held by the anomaly guard — snapshot deliberately left untouched. */
  held?: boolean;
  /** What this source currently tracks; a change re-seeds it (ADR 0003). */
  scope?: string;
  forced?: boolean;
}

/** One item whose promised month passed without it arriving. */
export interface OverdueItem {
  id: string;
  title: string;
  source: Source;
  products: string[];
  due: string;
  dueRaw: string | null;
  status: string | null;
  monthsLate: number;
  note: UpdateNote | null;
  clouds?: string[] | null;
  platforms?: string[] | null;
}

export interface OverdueSummary {
  count: number;
  tracked: number;
  share: number;
  worstMonthsLate: number;
  stillInDevelopment: number;
  byStatus: Record<string, number>;
}

export interface OverdueRegister {
  generated: string;
  month: string;
  summary: OverdueSummary;
  items: OverdueItem[];
}

/** An item whose own roadmap record disagrees with itself. */
export interface Contradiction {
  id: string;
  title: string;
  source: Source;
  products: string[];
  kind: 'launched_unshipped' | 'rolled_back' | 'launched_future';
  claim: string;
  evidence: string;
  note: UpdateNote | null;
  clouds?: string[] | null;
  platforms?: string[] | null;
}

export const CONTRADICTION_LABELS: Record<Contradiction['kind'], string> = {
  launched_unshipped: 'Marked launched, but not shipped',
  rolled_back: 'Rolled back after release',
  launched_future: 'Marked launched before its own rollout date',
};

export interface ContradictionSummary {
  count: number;
  byKind: Record<string, number>;
}

export interface ContradictionRegister {
  generated: string;
  month: string;
  summary: ContradictionSummary;
  items: Contradiction[];
}

/** One pipeline run, as recorded in `runs.json`. */
export interface RunRecord {
  ts: string;
  sources: Record<string, { count: number; ok: boolean; held?: boolean; seeded?: boolean }>;
  events: number;
  byType: Record<string, number>;
  warnings: string[];
  /**
   * Register counts at this run. The registers are derived and overwritten
   * every run, so this is the only place their history survives.
   */
  registers?: {
    overdue?: number | null;
    stillInDevelopment?: number | null;
    contradictions?: number | null;
  };
}

export interface RunSummary {
  total: number;
  missedWindows: number;
  medianGapHours: number | null;
  lastRun: string | null;
  hoursSinceLastRun?: number | null;
  heldRuns: number;
  warningRuns: number;
}

export interface DataIndex {
  generated: string;
  recentDays: number;
  months: string[];
  sources: Record<string, SourceMeta>;
  totals: { recent: number; recentByType: Partial<Record<EventType, number>> };
  overdue?: OverdueSummary | null;
  contradictions?: ContradictionSummary | null;
  runs?: RunSummary | null;
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

// ---------------------------------------------------------------------------
// The contract and documentation watch (ADR 0004).
//
// A second data domain, written by `scripts/contracts.mjs` and deliberately
// kept out of the roadmap event stream: these have no rollout month, no product
// and no slip in months, and folding them into `ChangeEvent` would produce
// either a shapeless union or a feed nobody can read.

export type ContractChangeType =
  | 'required_added'
  | 'required_removed'
  | 'property_added'
  | 'property_removed'
  | 'enum_added'
  | 'enum_removed'
  | 'operation_added'
  | 'operation_removed'
  | 'schema_added'
  | 'schema_removed'
  | 'version_added';

/** Who a change breaks: the caller sending requests, or the consumer reading responses. */
export type BreakingFor = 'caller' | 'consumer' | null;

export interface ContractChange {
  ts: string;
  version: string;
  channel: 'preview' | 'stable';
  type: ContractChangeType;
  target: string;
  breaking: BreakingFor;
  field?: string;
  value?: string;
}

export interface ContractVersion {
  version: string;
  channel: 'preview' | 'stable';
  file: string;
  operations: number;
  schemas: number;
}

/** One tracked documentation page, as it stands now. */
export interface DocState {
  path: string;
  title: string | null;
  /** Microsoft's own freshness claim from the front matter, `YYYY-MM-DD`. */
  msDate: string | null;
  hash: string;
  bytes: number;
  /** Size after includes are resolved — far larger than `bytes` for stub pages. */
  resolvedBytes: number;
  includes: string[];
  missingIncludes: string[];
}

export interface DocChange {
  ts: string;
  type: 'doc_updated' | 'doc_changed_silently' | 'doc_freshness_only' | 'doc_added' | 'doc_removed';
  path: string;
  title: string | null;
  from?: string | null;
  to?: string | null;
}

/**
 * A contract change paired with the documentation that should describe it.
 *
 * `docs[].mentions` is the evidence and the whole point: the finding shows
 * which pages were searched and whether each one mentions the symbol, so the
 * claim can be checked rather than taken.
 */
export interface DivergenceFinding {
  kind: 'undocumented' | 'documented';
  surface: string;
  surfaceLabel: string;
  version: string | null;
  change: ContractChange;
  symbol: string;
  docs: { path: string; title: string | null; msDate: string | null; mentions: boolean }[];
}

export interface ContractRegister {
  generated: string;
  summary: {
    versions: number;
    operations: number;
    schemas: number;
    changesThisRun: number;
    breakingThisRun: number;
    undocumented: number;
  };
  versions: ContractVersion[];
  changes: ContractChange[];
  findings: DivergenceFinding[];
  warnings: string[];
}

export interface DocRegister {
  generated: string;
  summary: { tracked: number; changesThisRun: number; freshnessOnly: number };
  docs: DocState[];
  changes: DocChange[];
  warnings: string[];
}

export const CONTRACT_CHANGE_LABELS: Record<ContractChangeType, string> = {
  required_added: 'Became required',
  required_removed: 'No longer required',
  property_added: 'Property added',
  property_removed: 'Property removed',
  enum_added: 'Value added',
  enum_removed: 'Value removed',
  operation_added: 'Operation added',
  operation_removed: 'Operation removed',
  schema_added: 'Schema added',
  schema_removed: 'Schema removed',
  version_added: 'New api-version',
};

export const DOC_CHANGE_LABELS: Record<DocChange['type'], string> = {
  doc_updated: 'Updated',
  doc_changed_silently: 'Changed without updating its own date',
  doc_freshness_only: 'Date bumped, content identical',
  doc_added: 'Added',
  doc_removed: 'Removed',
};
