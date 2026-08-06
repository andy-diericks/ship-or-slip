# Journal

Append-only. Newest at the bottom. Read the tail before starting work.

## 2026-08-06 — initial build

- **Did:** Built the project from scratch. Pipeline (`scripts/`): fetch the
  M365 roadmap JSON API and the Azure updates RSS, normalize both to a common
  `TrackedItem`, diff against the previous snapshot, store events on an orphan
  `data` branch. Dashboard (`src/`): event feed with type badges and slip
  magnitudes, hero tiles that double as filters, URL-encoded facets, per-item
  timeline page, weekly activity chart, freshness badge, light and dark themes.
  166 tests. CI, scheduled fetch and Pages deploy workflows.

- **Verified against live data:** both feeds fetch and parse (1,814 roadmap
  items, 10 Azure retirements in the current window). Rewound a snapshot to
  simulate a day passing and confirmed all seven event types fire with correct
  magnitudes — including a 394-day retirement move and a −6-month pull-in.

- **Decisions worth remembering:**
  - Data on an orphan `data` branch rather than `main`, so refreshes never
    trigger a Pages build and the bot never races a code push. This is the fix
    for the build-ceiling and rebase-retry problems in `finance-portfolio`.
  - One npm project rather than the `app/` + Python split used by
    `azure-pricing-radar` — that split forced a hand-mirrored type definition
    that could drift.
  - The pipeline has zero dependencies. Node 22's `fetch` plus a small RSS
    reader covers it.
  - Windowed feeds never emit `dropped` events, and their snapshots merge
    rather than replace. See ADR 0003.
  - Recharts is lazy-loaded: it was 384 kB of a 542 kB bundle and the chart is
    below the fold. First-paint JS is now 159 kB.

- **Noticed for later:**
  - The Azure RSS window currently holds only 10 retirement notices. The merged
    snapshot accumulates them over time, but early Azure coverage will be thin.
  - `publicRoadmapStatus` is `"Include this month"` for all 1,814 items, so it
    carries no signal today. Worth re-checking — if it ever varies it may mark
    items being pulled from the public roadmap.
  - No scheduled Claude workflows were set up. See the note at the bottom of
    CLAUDE.md for what to fix first if they get added.
