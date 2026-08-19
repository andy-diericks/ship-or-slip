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

## 2026-08-08 — the overdue register (L1), and a missing note

- **The note bug.** The item page showed no quote for the Purview
  cancellation. Not a rendering fault: that event was recorded at 07:39, before
  note capture shipped, so the archived point genuinely has none.
  - Fixed *without* rewriting history. Timeline entries now carry the item's
    **current** state — note, status, ga, preview, phases — refreshed on every
    run for *every* entry, not only those with new events. The item page shows
    it under "Microsoft's latest note on this item", clearly separate from the
    timeline of what was true at each change.
  - Backfilling the historical point was the tempting alternative and would
    have been a small lie: it would assert the note existed at the moment of
    the event, which we did not observe.

- **L1, the overdue register.** 578 items whose rollout month has passed
  without shipping or being cancelled — 29% of everything tracked. 347 still
  sit at "In development"; the worst is 28 months past its date. Microsoft
  lists all of them with the same stale dates and no indication of a problem.
  - Chosen over the epic B analytics precisely because it needs **no
    accumulated history**: it is computed from the current snapshot, so it was
    as good on the day it shipped as it will ever be.
  - Written to `overdue.json` and lazy-loaded — 148 KB, and most visits never
    open it. Its route chunk is 3 KB.
  - "Rolling out" is included but never merged with "In development": a
    rollout in flight is a weaker claim than something still in development two
    years on, and conflating them would overstate the case.

- **A false positive caught by reading the output.** The first run reported 579
  with one `unknown` status — an Azure *retirement* whose date had passed. A
  retirement that happened on schedule is a promise **kept**, the exact
  opposite of overdue. Excluded, with a test named for it. Inspecting the
  summary rather than trusting the count is what found it.

- **`docs/product-vision.md` restructured** into one master table of every
  feature, built and unbuilt, ranked by impact then complexity, with status.
  CLAUDE.md now says to reproduce the whole table when asked what can be
  built — listing only what remains hides what exists and invites rebuilding
  it.

- **Nice confirmation:** with data 14 hours old the freshness badge went amber
  on the live site, exactly as designed — the staleness was visible on the
  page before it was visible in the Actions tab.

## 2026-08-08 — contradictions (L2), and a silently dropped field

- **A bug that made a shipped feature invisible.** The overdue banner never
  appeared, and it was not the UI: `writeIndex` destructures an explicit list
  of fields and silently drops anything else. `overdue` was passed in and never
  written. Fixed, with a comment on the function saying so — the same trap is
  waiting for the next field anyone adds. Found by checking the live
  `index.json` keys rather than by re-reading the React.

- **Persistent nav** rather than only a banner. The banner carries a number and
  grabs attention; navigation has to be there whether or not there is anything
  to shout about, and from every page. Both now exist and they are not
  interchangeable.

- **L2, the contradiction register.** 5 items whose own record disagrees with
  itself: 3 marked *Launched* while Microsoft's note says "still in
  development", 1 marked *Launched* with a rollout date two months in the
  future, and 1 admitting a rollback.
  - Deliberately conservative. A false contradiction is far worse than a missed
    one: the claim is that Microsoft contradicted itself, and it has to hold
    every single time or the whole page is dismissible. Every rule fires only
    on Microsoft's own words or their own dates — never on an inference of ours.
  - The UI shows claim and contradiction side by side and asserts nothing
    itself. It only puts two of their fields next to each other, which is the
    only footing this stands on.
  - An item matching several rules appears once, under the most specific.

## 2026-08-09 — health page (E2); A1 blocked

- **E2 shipped.** `#/health` answers *is the pipeline working*, which is a
  different question from *what does it know* — and the one that went
  unanswered for a day when GitHub's scheduler silently fired nothing.
  - Needed a run log first: `runs.json` records every run, including the quiet
    ones. A run that found nothing is precisely the evidence the pipeline is
    alive; omitting it would make a healthy quiet week look like a dead
    dispatcher.
  - The page shows freshness, missed windows, median gap between runs,
    per-source state (ok / failed / held / seeded / scope), the last 40 runs
    with the gap that preceded each, and the archive inventory.
  - **Gap detection is the point.** A gap over 9 hours against a 6-hour cadence
    is flagged in red. That single column would have caught the day-one
    scheduler failure in seconds instead of hours.
  - Verified by seeding a synthetic log containing a 20-hour gap, a failed
    source and a held run, then reading the rendered page — all three showed
    correctly.

- **A1 is blocked, not merely unbuilt.** Recorded here so nobody re-attempts it
  blind:
  - `releaseplans.microsoft.com` returns proxy 403 on CONNECT — the host is
    unreachable from this environment entirely, so the API shape cannot be
    discovered.
  - No `releasecommunications` sibling exists: `powerapps`, `powerbi`,
    `power-platform`, `dynamics` and `windows` all 404. Only `m365` and the
    Azure RSS are served.
  - `playbooks/add-a-source.md` step 1 says to capture a real sample first and
    never to write a parser against documentation, because both current feeds
    differ from their docs. Writing a Power Platform normalizer blind would
    break the project's own rule and ship untested guesswork.
  - Unblocking needs either an egress allowlist entry for
    `releaseplans.microsoft.com`, or a hand-captured API response committed to
    `fixtures/`.
  - Note the M365 feed already carries a little Power Platform incidentally
    (11 Copilot Studio, 2 Power Automate items) — real coverage still needs the
    release planner.

## 2026-08-09 — register rows were dead links

- **The bug:** rows on Overdue and Contradictions reuse the feed's `.event`
  card — including the `cursor: pointer` added when the feed card became a div
  — but carried no click handler at all. They looked interactive and did
  nothing. A card that looks clickable and is not is worse than one that looks
  inert.

- **Why not simply navigate to the item page:** the registers are computed
  from the current snapshot, so most of their rows describe items that have
  never *changed* and therefore have no timeline entry. Clicking would have
  landed the reader on "No history recorded for this item" — trading a dead
  card for a dead end, and losing their place in a 578-row list.

- **Did:** rows now expand in place. A chevron marks the affordance, the
  heading holds a real button with `aria-expanded`/`aria-controls`, and the
  panel shows what is actually known — promised date, how late, current
  status, source, roadmap ID, products, Microsoft's note, and a link to their
  page. The timeline is offered only when one exists; otherwise the panel says
  plainly that nothing has been recorded yet, which is true and more useful
  than a link to an empty page.

- **Shared `RowDetails`** between both registers rather than duplicated, since
  the two pages differ only in their facts.

## 2026-08-12 — register counts recorded (M1), register filters (M3)

- **M1 was the urgent one, and it proved itself immediately.** `overdue.json`
  and `contradictions.json` are *derived* and overwritten on every run, so the
  counts were being destroyed four times a day. The trend — is Microsoft's
  backlog of late features growing or shrinking? — was unrecoverable. Each run
  now records the counts in `runs.json`.
  - Within an hour of shipping it, the count moved **578 → 555** (and
    still-in-development 347 → 338). That change would have left no trace. It
  is the same failure this whole project documents, committed against
    ourselves.
  - `overdueTrend()` **omits** runs with no recorded count rather than reading
    them as zero. Treating a missing measurement as a measurement of nothing
    would draw a climb from zero that never happened — inventing history to
    fill a gap is precisely what we exist to catch.
  - Surfaced on the health page as "Overdue over time", with a per-reading
    delta. With one reading it says so plainly instead of drawing a line.

- **M3.** The overdue register had 555 rows across 32 products and filtered by
  status alone, which made the strongest page the least usable. Now search
  (titles and product names), product chips and status chips, with a
  "Showing N of M" count. Verified live: 555 → 126 for "teams", → 61 for the
  Outlook chip.
  - Filter logic lives in `src/lib/registerFilter.ts`, shared by both
    registers and unit-tested, rather than written twice.
  - Deliberately the same shapes and behaviour as the main feed's filter bar,
    so the registers are not a second interface to learn.

- **A dead control I caught before shipping it:** I first passed the
  contradiction *kinds* as status chips. `Contradiction` has `kind`, not
  `status`, so they would have filtered nothing. Removed — the kind tiles
  already serve as the category view, and a chip that does nothing is worse
  than no chip. The bar only appears on that register above eight rows anyway.

## 2026-08-14 — N1, N2: the calendar and the tenant filter

- **N1, the retirement calendar.** `calendar.ics` on the data branch, written
  every run alongside `feed.xml`, offered from the README and the site footer
  over `webcal:` so a click subscribes rather than downloading a copy that
  never updates again.
  - **Only dated Azure retirements** — nine of them. Rollout months were the
    obvious thing to include and the wrong one: ~1,800 month-precision entries
    that mean "we hope" would make the subscription useless inside a week. A
    retirement date is the one thing here with a real deadline behind it.
  - `UID` is `<item id>@ship-or-slip`, stable for the life of the item, and
    the file is **derived every run, never appended to**. A retirement whose
    date moves therefore moves *in place* in the subscriber's calendar. The
    alternative — a corrected entry sitting next to the stale one it replaced —
    would be this project reproducing the exact failure it documents.
  - All-day `VALUE=DATE` events with an exclusive `DTEND` per RFC 5545, and
    `TRANSP:TRANSPARENT`, so subscribing never marks anyone busy.
  - **Line folding is measured in octets, not characters.** RFC 5545 says 75
    octets; the titles carry em-dashes, and folding on character count would
    have split a multi-byte character down the middle and produced a file some
    parsers reject and others render as mojibake. `foldLine` walks back off
    UTF-8 continuation bytes before cutting. Verified on the real output: max
    physical line 75 octets, 109 logical lines, balanced BEGIN/END, 9 unique
    UIDs, CRLF throughout.

- **N2, the tenant filter.** Cloud and platform chips on both registers.
  `clouds` and `platforms` were already captured on every item and used only
  for scope-cut detection — the data was there, it just was not offered.
  - The tenant chips render **above** the product chips. Anyone running an
    estate asks "does this affect me?" before "which product is it?", and the
    order of the rows should answer in that order.
  - **An item with no recorded clouds is kept, not hidden.** Microsoft leaving
    the field blank is not evidence the item excludes your cloud. Filtering it
    out would quietly narrow the register on missing data, which is the
    opposite of what a tenant filter is for — its whole job is to be sure you
    see everything that touches you. There is a test pinning this.
  - Live shape, from a real run: 550 overdue rows, all 550 carrying clouds
    (Worldwide 499, GCC 162, GCC High 142, DoD 131) and 549 carrying platforms
    across nine values.

- Both verified end to end against a fresh clone of the `data` branch rather
  than fixtures: 1 real event, `calendar.ics` written, the tenant fields
  materialised in both registers. 398 tests, lint, typecheck and build green.

## 2026-08-19 — N13, N14: watching the contract, and the silence around it

Prompted by a developer's post: Azure AI Foundry's Responses API started
rejecting payloads it had accepted the day before, twice in ten days, with the
new requirement documented nowhere.

- **Reading the spec first changed the story.** `OutputText` has always
  required `annotations`; `InputText` has never required it. The *contract* did
  not move at all — the runtime began enforcing a rule that was already written
  down, against replayed assistant items it had previously let through. Worth
  recording because the obvious feature ("diff the spec, you'd have caught it")
  would **not** have caught this one, and building it while implying otherwise
  would have been selling something the tool cannot do.

- **N13, the contract diff.** 27 published api-versions of the Azure OpenAI
  spec, 602 operations, 3,242 schemas, snapshotted daily and compared against
  *their own* previous snapshot. Never version-to-version: two versions
  differing is them doing their job; one version differing from itself is the
  finding, breaking or not, because the promise attached to a pinned
  `api-version` is that it does not move.
  - **Enumeration is discovered, not hardcoded.** `git clone --filter=tree:0
    --depth 1 --no-checkout` is ~200 KB and `git ls-tree` of one directory
    costs ~10 MB and two seconds — so one of the largest repositories on GitHub
    is listed without cloning it. A new api-version appearing is its own event.
  - The directory's `readme.md` also declares the version list, and it is
    **stale**: it stops at `2025-01-01-preview` while `2025-03` and `2025-04`
    sit on disk beside it. Reading versions from it — the obvious choice —
    would have silently missed every recent version.
  - I had written that these specs are Swagger 2.0. They are **OpenAPI 3.x**,
    and the dialect itself moves (3.0.0 through 2025-01, 3.1.0 by 2025-04).
    Corrected; `definitions` is still read for the Azure specs that do use it.

- **N14, docs-vs-contract divergence.** The tracked pages from
  `MicrosoftDocs/azure-ai-docs`, hashed and dated, set beside the contract
  changes that should be described in them.
  - **The include indirection nearly made this useless.**
    `articles/foundry/openai/how-to/responses.md` is **581 bytes** — front
    matter, a heading, and one `[!INCLUDE]` pointing at 138 KB of actual
    documentation. Three of the six tracked pages are stubs like this;
    `batch.md` is 594 bytes resolving to 95,897. Hashing the article path would
    have reported half the corpus as unchanged forever, which is a confident
    wrong answer and worse than not watching. Includes are resolved
    transitively, and both sizes are stored so a regression to stub-hashing is
    visible in the data rather than silent.
  - **The content hash deliberately excludes the front matter**, so `ms.date`
    can be compared against it. That gap is the second feature: a date bumped
    over byte-identical content is a page asserting it was reviewed when
    nothing was; content moving under a stale date is the inverse.
  - **Correlation shows its working and asserts nothing.** The map from API
    surface to doc path is hand-written — three of my first five guessed paths
    were wrong, and Assistants turns out to be documented only under
    `foundry-classic`. An unmapped surface produces no finding rather than a
    guess, and "we track no page for this" is kept distinct from "this is
    undocumented", because only the second is an accusation.
  - Verified end to end by simulating the incident in the fixture: the
    `annotations` requirement landing produces one finding naming the symbol,
    the two pages searched, and `❌ does not mention it` against each.

- **Two anomaly guards, both earned during the build.** Running offline against
  a directory still holding a live snapshot produced **384 changes across a
  surface of 394** — 97% of a pinned version apparently rewritten, and 83 false
  "undocumented" findings. Held now, per version, and the snapshot is refused
  along with the diff: writing the suspect surface while dropping its changes
  would adopt it as the next baseline and lose the evidence and the alarm
  together. The docs half has the matching guard for a partially materialised
  checkout, which would otherwise record every unread page as removed.

- **One brittleness fixed on the way:** `git checkout` fails the entire
  invocation on a single unknown pathspec, so one stale entry in the map took
  all six pages down and reported "docs unavailable". Checked out one at a time
  now, with the bad path as a warning.

- 483 tests, lint, typecheck and build green. A real round takes ~25 seconds
  and adds four paths to the data branch, touching none of the roadmap files.
