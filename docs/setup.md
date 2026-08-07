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

## 4 · The external scheduler

`fetch.yml` has no `schedule:` — GitHub cron never fired here (see ADR 0003).
The clock lives outside, in a free [cron-job.org](https://cron-job.org) job
that calls the workflow's dispatch endpoint.

**First, a token.** GitHub → **Settings → Developer settings → Personal access
tokens → Fine-grained tokens → Generate new token**:

- **Repository access:** *Only select repositories* → `ship-or-slip`
- **Permissions:** *Actions* → **Read and write**. Nothing else. (*Metadata:
  read* is added automatically and is required.)
- **Expiry:** set a reminder — when it lapses the pipeline goes quiet, and the
  only symptom is the freshness badge slowly going amber then red.

**Then the job.** cron-job.org → **Create cronjob**:

| Field | Value |
|---|---|
| URL | `https://api.github.com/repos/andy-diericks/ship-or-slip/actions/workflows/fetch.yml/dispatches` |
| Method | `POST` |
| Schedule | `01:37`, `07:37`, `13:37`, `19:37` — every day |
| Request body | `{"ref":"main"}` |

Headers:

```
Authorization: Bearer <your fine-grained token>
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

A successful dispatch returns **HTTP 204 No Content** with an empty body.
cron-job.org treats 2xx as success, so a failing token shows up as a failed job
in its dashboard rather than silently doing nothing.

Two details worth knowing. The `:37` is deliberate — nothing depends on it now
that GitHub's scheduler is out of the picture, but it keeps the runs off the
top of the hour where every other integration piles up. And cron-job.org runs
in **local time** and handles DST itself, which is why the schedule is written
as wall-clock times rather than UTC.

You can verify the whole path with one command:

```bash
curl -i -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d '{"ref":"main"}' \
  https://api.github.com/repos/andy-diericks/ship-or-slip/actions/workflows/fetch.yml/dispatches
```

`204` means it worked — check the Actions tab for the run it started.

## 5 · Check it works

Run **Actions → Fetch and diff → Run workflow** manually. A successful run
either commits a new snapshot to the `data` branch or logs "Nothing changed."
Then confirm the site loads and the freshness badge is green.

After the external job has had one window to fire, check that a run appears
that nobody triggered by hand. Until that happens, the pipeline is not actually
autonomous — everything before it only proves the parts work when pushed.

## Base path

`vite.config.ts` sets `base` to `/ship-or-slip/` when `GITHUB_PAGES=true`,
which `deploy-pages.yml` sets. If the repository is ever renamed, change it
there too.
