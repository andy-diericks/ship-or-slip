# Recovering the archive

*Read this before you need it. The commands below have been run, not guessed.*

## What is actually at risk

Code is reproducible: the ADRs, the tests and a day's work would rebuild it.
The `data` branch is not. Microsoft's roadmap and update feeds are present-tense
only — once a promised date is overwritten there is no API, no cache and no
support ticket that returns the old value. **Everything this project is worth
lives on that branch.**

Three defences, in order of how much they matter:

1. **A ruleset on `data`** blocks force-pushes and branch deletion. This stops
   the accidents, which are the likely failures. Verified by attempting both:
   force-push rejected with `GH013`, deletion rejected with 403.
2. **Weekly bundles** attached to GitHub Releases, tagged `backup-YYYY-MM-DD`.
   Twelve are kept. Taken by `fetch.yml`, which verifies each one restores
   before publishing it.
3. **This document**, so a restore is a procedure rather than an improvisation.

## Restoring

### 1 · Get the most recent backup

```bash
gh release list --limit 20            # backup-YYYY-MM-DD, newest first
gh release download backup-2026-08-08 --pattern '*.bundle'
```

### 2 · Restore it locally and check it

```bash
git clone ship-or-slip-data.bundle restored-archive
cd restored-archive

git log --oneline | head            # every refresh, newest first
node -e "console.log(require('./index.json').generated)"
ls current/                          # m365.json, azure.json
```

A bundle contains the branch's **full history**, not a snapshot, so you get the
provenance back too — which run recorded which change, and when.

### 3 · Put it back on the repository

The ruleset blocks force-pushes, and that is deliberate. Do not start by
disabling it: first work out whether you actually need to overwrite, or whether
you can push forward.

**If `data` was deleted**, just recreate it — no force needed:

```bash
cd restored-archive
git remote add origin https://github.com/andy-diericks/ship-or-slip
git push origin data
```

**If `data` still exists but its history was damaged**, prefer keeping both
histories over overwriting one:

```bash
git push origin data:data-restored          # land the good copy under a new name
```

Then inspect the two branches, decide what is true, and only afterwards point
`data` at the right commit. If that genuinely requires a force-push, disable the
`protect-data` ruleset, push, and **re-enable it immediately**. Leaving it off
is how the next incident happens.

### 4 · Confirm the site recovered

```bash
curl -s https://raw.githubusercontent.com/andy-diericks/ship-or-slip/data/index.json
```

Then load the dashboard. The freshness badge should return to green after the
next pipeline run.

## Gotchas that have actually bitten

- **A bundle needs `HEAD`.** `git bundle create <file> data` omits it, and the
  bundle then cannot be plain-cloned — `git clone` fails with *"remote HEAD
  refers to nonexistent ref"*. The workflow uses `git bundle create <file> data
  HEAD`. If you ever bundle by hand, do the same, or clone with
  `git clone -b data <file>`.
- **`git bundle verify` must run inside a repository.** Outside one it fails
  with *"need a repository to verify a bundle"*, which looks like a corrupt
  bundle and is not. The workflow verifies by cloning instead, which is a
  stronger check anyway.
- **The data checkout in CI is shallow.** A bundle taken from it would contain
  one commit. `fetch.yml` runs `git fetch --unshallow` first.
- **An empty commit sits in the history** (`test: verify normal appends...`),
  from validating the ruleset. It changed no data. Removing it would require a
  force-push, which is not worth disabling the protection for.

## Testing this

A backup nobody has restored is a belief. `fetch.yml` restores every bundle
before publishing it, so the mechanism is exercised weekly rather than
annually. Once a year, do it by hand from the release page as well — the
workflow proves the bundle is good, not that a human can follow this page.
