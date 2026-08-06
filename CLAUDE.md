# CLAUDE.md — Ship or Slip

Read this before touching anything. Containers are ephemeral and sessions start
cold; this file plus the ADRs are the whole handover.

## What this is

Microsoft publishes its roadmap and its retirement notices in the present tense
only. The M365 roadmap API shows the date a feature is *currently* promised for;
when that date moves, the old one is gone without trace. Azure retirement
notices behave the same way.

Ship or Slip keeps yesterday's copy and diffs it. That is the entire product:
**every date Microsoft promised, and every date it moved.**

The consequence worth internalising: our data is only as good as our restraint.
A false "Microsoft dropped this feature" is far more damaging than a missed
event, because the whole reason anyone would trust this site is that nobody
else has the history to check it against.

## Layout

```
src/                 the dashboard (React + TS)
  lib/               types, filters, formatting, routing, theme — all unit-tested
  components/        one component per file, each with a .test.tsx
scripts/             the pipeline, plain Node ESM, zero dependencies
  fetch.mjs          one run: fetch → normalize → diff → store
  lib/               dates, rss, normalize, diff, store — all unit-tested
fixtures/            trimmed real feed captures, for --offline runs and CI
docs/adr/            architecture decisions. FROZEN — follow them.
playbooks/           step-by-step procedures
journal.md           append-only log of what each session did
```

## Conventions

- English everywhere: code, comments, UI copy, docs.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Style is the linter's business — obey it, don't debate it.
- UI follows `docs/adr/0002-design-system.md`. No off-token colours, sizes or
  spacing. Both themes must work; colour never carries meaning alone.
- Every feature PR includes tests. Pure functions get tested first, before any
  UI exists — three of the seven incidents in the predecessor project lived in
  untested arithmetic.

## Before you say you're done

```bash
npm run lint && npm run typecheck && npm test && npm run build
node scripts/fetch.mjs --offline --dry-run   # pipeline still parses the fixtures
```

All five must pass. `--dry-run` writes nothing, so it is always safe.

## Hard rules

- **Never emit `dropped` for a windowed feed.** See ADR 0003. The Azure RSS
  only shows the last 200 updates; absence means nothing. This is enforced in
  `diff.mjs` and covered by tests — do not "fix" those tests to make a change
  pass.
- **Never rewrite history on the `data` branch.** It is append-only. The
  recorded past is the entire asset; a rewrite destroys the one thing that
  cannot be re-fetched from Microsoft.
- **A failed fetch leaves the snapshot alone.** Never let an empty or errored
  feed be diffed as if everything disappeared.
- **Never push directly to `main`.** Work on a branch, open a PR.
- Never add secrets, tokens or credentials to the repo.
- Adding a dependency to `scripts/` needs an ADR change first (ADR 0001).

## When you are uncertain

Do not guess. Open an issue labelled `needs-human`, note it in `journal.md`,
and stop. An agent that stops when unsure is worth more than one that plows on.

## Not set up (deliberately)

There are **no scheduled Claude workflows** in this repo. The predecessor's
autonomous dev/PM loops worked, but they opened no-op PRs on every idle run and
stalled on a hand-edited "Current Epic" line. If loops get added here, fix both
first: only open a PR when there is a real code diff, and don't gate the
backlog on a line a human has to remember to edit.
