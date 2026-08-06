# One-time setup

Everything here is done once, by a human, in the GitHub UI. The workflows
handle the rest.

## 1 · Enable GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

Not "Deploy from a branch" — `deploy-pages.yml` uploads an artifact and needs
the Actions source. The site appears at
`https://<owner>.github.io/ship-or-slip/`.

The repository must be **public**: GitHub Pages does not serve sites from
private repositories on the free plan.

## 2 · Allow Actions to write

**Settings → Actions → General → Workflow permissions → Read and write
permissions.**

`fetch.yml` pushes the refreshed snapshot to the `data` branch. Without this it
will fail at the push step with a 403.

## 3 · The `data` branch

Created as an orphan branch by the initial setup:

```bash
git checkout --orphan data
git rm -rf .
node scripts/fetch.mjs --data-dir=.
git add -A && git commit -m "chore: seed the data branch"
git push -u origin data
git checkout main
```

It must exist before `fetch.yml` runs, because the workflow checks it out. If
it is ever lost, re-seeding produces a working site immediately but **the
recorded history is gone for good** — Microsoft cannot supply it retroactively.
Do not force-push this branch.

## 4 · Check it works

Run **Actions → Fetch and diff → Run workflow** manually. A successful run
either commits a new snapshot or logs "Nothing changed." Then confirm the site
loads and the freshness badge is green.

## Base path

`vite.config.ts` sets `base` to `/ship-or-slip/` when `GITHUB_PAGES=true`,
which `deploy-pages.yml` sets. If the repository is ever renamed, change it
there too.
