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

## 2026-08-08 — protecting the archive (I2)

Three layers, weakest threat last.

- **Layer 1 — prevention.** A repository ruleset `protect-data` on
  `refs/heads/data`: `deletion` + `non_fast_forward`, no bypass actors.
  **Verified by attempting both**: force-push rejected with `GH013`, deletion
  rejected with 403, branch unmoved. A normal fast-forward append still
  succeeds, which is the bot's path. Deliberately *not* enabling `update` or
  `pull_request` rules — either would silently kill every refresh.

- **Layer 2 — weekly bundles.** `fetch.yml` now bundles the `data` branch and
  attaches it to a GitHub Release tagged `backup-YYYY-MM-DD`, keeping twelve.
  Bundles rather than tarballs, so a restore returns the full history and its
  provenance rather than a flat snapshot.

- **Layer 3 — `docs/recovery.md`.** The restore procedure, with commands that
  have been run rather than guessed, and a restore path that does *not* start
  by disabling the ruleset.

- **Design notes:**
  - The schedule is derived from the releases that actually exist, not a marker
    file, so the cadence cannot drift from reality. Pure logic in
    `lib/backup.mjs`, 18 tests.
  - It rides on `fetch.yml` rather than its own `schedule:`, because GitHub
    cron does not fire on this repository at all. Reusing the trigger we know
    works beats adding a second cron-job.org job.
  - Pruning only happens on a run that also takes a backup, so a quiet week
    never reduces the number of restore points.
  - Retention refuses to touch any release not tagged `backup-`. Deleting a
    real release because retention ran would be unforgivable; there is a test
    named for exactly that.

- **Two things proven by dry run rather than assumed:**
  - **`git bundle create <file> data` omits HEAD** and the result cannot be
    plain-cloned. Found when my first bundle failed to restore. The correct
    form is `... data HEAD`.
  - **The CI data checkout is shallow.** A bundle taken from it held *1*
    commit; after `git fetch --unshallow`, 6. Without that step the "backup"
    would have been a snapshot — precisely what bundles were chosen to avoid.

- **The workflow restores every bundle before publishing it** — clones it,
  parses `index.json`, checks the expected files exist. A backup that has not
  been restored is a belief, and I had already been caught out by one.

- **Verified by full recovery drill**: downloaded the published bundle from the
  Releases page and restored it per `docs/recovery.md`. 7 commits, 23 events,
  1,819 items, the 7-month Places slip and both cancellations all intact.
  109 KB for the whole archive and its history.

## 2026-08-08 — Atom feed (C1)

- **Did:** `scripts/lib/feed.mjs` builds an Atom document; the pipeline writes
  `feed.xml` to the data branch on every run. Linked from `index.html` via
  `<link rel="alternate">` and from the dashboard footer. 27 new tests.

- **Where it lives, and why.** On the `data` branch, not in the build. A feed
  regenerated only when the *code* changes would be days stale, and rebuilding
  the site on every data refresh is precisely the coupling ADR 0003 forbids.
  The price is that raw.githubusercontent serves it as `text/plain`; readers
  find it via the alternate link and parse by content, which works. jsDelivr is
  the escape hatch if a strict reader ever objects — noted in the ADR so nobody
  "fixes" this by moving the feed into the build.

- **Atom over RSS 2.0:** unambiguous dates, and entry identity is a
  first-class field. That last part matters here — the same feature slips
  repeatedly, and each occurrence must be a distinct entry or readers either
  re-notify forever or silently swallow the news. The id carries item, type
  and timestamp.

- **Only notable events.** Slips, cancellations, drops, scope cuts,
  retirements. `added` and `shipped` are excluded: one ordinary run produced
  thirteen `added` events, and a feed that fires on routine announcements gets
  unsubscribed from. Verified on the real archive: 23 events → 9 entries.

- **Validated by parsing, not eyeballing** — `xml.etree` over the generated
  file, checking the root element, the `rel=self` link, entry count and id
  uniqueness. That is also how I caught **"Slipped +1 months"**: the XML was
  valid, the grammar was not. Fixed with a singular/plural helper and a test
  named for it.

## 2026-08-08 — links, ids, and a challenge that held up

- **The challenge:** the human asked how we could claim Purview feature 558683
  was cancelled, since Microsoft's roadmap card shows "PREVIEW AVAILABLE April
  2026 / ROLLOUT START July 2026". Checked the API rather than defending the
  claim: `status` is literally `"Cancelled"`, and the description reads *"We
  have decided not to move forward with this change."* We were right — and the
  card is a good demonstration of the product's point, since it leads with two
  dates and buries the cancellation mid-paragraph.

- **A real bug in the same message:** our roadmap links used
  `?featureid=<id>`, which loads the roadmap without selecting the feature.
  The working parameter is `?searchterms=<id>`. Both return HTTP 200 because
  the page is client-rendered, so curl could not distinguish them — the human's
  hand test was the evidence, and the test comment says so.

- **Fixed by deriving rather than storing.** Every archived event carries a
  `link` captured when it was recorded, so fixing only `normalize.mjs` would
  have left all existing history broken. `scripts/lib/links.mjs` derives the
  URL from the namespaced id, and the app and feed both call it — repairing
  the past as well as the future.

- **One definition, not two.** The app imports `links.mjs` directly from
  `scripts/lib/` rather than keeping a TypeScript copy. This is exactly why
  ADR 0001 chose a single npm project: the predecessor hand-mirrored its
  equivalent and the copies drifted.

- **Also added:** Microsoft's own id, shown on the item page ("Roadmap ID
  558683" / "Update ID" for Azure), in each feed row as `#558683`, and in the
  Atom summary. It is the key someone pastes into Microsoft's search, which
  makes our pages quotable.

- **Four tests failed after the change** — all of them asserting the old,
  wrong behaviour. Updated to the new contract rather than worked around; the
  ItemPage test now deliberately holds a stale stored link to prove derivation
  overrides it.

## 2026-08-08 — Microsoft's own words, and Azure coverage (A2)

- **Quoted explanations.** Microsoft appends "Updated August 7, 2026: We have
  decided not to move forward with this change." to descriptions when they
  change their mind. `notes.mjs` extracts the last such note; it rides on the
  item and onto every event. The dashboard renders it as an attributed
  blockquote — *"…" — Microsoft, 7 August 2026*. This is the strongest thing
  the site shows: everywhere else the page reports what *we* concluded from two
  snapshots; here Microsoft says it themselves.
  - Only 19 of 1,819 items carry one, averaging 106 characters, so the storage
    cost is nil. Whole descriptions would have tripled the snapshot.
  - Microsoft's own typo, "Augut 7, 2026", still resolves — month names match
    on their first three letters. `dateRaw` keeps their rendering; quoting a
    source means not silently tidying it.
  - Some are quietly damning: features marked *Launched* whose note reads
    "This feature is still in development."

- **A2.** Azure now tracks all 200 RSS items rather than the 10 retirements —
  a 20× coverage increase from data already being fetched and discarded.
  Lifecycle categories map onto the shared status vocabulary, so an Azure
  preview reaching GA emits `shipped` exactly as an M365 feature does.

- **The migration bug, and how it was caught.** Widening the scope produced 190
  `added` events on the first run against the live store — and **the anomaly
  guard held it**, exactly as designed. That was the guard earning its keep on
  a change I made, not a hypothetical Microsoft one.
  - The fix is a `scope` marker per source in `index.json`; when it changes the
    next run re-seeds silently.
  - My first attempt still failed, because the *existing* store has no marker
    at all. Treating "absent" as unchanged floods; treating it as changed would
    silently discard a run of real m365 events. So each source now declares
    `legacyScope` — what an unmarked store was built under — consulted exactly
    once. Verified against the live data branch: azure re-seeded 10 → 200 with
    zero events and zero warnings, m365 diffed normally, and the second run
    diffed normally too.

- **An HTML validity bug I introduced and then fixed properly.** The quoted
  note is a `<blockquote>`, and the event row was a `<button>` — which may only
  contain phrasing content. That also exposed a pre-existing fault: the row's
  `<h3>` was already invalid inside that button, and a screen reader lost the
  heading structure. The row is now a `<div>` card whose title contains the
  button. Tempting to leave, since it "worked".

## 2026-08-08 — how far it actually got

- **The observation** (from the human, looking at Microsoft's card): the
  cancelled Purview feature was not abandoned on paper. It had "Preview
  available April 2026" and phases "General Availability, Preview". A feature
  killed four months after a public preview is a different story from one
  dropped before anyone saw it, and our bare "Cancelled" badge hid that.

- **Did:** every event now embeds a `context` — preview date, rollout date,
  release phases, status, as they stood at that moment. Embedded rather than
  looked up, because the dashboard never loads the full snapshot and because
  the stage *at the time* is what matters, not the stage today. `previewRaw`
  is now captured too.

- **`src/lib/lifecycle.ts`** turns that into a sentence, with a `lead` only
  where it changes the meaning of the event: cancellations and drops get
  "Preview had been available since April 2026" or "Preview was scheduled for
  November 2026"; a slip gets no editorialising.

- **Restating, not paraphrasing.** The UI uses Microsoft's own labels —
  "Preview available", "Rollout start" — rather than our own vocabulary.
  Rewording a source into different terminology is how small
  misrepresentations start.

- **It immediately separated the two cancellations we had**: Purview had a
  preview from April; the Teams appointment-booking feature never had one at
  all. Same badge, genuinely different events.

- **Caught in review of my own output:** the first version rendered "Preview
  had been available since April 2026 · Preview available April 2026" — the
  lead and the facts saying the same thing. Fixed by dropping the bare preview
  fact when the lead already carries it. Reading the rendered string, not just
  the passing test, is what surfaced it.

- **Nice confirmation:** with data 14 hours old the freshness badge went amber
  on the live site, exactly as designed — the staleness was visible on the
  page before it was visible in the Actions tab.
