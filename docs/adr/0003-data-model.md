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
```

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
`dropped`, `added`, `date_added`, `retirement_announced`, `retirement_moved`.

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
events. A run with one dead feed is a successful run for the other.

The first run for a source **seeds** its snapshot and emits no events —
otherwise the archive would open with 1,800 spurious "added" entries.

## Cadence

Every six hours (`0 */6 * * *`). GitHub's scheduler drifts and drops runs on
the free tier; at this cadence that costs at most a few hours of detection
delay, which is inside what a roadmap tracker needs. Microsoft updates these
feeds in bursts on weekdays, so a tighter schedule would mostly buy empty runs.
If the cadence ever needs to tighten, move to an external dispatcher (as
`finance-portfolio` did with cron-job.org) rather than trusting GitHub cron.
