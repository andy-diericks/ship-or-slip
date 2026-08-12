# Product vision & backlog

**Every feature, built or not, in one table.** Ranked by impact, then by how
cheap it is. Keep it that way: a backlog split across sections hides what has
already been done and invites rebuilding it.

- **Impact** — how much it changes what someone can learn here.
- **Complexity** — ●○○ an afternoon · ●●○ a day or two · ●●● needs its own ADR.
- **Status** — ✅ built · ⬜ not built · ⛔ blocked by something outside the code.

## What this is for

Microsoft publishes its roadmap in the present tense and overwrites it in
place. Ship or Slip keeps the previous copy and diffs it, so *"when did they
say this would land?"* and *"how often are they late?"* have answers that exist
nowhere else.

Every entry below is judged against one test: **does it make the recorded
history more trustworthy, or more useful?** Anything that only makes the page
busier is not on this list.

---

## Built

| ID | Feature | Impact | Cx | Status |
|---|---|---|---|---|
| L1 | **Overdue register.** 578 items past their promised date, 347 still "in development", worst 28 months late. Needs no history — the strongest page on the site | Very high | ●●○ | ✅ |
| M1 | **Register counts in the run log.** The registers are derived and overwritten each run, so this series is the only place their history survives. Surfaced as an "overdue over time" table on the health page; readings from before it existed are omitted rather than shown as zero | Very high | ●○○ | ✅ |
| M3 | **Search and product filter on the registers.** 555 overdue rows across 32 products; shared filter logic, same shapes as the main feed | High | ●○○ | ✅ |
| E1 | **Anomaly guard.** Holds any run whose diff is implausibly large, so a Microsoft schema change cannot poison an append-only archive | Very high | ●●○ | ✅ |
| I2 | **Archive protection.** Ruleset blocking force-push and deletion, weekly verified git bundles on Releases, `docs/recovery.md` | Very high | ●○○ | ✅ |
| — | **Microsoft's quoted notes.** Their own "Updated 7 August: we have decided not to move forward" carried onto events and shown attributed | Very high | ●○○ | ✅ |
| — | **Lifecycle context.** Whether a cancelled feature had reached public preview, or was dropped on paper | High | ●○○ | ✅ |
| G2 | **Scope-cut detection.** A feature quietly losing "GCC High" or "Mac" — no date moves, nobody else reports it | High | ●●○ | ✅ |
| A2 | **Azure full coverage.** All 200 RSS items, not just the 10 retirements; lifecycle mapped onto the shared status vocabulary | High | ●○○ | ✅ |
| G1 | **Preview-date tracking.** 422 items carry one, and it moves before GA does — the leading indicator | High | ●○○ | ✅ |
| C1 | **Atom feed** of notable changes only — no routine announcements | High | ●○○ | ✅ |
| E2 | **Health page.** Run history with gap detection, per-source state, warnings, archive inventory — answers *is the pipeline working*, which the dashboard does not | High | ●●○ | ✅ |
| L2 | **Contradiction register.** 5 items whose own record disagrees with itself — marked *Launched* while the note says "still in development", or launched before their own rollout date | High | ●○○ | ✅ |
| G3 | **Rename tracking.** "for Web, Desktop and Mobile" → "for Web" is a scope cut in disguise | Medium | ●○○ | ✅ |
| — | **Roadmap IDs and correct deep links** (`?searchterms=`, derived so past events are repaired too) | Medium | ●○○ | ✅ |

## Not built

| ID | Feature | Impact | Cx | Status |
|---|---|---|---|---|
| B1 | **Slip league table.** Median slip and on-time share per product. *Gated on months of history* | Very high | ●●○ | ⬜ |
| H1 | **Conference cohorts.** What Build and Ignite promised versus what shipped. An annual, quotable story | Very high | ●●○ | ⬜ |
| M2 | **Retiring soon.** 7 Azure retirements are still ahead, 4 within twelve months. An actionable countdown of what is about to break — needs no history, small dataset | High | ●○○ | ⬜ |
| J1 | **Teams/Slack webhook.** Push slips to a channel via a secret URL | High | ●○○ | ⬜ |
| A1 | **Power Platform release planner.** ⛔ **Blocked, not merely unbuilt** — `releaseplans.microsoft.com` is unreachable from the build environment (proxy 403), and no `releasecommunications` sibling endpoint exists (`powerapps`, `powerbi`, `dynamics` all 404). The playbook forbids writing a parser without a captured sample. Needs either an egress allowlist entry or a hand-captured API response | High | ●●○ | ⛔ |
| F2 | **Document the JSON as a public API.** Already served with open CORS; costs a README section | High | ●○○ | ⬜ |
| M4 | **Deep-link an expanded row** (`#/overdue?open=382643`) so a specific finding can be shared | Medium | ●○○ | ⬜ |
| M5 | **Backup status on the health page.** Closes the I2 loop — the weekly bundles exist but nothing surfaces when the last one was taken | Medium | ●○○ | ⬜ |
| D1 | **Per-product pages** at `#/product/teams`, with that product's statistics | Medium | ●●○ | ⬜ |
| L3 | **Preview→rollout gap.** 422 items have both dates; does the planned gap stretch? | Medium | ●●○ | ⬜ |
| H4 | **Copilot index.** ~31% of the roadmap is Copilot. Is AI slipping more than the rest? | Medium | ●●○ | ⬜ |
| B2 | **Serial slippers** — items that have moved three or more times | Medium | ●○○ | ⬜ |
| L4 | **Note-change events.** A note appearing is news even when no date moves | Medium | ●○○ | ⬜ |
| J2 | **Embeddable SVG badge** per product; other people's READMEs link back | Medium | ●●○ | ⬜ |
| C2 | **Weekly digest** page and archive | Medium | ●●○ | ⬜ |
| I1 | **Receipts.** Link each event to the `data` commit that recorded it *(partly served by quoted notes)* | Medium | ●○○ | ⬜ |
| E4 | **Golden-file tests** — recorded feed pairs asserted against expected events | Medium | ●●○ | ⬜ |
| G4 | **Product reassignment** — an item moving between product families | Medium | ●○○ | ⬜ |
| D4 | **Archive browsing.** The monthly event files exist and nothing reads them | Medium | ●●○ | ⬜ |
| B3 | **Cohort delivery.** Of everything promised for a month, what landed in it? | Medium | ●●○ | ⬜ |
| B4 | **Slip trend over time.** Is Microsoft getting better or worse? | Medium | ●●○ | ⬜ |
| L5 | **Azure lifecycle durations.** 94 Launched, 82 in preview — how long do previews last? | Medium | ●●○ | ⬜ |
| H2 | **Fiscal-year bunching.** Do dates cluster at FY boundaries, and do June promises slip more? | Medium | ●●○ | ⬜ |
| A3 | **Azure OpenAI availability** per region, diffed from the public docs repo | Medium | ●●● | ⬜ |
| J3 | **Pre-rendered item pages.** Hash routing is invisible to search engines | Medium | ●●○ | ⬜ |
| E3 | **Schema validation** of pipeline output in CI | Low | ●○○ | ⬜ |
| D3 | **Date-range picker.** The feed is hardcoded to 90 days | Low | ●○○ | ⬜ |
| D2 | **Watchlist.** Star features; `localStorage` only | Low | ●○○ | ⬜ |
| K1 | **"Since your last visit"** highlighting | Low | ●○○ | ⬜ |
| F1 | **CSV export** of the current view | Low | ●○○ | ⬜ |
| I4 | **Correction log.** If a bad run gets through, record the correction openly | Low | ●○○ | ⬜ |
| I3 | **Compaction policy** for when monthly archives grow large | Low | ●○○ | ⬜ |
| K4 | **Command palette** (`Cmd-K`) | Low | ●○○ | ⬜ |
| B5 | **Announcement-to-ship distribution** | Low | ●●○ | ⬜ |
| C4 | **"Biggest slips this month"** summary | Low | ●○○ | ⬜ |
| K3 | **Sparkline per feed row** | Low | ●●○ | ⬜ |
| K2 | **Arbitrary date comparison** | Low | ●●○ | ⬜ |
| C3 | **Per-event OG images** | Low | ●●○ | ⬜ |
| J4 | **Annual review** generated from the archive | Low | ●●○ | ⬜ |
| A4 | **Windows release health** — known issues and resolution dates | Low | ●●○ | ⬜ |
| H3 | **Cross-source linkage** — an Azure retirement to its replacement | Low | ●●● | ⬜ |

---

## Suggested order

1. **J1** — makes the project useful daily rather than on visits.
2. **F2** — free reach; the files are already public.
3. **H1** — Ignite is in November; the Build cohort wants recording first.
4. Let the archive accumulate, then **B1**.

## Not doing

- **User accounts, or any backend.** The architecture is two static branches
  and no server; auth would trade that away for very little.
- **Email alerts.** Real value, but needs a subscriber list, a backend and a
  privacy policy. RSS covers most of it for none of the cost.
- **Predicting whether a feature will slip.** Tempting, and wrong: the value
  here is an accurate record, and a wrong prediction printed beside a true
  record devalues the record.
