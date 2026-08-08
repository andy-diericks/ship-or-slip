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

## 2026-08-07 — GitHub cron removed, external dispatcher adopted

- **Did:** Deleted `schedule:` from `fetch.yml`, leaving `workflow_dispatch:`
  as the only trigger, and documented the cron-job.org setup in
  `docs/setup.md` (fine-grained token scoped to this repo with Actions:
  read/write, POST to the workflow's `dispatches` endpoint, four times a day
  at `:37`). Rewrote the cadence section of ADR 0003 to record the decision.

- **Why:** GitHub's scheduler fired zero times across two windows and two
  different cron expressions, one of them deliberately off the hour. GitHub
  guarantees nothing about `schedule:`, and `finance-portfolio` reached the
  same conclusion independently before switching to the same dispatcher.

- **The reasoning that settled it:** for this project a missed window is not a
  delayed run, it is a permanent hole in the record — Microsoft will not serve
  the old value again. Every other decision here protects the integrity of
  that record, so leaving the clock to chance was inconsistent with the rest
  of the design.

- **Still needs a human:** the token and the cron-job.org job. Until a run
  appears in the Actions tab that nobody triggered by hand, the pipeline is
  not autonomous — every run so far has been a manual dispatch or a push.

- **Safety net, by design:** if the dispatcher stops, no run happens,
  `index.json` stops advancing, and the freshness badge goes amber then red on
  the live site. Staleness surfaces to a reader on the page rather than only
  in the Actions tab. This was already observed working when data went 14
  hours stale.

## 2026-08-08 — the first real events, and the thesis holds

- **Dispatcher live.** Token and cron-job.org job created by the human. The
  pipeline ran and, for the first time, the diff found actual changes:
  **23 events** — 13 added, 7 slipped, 2 cancelled, 1 status change.

- **What it caught**, none of which exists anywhere else now that Microsoft
  has overwritten the old values:
  - *Microsoft Places support for GCCH and DoD*: March CY2026 → October CY2026
    (**+7 months**)
  - *Edge Enhanced Security Mode Plus*: July → December CY2026 (**+5 months**)
  - *Teams: book appointments from chat*: **cancelled while already
    "Rolling out"** — the most interesting shape of event the differ can
    produce, and one no roadmap page will ever admit to
  - Three Copilot features each slipping August → September in the same run

- **Documentation gotcha found the hard way:** cron-job.org's "Requires HTTP
  authentication" toggle is Basic auth, which GitHub's REST API no longer
  accepts. The token belongs in an `Authorization: Bearer` header. Written
  into `docs/setup.md` along with a table of what each response code means.

- **A verification trap, also documented:** a dispatch authenticated with a PAT
  records the *token owner* as `triggering_actor`, identically to a manual
  click. So that field cannot prove a run was autonomous — only timing can.

- **Still worth confirming:** a run landing squarely on a scheduled slot with
  nobody at a keyboard. The runs so far cluster around manual testing.

- **Cron config verified.** `37 1,7,13,19 * * *` in Europe/Brussels, failure
  notification after 1 failure, alert on auto-disable. My earlier suspicion of
  a UTC/Brussels mismatch was wrong — the 09:38 Brussels run was another manual
  test, not the cron firing late. First real window: 13:37 Brussels.

## 2026-08-08 — anomaly guard (E1), product vision

- **Did:** Built `scripts/lib/anomaly.mjs` and wired it into `fetch.mjs`. A run
  is held when it produces ≥50 events **and** they exceed 25% of the previous
  snapshot. Held sources write nothing — no snapshot, no events — keep their
  baseline for the next diff, record a dashboard warning, and the process exits
  non-zero. `--force` accepts a held run. 16 new tests; 182 total.

- **Why both thresholds:** ratio alone punishes small sources (40 events against
  10 tracked items is 400% but harmless), count alone punishes large ones.

- **Verified end to end**, not just in unit tests: shifted every id in a seeded
  snapshot to imitate Microsoft renaming the id field, ran the pipeline, and
  confirmed it held 210 events, wrote nothing, left the snapshot untouched,
  recorded the warning, and exited 1 — while the healthy Azure source still
  processed normally. Then confirmed `--force` accepts the same run and marks it
  `forced: true` in the index.

- **Why exit non-zero here but not for a dead feed:** a dead feed is transient
  and self-healing, so it stays a warning. A feed that changed shape needs a
  human, and a red run plus GitHub's mail is how that human is summoned.

- **Also:** added `docs/product-vision.md` (backlog A–F with sizes, a suggested
  order, and an explicit "not doing" list), and recorded in CLAUDE.md that this
  repo commits straight to `main` — the owner does not want PRs here. The old
  "never push directly to main" rule contradicted how the project actually runs.

- **Noticed for later:** all of epic B (slip statistics, league tables) is gated
  on months of accumulated history. Building it now would produce a chart that
  lies confidently. Left explicitly in the backlog with that warning attached.

## 2026-08-08 — preview dates and renames (G1, G3)

- **The observation behind both:** `normalize.mjs` has been storing `preview`,
  `products`, `phases` and `clouds` on every item since day one, and `diff.mjs`
  compared only `date` and `status`. Two useful signals were being fetched and
  thrown away on every run.

- **G1 — preview dates.** `publicPreviewDate` is present on 422 of 1,819 items
  and moves before the GA date does, so a preview slip is an early warning that
  GA will follow. New types `preview_slipped`, `preview_pulled_in`,
  `preview_set`, using the same vocabulary as the GA date. A withdrawn preview
  date stays unreported, matching the existing rule for withdrawn GA dates.

- **G3 — renames.** A title rewritten from "for Web, Desktop and Mobile" to
  "for Web" is a scope cut that touches no date. Both versions are recorded.
  Whitespace-only differences are ignored — Microsoft reflows copy constantly
  and that noise would bury the real ones.

- **UI:** a rename shows the new title as the heading and *was "old title"*
  beneath, rather than two long titles either side of an arrow. Preview events
  rank just below their GA equivalents in the tile order.

- **Verified against live data**, not just fixtures: cloned the real `data`
  branch, rewound three genuine preview dates and one real title, and added a
  whitespace-only variant of another item's own title. Result: 3
  `preview_slipped`, 1 `renamed`, whitespace correctly ignored.

- **A check I got wrong first time**, worth recording: my initial verification
  replaced an item's title wholesale rather than adding whitespace to its own
  title, so it reported 2 renames and I briefly thought the normalisation had
  failed. The code was right; the check was wrong. Re-run properly before
  concluding anything from a hand-built fixture.

- **Backlog extended** with epics G–K: scope-cut detection (G2, the most
  interesting unbuilt idea), correlation work (conference cohorts, fiscal-year
  bunching, a Copilot index), provenance, distribution and a second pass on
  experience. I2 — backing up the `data` branch — is now the top priority: the
  archive has become genuinely valuable and exists in exactly one place.

## 2026-08-08 — scope-cut detection (G2)

- **Did:** `clouds`, `platforms` and `phases` are now diffed, emitting
  `scope_reduced` and `scope_expanded` with the dimension and what was
  lost or gained. `platforms` was not being captured at all and had to be added
  to `normalize.mjs` first. `products` is excluded on purpose — reassignment is
  G4, not a cut. 16 new tests; 213 total.

- **Two rules that make it safe, both learned by thinking about how it would
  fail rather than by it failing:**
  - **Sets, not arrays.** These feeds reshuffle tag order between responses.
    Array comparison would have reported a reshuffle as a scope change across
    hundreds of items in one run.
  - **Absent ≠ empty.** A dimension missing from the previous snapshot is
    unknown. Without that rule, the first run after adding `platforms` would
    have reported all 1,819 items as gaining scope — and the anomaly guard
    would have caught it, which is reassuring, but a silent migration is
    better than a held run.

- **Verified against the live `data` branch**, which was written before
  `platforms` existed: a dry run produced **zero** events, confirming the
  migration is silent. Then widened `clouds` on three real items and reversed
  the order on another: exactly one `scope_reduced`, no reorder noise.

- **A result I nearly misread:** three widened items produced only one event.
  Rather than assume the code was wrong, I checked the source data — two of the
  three already carried both `GCC High` and `DoD`, so adding them was a no-op.
  One event was the correct answer. Second time this session that a surprising
  number turned out to be a flawed hand-built fixture rather than a bug; worth
  the thirty seconds to check before changing code.

- **Interaction worth knowing:** if Microsoft ever renames a tag value across
  the catalogue (say "GCC High" → "GCC-High"), that produces a paired
  `scope_reduced` + `scope_expanded` on every affected item — thousands of
  events, which the anomaly guard holds. The two features cover each other.

- **Nice confirmation:** with data 14 hours old the freshness badge went amber
  on the live site, exactly as designed — the staleness was visible on the
  page before it was visible in the Actions tab.
