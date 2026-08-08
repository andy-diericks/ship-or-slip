# ADR 0003 — Data model, storage and cadence (FROZEN)

Status: accepted · Date: 2026-08-06

## The data lives on an orphan `data` branch

`main` holds code. The pipeline commits its output to a separate orphan branch
called `data`, and the published page fetches that branch at runtime over
`raw.githubusercontent.com`.

The alternative — committing data to `main`, which is what both predecessor
projects do — couples every data refresh to a site rebuild. In
`finance-portfolio` that produced a build-quota ceiling, a bot racing the human
on the same branch, and a rebase-retry loop in the workflow to survive it.
Here, four refreshes a day cost zero Pages builds and cannot collide with a
code push, because the two never touch the same branch.

The cost is a runtime dependency on `raw.githubusercontent.com` (permissive
CORS, a few minutes of caching) and the fact that the site cannot be rendered
at build time. Both are acceptable for a dashboard that is useless without
fresh data anyway.

## Layout of the `data` branch

```
index.json            manifest: generated timestamp, months present, totals, warnings
recent.json           the last 90 days of events — the dashboard's single request
events/YYYY-MM.json   append-only monthly archive
timelines.json        per-item change history, only for items that ever moved
current/m365.json     running snapshot, the baseline the next diff compares against
current/azure.json
feed.xml              Atom feed of the notable events
```

**The feed is generated here, not at build time.** A feed rebuilt only when the
*code* changes would be days stale, and rebuilding the site on every data
refresh is the coupling this ADR exists to prevent. The cost of putting it on
the data branch is that `raw.githubusercontent.com` serves it as
`text/plain` rather than `application/atom+xml`; readers discover it through
the `<link rel="alternate">` tag in `index.html` and parse it by content, which
works in practice. If a stricter reader ever objects, serve the same file
through jsDelivr — it sets the correct type — rather than moving the feed into
the build.

The feed carries only *notable* events: slips, cancellations, drops, scope cuts
and retirements. `added` and `shipped` are excluded on purpose — one ordinary
run produced thirteen `added` events, and a feed that fires on routine
announcements is one people unsubscribe from.

`recent.json` is **derived** from the monthly archives on every run, never
appended to. A corrected archive therefore always produces a corrected feed,
and the two cannot drift.

`timelines.json` holds only items with at least one recorded event, so it stays
proportional to the interesting part of the data rather than to the ~1,800
roadmap items that mostly sit still.

## What is tracked, and what "changed" means

| Source | Items tracked | Tracked date |
|---|---|---|
| M365 roadmap (`api/v1/m365`, JSON) | all ~1,800 | `publicDisclosureAvailabilityDate`, parsed to `YYYY-MM` |
| Azure updates (`api/v2/azure/rss`, RSS) | retirement notices only | retirement date parsed from the title or description, `YYYY-MM-DD` |

Microsoft publishes only the present tense: both feeds expose today's value of
those fields and no history whatsoever. Every event this project records exists
because the previous snapshot was kept.

Event types: `slipped`, `pulled_in`, `shipped`, `cancelled`, `status_changed`,
`dropped`, `added`, `date_added`, `retirement_announced`, `retirement_moved`,
`preview_slipped`, `preview_pulled_in`, `preview_set`, `renamed`.

**Preview dates are tracked separately from GA.** `publicPreviewDate` is
present on roughly a quarter of roadmap items and moves before the GA date
does, which makes it the leading indicator: a preview slipping is often the
first visible sign that GA will follow. It uses the same vocabulary as the GA
date so the two read alike.

**Renames are events.** A title rewritten from "for Web, Desktop and Mobile" to
"for Web" is a scope cut that touches no date and would otherwise be invisible.
Both versions are recorded so the change speaks for itself. Titles differing
only in whitespace are ignored — Microsoft reflows its own copy constantly, and
that noise would bury the renames that mean something.

**Scope is tracked across three tag lists**: `clouds`, `platforms` and
`phases`. A feature losing "GCC High" or "Mac" is a commitment shrinking
without a single date moving, and nothing else reports it. `products` is
deliberately excluded — an item moving between product families is a
reassignment, not a cut, and belongs to its own event type.

Two rules make this safe, and both are load-bearing:

- **Lists are compared as sets.** Order is not meaningful in these feeds and
  does vary between responses; comparing them as arrays would report a
  reshuffle as a scope change across hundreds of items at once.
- **A dimension absent from the previous snapshot is *unknown*, not empty.**
  When `platforms` began being captured, every one of 1,819 items would
  otherwise have looked like it gained scope on the first run. Skipping the
  comparison until both sides have the field makes adding a new dimension a
  silent migration — verified against the live snapshot, which produced zero
  events.

## The windowed-feed rule

The Azure RSS exposes only the most recent 200 updates. An item's **absence
from a windowed feed carries no information** — it scrolled off the end.

Two consequences, both enforced in `scripts/lib/diff.mjs` and both covered by
tests:

1. A windowed source never emits `dropped`. Doing so would produce a torrent of
   false "Microsoft cancelled this" claims, which is the single worst mistake
   this project could make: the whole value proposition is being trustworthy
   about what changed.
2. A windowed source's snapshot is **merged**, not replaced, so items that
   scrolled out are carried forward and a retirement date that moves a year
   from now is still detected.

## Failure behaviour

A feed that cannot be fetched, or that parses to zero items, leaves its
snapshot untouched and records a warning that the dashboard surfaces. Treating
a fetch failure as "everything disappeared" would fabricate thousands of
events.

## The anomaly guard

The rule above covers a feed being *down*. It does not cover a feed being
*different* — a renamed field, a changed id scheme, a reshaped payload. Those
parse cleanly and produce a diff in which everything Microsoft ever promised
appears to have moved at once.

That is the one failure this project cannot absorb. A missed run costs hours of
detection; a thousand fabricated events poison the archive permanently, because
the archive is append-only and Microsoft will not re-serve the old values for us
to reconstruct the truth from.

So `scripts/lib/anomaly.mjs` holds any run where **both**: at least 50 events
were produced, **and** they exceed 25% of the items in the previous snapshot.
Both conditions are needed — the ratio alone punishes small sources, the count
alone punishes large ones. When held, that source's snapshot and events are not
written, the baseline is preserved for the next run to diff against, a warning
is recorded for the dashboard, and the process exits non-zero.

The non-zero exit is deliberate and reserved for this case alone. A dead feed
is transient and self-healing, so it stays a warning; a feed that changed shape
needs a person, and a red run plus GitHub's mail about it is how that person
gets summoned. Everything healthy is still written first — the exit code
escalates, it does not discard.

`--force` accepts a held run, for when the change is genuinely real.

The guard is deliberately blunt. A clever detector that occasionally lets a bad
run through is worth less than a crude one that stops the line and asks. A run with one dead feed is a successful run for the other.

The first run for a source **seeds** its snapshot and emits no events —
otherwise the archive would open with 1,800 spurious "added" entries.

## Cadence: an external trigger, not GitHub cron

Four times a day, triggered by a **cron-job.org** job that POSTs to the
workflow's `dispatches` endpoint. `fetch.yml` carries `workflow_dispatch:` and
no `schedule:`. Setup is in [docs/setup.md](../setup.md).

GitHub's `schedule:` was tried first and removed. It fired **zero** times: two
windows passed in silence, on two different cron expressions, including one
deliberately moved off the top of the hour. GitHub documents no guarantee that
a scheduled workflow runs at all, and the sibling `finance-portfolio` project
reached the same conclusion independently before switching to the same
dispatcher.

The reasoning is specific to what this project is. A tracker whose entire
value proposition is *"we were watching at the moment it changed"* cannot rest
on a best-effort trigger. A missed window is not a delayed run — it is a
permanent hole in the record, because Microsoft will not serve the old value
again. Every other design decision here (the append-only archive, the seeding
guard, the refusal to emit `dropped` on a windowed feed) exists to protect the
integrity of that record; leaving the clock to chance would undo all of it.

Four runs a day is a deliberate ceiling, not a limitation to work around.
Microsoft publishes in weekday bursts, so a tighter cadence mostly buys empty
runs, and the cost of missing a same-day change is low for a product measured
in months of slippage.

**Failure is visible without monitoring.** If the dispatcher stops, no run
happens, `index.json` stops advancing, and the dashboard's freshness badge goes
amber and then red on its own. That is the intended safety net: staleness
surfaces to a reader on the page, not only to whoever thinks to open the
Actions tab.

**Do not read a missed run as a broken trigger.** On day one this repository
saw no `push`-triggered runs for 13 hours, which looked like the triggers had
never activated. They had: the first push landed during a GitHub Actions
incident that cancelled everything queued. A later ordinary push triggered both
workflows normally. Check [githubstatus.com](https://www.githubstatus.com)
before concluding anything about a trigger.
