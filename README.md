# Ship or Slip

> Every date Microsoft promised, and every date it moved.

Microsoft publishes its roadmap in the present tense. The Microsoft 365 roadmap
API tells you the date a feature is promised for *right now* — and when that
date quietly moves from September to December, the September is simply gone.
Azure retirement notices work the same way: the date changes in place, and one
title in the feed today reads *"AV36 Node Retirement **now on** September 30,
2027"* without a word about what it used to say.

Ship or Slip keeps yesterday's copy and diffs it. Nothing else does.

**🔗 Live dashboard:** https://andy-diericks.github.io/ship-or-slip/

## What it records

| | |
|---|---|
| **Slipped** | a promised date moved later — with how far, in months |
| **Pulled in** | a date moved earlier |
| **Shipped** | reached General Availability |
| **Dropped** | vanished from the roadmap without ever shipping |
| **Cancelled** | explicitly marked cancelled |
| **Retirement announced** | a new Azure retirement notice |
| **Retirement moved** | an existing retirement date changed |

Roughly 1,800 Microsoft 365 roadmap items and every Azure retirement notice,
checked every six hours.

**📡 Atom feed:** [slips, scope cuts and cancellations](https://raw.githubusercontent.com/andy-diericks/ship-or-slip/data/feed.xml)
— notable changes only, no routine announcements.

**📅 Retirement calendar:** [subscribe](webcal://raw.githubusercontent.com/andy-diericks/ship-or-slip/data/calendar.ics)
— every dated Azure retirement as an all-day event, rewritten every run so a
date that moves moves in your calendar too. If your client wants a plain URL to
paste, use the
[`https:` form](https://raw.githubusercontent.com/andy-diericks/ship-or-slip/data/calendar.ics).

## The contract watch

A second, daily pipeline watches something the roadmap feeds never mention:
whether a published `api-version` is still what it was. Azure pins its APIs to
a version, and the promise that carries is that the version does not move.

Every published version of the Azure OpenAI spec — 27 of them, 602 operations
and 3,242 schemas — is snapshotted and compared **against its own previous
snapshot**, never against another version. Alongside it, the pages in
`MicrosoftDocs/azure-ai-docs` that should describe each surface are tracked, so
a contract change can be set beside the documentation that does or does not
mention it.

The site never says *"Microsoft hid this"*. It shows the symbol that changed,
the pages searched, and whether each one mentions it — a claim you can check in
two clicks. See [ADR 0004](docs/adr/0004-contract-and-docs-watch.md).

## How it works

There is no backend. Two public feeds go in, a diff comes out, a static page
draws it.

```
  Microsoft 365 roadmap API ─┐
                             ├─▶ scripts/fetch.mjs ─▶ `data` branch ─▶ GitHub Pages
  Azure updates RSS ─────────┘    (normalize, diff)    (JSON files)     (React app
                                                                         fetches it)
```

The pipeline runs on GitHub Actions every six hours and commits to an orphan
`data` branch. The site lives on `main`. Because the two never touch the same
branch, a data refresh costs no Pages build and can never race a code push —
see [ADR 0003](docs/adr/0003-data-model.md) for why that matters.

The six-hourly clock is an external [cron-job.org](https://cron-job.org) job
hitting the workflow's dispatch endpoint, not GitHub's `schedule:` — that never
fired here, and a record of *when* something changed cannot rest on a
best-effort trigger.

## Running it locally

```bash
npm ci
npm run dev                    # the dashboard, against the live data branch
npm test                       # 483 tests across the pipelines and the UI
```

Working on the pipeline:

```bash
node scripts/fetch.mjs --offline --dry-run   # parse the checked-in fixtures, write nothing
node scripts/fetch.mjs --data-dir=.data      # a real run into a local directory

node scripts/contracts.mjs --offline --dry-run   # the contract and docs watch
node scripts/contracts.mjs --data-dir=.data      # a real round (~25s, clones two repos treelessly)
```

Then point the dev server at that local run:

```bash
VITE_DATA_BASE=/preview-data npm run dev     # after copying .data into public/preview-data
```

## Honest limitations

- **History starts when the watching started.** There is no way to recover what
  Microsoft promised before this project's first snapshot. That is exactly the
  gap it exists to close, but it means the archive gets more valuable with age
  rather than being useful on day one.
- **The Azure feed is a rolling window of 200 updates.** Items that scroll off
  are carried forward in our snapshot, but a retirement notice published and
  amended between two of our runs would be seen only in its amended form.
- **"Dropped" means "left the roadmap unshipped"**, which is usually a
  cancellation but is occasionally Microsoft reorganising its own feed. The
  dashboard says what it observed, not what Microsoft intended.
- Both feeds are public but undocumented as APIs. If Microsoft changes their
  shape, the pipeline records a warning and leaves the last good snapshot
  untouched rather than writing nonsense.
- **The contract watch sees the contract, not the runtime.** It reports when a
  published `api-version` changes. It cannot see a server that starts enforcing
  a rule the spec already contained — which is a real way people get broken,
  and needs live probing to catch (backlog N15).
- **The spec-to-docs map is hand-written and short.** An API surface nobody has
  mapped produces no finding rather than a guess.

## Documentation

| Doc | What's in it |
|---|---|
| [ADR 0001](docs/adr/0001-tech-stack.md) | Tech stack, and why the pipeline has no dependencies |
| [ADR 0002](docs/adr/0002-design-system.md) | Design tokens, both themes, accessibility rules |
| [ADR 0003](docs/adr/0003-data-model.md) | Data model, the `data` branch, the windowed-feed rule |
| [ADR 0004](docs/adr/0004-contract-and-docs-watch.md) | The contract watch, the include indirection, why correlation is evidence |
| [docs/setup.md](docs/setup.md) | One-time repository setup |
| [CLAUDE.md](CLAUDE.md) | Briefing for AI sessions working on this repo |

## Licence

MIT. The recorded data is derived from Microsoft's public feeds and is not
affiliated with or endorsed by Microsoft.
