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

## 2026-08-07 — first deploy, and a wrong diagnosis corrected

- **Did:** Pushed to GitHub, seeded the `data` branch, got CI and the fetch
  pipeline green, and published the site at
  https://andy-diericks.github.io/ship-or-slip/.

- **What actually went wrong on day one:** the first push landed during a
  GitHub Actions incident. Both queued runs sat with no runner assigned and
  were eventually cancelled with zero steps executed. The Pages deploy then
  sat in `waiting` because Pages had not yet been set to build from GitHub
  Actions — the environment exists either way, so the job waits rather than
  failing, and `pending_deployments` shows an empty reviewer list that looks
  like an approval gate but is not one.

- **A diagnosis I got wrong, recorded so nobody repeats it:** seeing no
  `push`- or `schedule`-triggered runs for 13 hours, I concluded that workflow
  files pushed with a GitHub App token never activate their triggers, and I
  wrote that into ADR 0003. It is false. A later ordinary push triggered both
  workflows normally. The silence was the incident plus a skipped cron window.
  The ADR has been corrected. Check githubstatus.com before theorising about
  triggers.

- **Still unproven:** no `schedule:` run has fired yet. The cadence was moved
  off the top of the hour (`37 1,7,13,19`) since GitHub's scheduler is busiest
  at `:00`. The next window is the first real test of unattended operation.

- **Nice confirmation:** with data 14 hours old the freshness badge went amber
  on the live site, exactly as designed — the staleness was visible on the
  page before it was visible in the Actions tab.
