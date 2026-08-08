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

**Then the job.** cron-job.org → **Create cronjob**. On the *Advanced* tab,
leave **"Requires HTTP authentication" OFF** — that is Basic auth, which
GitHub's REST API no longer accepts. The token travels in an `Authorization`
header instead, set up below.

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
in its dashboard rather than silently doing nothing. What the other codes mean:

| Code | Cause |
|---|---|
| `204` | Worked. A run should appear in the Actions tab within seconds. |
| `401` | Bad token, or a missing `Bearer ` prefix on the header value. |
| `403` | Token lacks *Actions: read and write*. |
| `404` | Token is not scoped to this repository, or the workflow filename is wrong. |
| `422` | The `ref` in the body does not exist — it must be `main`. |

Also on the job: turn on **failure notifications**, and **save responses** if
offered. A `204` has an empty body so saved responses tell you little while
things work — but the day the token expires, the recorded `401` and its JSON
message turn "why did it stop" into a five-second answer.

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

To confirm the *dispatcher* specifically, wait for a window to pass and check
that a run appeared that nobody clicked. One trap: a dispatch authenticated
with a personal access token records the **token owner** as the triggering
actor, exactly as a manual click does — so `triggering_actor` cannot tell the
two apart. Judge by timing instead: a run landing a minute or so after a
scheduled slot, when nobody was at a keyboard, is the dispatcher.

The freshness badge is the standing check. It grades the data's age against the
six-hourly cadence, so if the dispatcher stops, the site says so on its own —
amber after a missed window, red after several. Nobody has to remember to open
the Actions tab.

## Base path

`vite.config.ts` sets `base` to `/ship-or-slip/` when `GITHUB_PAGES=true`,
which `deploy-pages.yml` sets. If the repository is ever renamed, change it
there too.
