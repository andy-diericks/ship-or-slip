# Product vision & backlog

*Proposed work, not yet built. Sizes are rough: **low** ≈ an afternoon,
**med** ≈ a day or two, **high** ≈ needs its own ADR first.*

## What this is for

Microsoft publishes its roadmap in the present tense and overwrites it in
place. Ship or Slip keeps the previous copy and diffs it, so the questions
*"when did they say this would land?"* and *"how often are they late?"* have
answers that exist nowhere else.

Every feature below is judged against one test: **does it make the recorded
history more trustworthy, or more useful?** Anything that only makes the page
busier is not on this list.

The archive gets more valuable with age, and some of this backlog is gated on
that. Analytics built on one week of data would be noise dressed as insight.

---

## A · Coverage

- **A1 — Power Platform release planner.** Publishes early-access and GA dates
  that move exactly like the M365 roadmap. One new normalizer, no pipeline
  change. *(med)* ⭐
- **A2 — Azure non-retirement updates.** We currently discard ~190 of every 200
  RSS items. Tracking GA and preview transitions widens coverage cheaply. *(low)*
- **A3 — Azure OpenAI model availability** per region, diffed from the public
  docs repository's git history. *(high)*
- **A4 — Windows release health**: known issues and their resolution dates. *(med)*

## B · Analytics — where this stops being a feed and becomes a product

*All of B needs months of accumulated history first. Do not start these early;
a league table built on 23 events is a lie with a chart on it.*

- **B1 — Slip league table per product.** Median slip, share shipped in the
  originally promised month. *"Purview slips 2.3 months on median; Teams 0.4."*
  Nobody else can publish this. *(med)* ⭐⭐
- **B2 — Serial slippers**: features that have moved three or more times,
  ranked by cumulative slip. *(low)*
- **B3 — Cohort delivery**: of everything promised for a given month, what
  actually landed in it? *(med)*
- **B4 — Slip trend over time**: is Microsoft getting better or worse? *(med)*
- **B5 — Announcement-to-ship distribution**: how long from first appearance to
  Launched. *(med)*

## C · Distribution

- **C1 — RSS/Atom feed** of slips and cancellations. The cheapest distribution
  for this audience. *(low)* ⭐
- **C2 — Weekly digest** page and archive, generated as Markdown + JSON. *(med)*
- **C3 — Per-event OG images**, so a shared link previews the actual slip. *(med)*
- **C4 — "Biggest slips this month"** auto-generated summary. *(low)*

## D · Experience

- **D1 — Per-product pages** at `#/product/<name>`: filtered feed plus that
  product's statistics. The natural landing page from a search engine. *(med)*
- **D2 — Watchlist.** Star features; `localStorage` only, no backend. *(low)*
- **D3 — Date-range picker.** The feed is hardcoded to 90 days. *(low)*
- **D4 — Archive browsing.** The monthly event files exist and nothing reads
  them yet. *(med)*

## E · Trust and operations

- ~~**E1 — Anomaly guard.**~~ **Built 2026-08-08.** A run whose diff is
  implausibly large is held rather than written. See ADR 0003 and
  `scripts/lib/anomaly.mjs`.
- **E2 — Health page**: run history, per-source status, warnings — as
  `finance-portfolio` has. *(low)*
- **E3 — Schema validation** of pipeline output in CI. *(low)*
- **E4 — Golden-file tests**: recorded real feed pairs asserted against their
  expected events, so a parser regression fails loudly. *(med)*

## F · Data access

- **F1 — CSV export** of the current filtered view. *(low)*
- **F2 — Document the JSON files as a public API.** They are already served
  with open CORS; this costs a README section. *(low)*

## G · Signals already captured and thrown away

*`normalize.mjs` stores `preview`, `products`, `phases` and `clouds` on every
item. `diff.mjs` compared only `date` and `status`. Everything here is a matter
of using what is already fetched.*

- ~~**G1 — Preview-date tracking.**~~ **Built 2026-08-08.** 422 of 1,819 items
  carry a preview date, and it moves before GA does.
- ~~**G2 — Scope-cut detection.**~~ **Built 2026-08-08.** `clouds`, `platforms`
  and `phases` compared as sets; `platforms` had to be captured first.
- ~~**G3 — Title-change tracking.**~~ **Built 2026-08-08.** Whitespace-only
  changes ignored.
- **G4 — Product reassignment** — an item moving between product families,
  which often signals a reorg or a quiet deprioritisation. *(low)*

## H · Correlation

- **H1 — Conference cohorts.** Build (May) and Ignite (November) drive
  announcement spikes; the Azure feed already tags items "Microsoft Build".
  Track what was promised at a conference against what shipped. An annual,
  quotable story. *(med)* ⭐⭐
- **H2 — Fiscal-year bunching.** Microsoft's FY starts in July. Do dates
  cluster at FY and quarter boundaries, and do June promises slip more? *(med)*
- **H3 — Cross-source linkage** — connect an Azure retirement to the roadmap
  item that replaces it. *(high)*
- **H4 — Copilot index.** Around 31% of the roadmap is Copilot. Is AI slipping
  more or less than everything else? One honest number with real news value.
  *(med)*

## I · Trust and provenance

- **I1 — Receipts.** Link every event to the `data`-branch commit that recorded
  it. Turns "we say it slipped" into an auditable claim, using commit history
  that already exists. *(low)* ⭐
- **I2 — Back up the `data` branch.** It is irreplaceable, single-homed, and
  one force-push from gone. Weekly mirror to a release asset or second repo.
  ADR 0003 calls this the entire asset. *(low)* ⭐⭐
- **I3 — Compaction policy** for when the monthly archives grow large. *(low)*
- **I4 — Correction log.** If a bad run ever gets through, record the
  correction openly rather than silently rewriting. Append-only integrity
  applies to our own mistakes too. *(low)*

## J · Distribution and reach

- **J1 — Outbound webhook** — post slips to Teams or Slack via a URL held in a
  GitHub secret. *(low)* ⭐
- **J2 — Embeddable SVG badge** per product, e.g. "Teams: 0.4mo median slip".
  Other people's READMEs then link back. *(med)*
- **J3 — Pre-rendered item pages** for search engines; hash routing is
  invisible to crawlers today. *(med)*
- **J4 — Annual review** generated from the archive. *(med)*

## K · Experience, second pass

- **K1 — "Since your last visit"** highlighting, via a `localStorage`
  timestamp. No backend. *(low)*
- **K2 — Arbitrary date comparison**: what changed between two dates. *(med)*
- **K3 — Sparkline per feed row** showing that item's date history inline. *(med)*
- **K4 — Command palette** (`Cmd-K`) to jump to a product or feature. *(low)*

---

## Suggested order

1. ~~E1, the anomaly guard~~ — done. Everything else rests on the archive being
   trustworthy.
2. ~~G1 and G3~~ — done. Cheap, and they deepen the record *from the next run
   onward*, which is the argument for doing this kind of work early: history
   not captured today cannot be recovered later.
3. ~~G2 (scope cuts)~~ — done. All of epic G's already-captured-and-discarded
   signals are now used, except product reassignment (G4).
4. **I2 (back up the data branch)** — the archive is now genuinely valuable and
   still exists in exactly one place. The largest unaddressed risk here.
5. **C1 (RSS)** — an afternoon, and it is how people find this kind of site.
6. **A2 (Azure launches)** — widens coverage using data already fetched.
7. Let the archive accumulate for two or three months.
8. **B1 (slip league table)** — the headline feature, once there is something
   real to measure.

## Not doing

- **User accounts, or anything with a backend.** The whole architecture is two
  static branches and no server; adding auth would trade that for very little.
- **Email alerts.** Real value, but it needs a subscriber list, which needs a
  backend and a privacy policy. RSS covers most of the need for none of the
  cost.
- **Predicting whether a feature will slip.** Tempting, and wrong: the value
  here is an accurate record, and a wrong prediction printed next to a true
  record devalues the record.
