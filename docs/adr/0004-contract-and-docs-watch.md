# ADR 0004 — Watching API contracts and their documentation

Status: accepted · Date: 2026-08-19

## Why this exists

The roadmap sources answer *"when did they say this would land?"*. They say
nothing about the other way Microsoft breaks people: an API that changes under
a version that was promised not to.

The trigger was a developer reporting that Azure AI Foundry's Responses API
started rejecting payloads it had accepted the day before, twice in ten days,
with the new requirement documented nowhere. Reading the published spec showed
something more interesting than the complaint: `OutputText` has always required
`annotations` and `InputText` has never required it. The *contract* had not
changed at all — the runtime had simply begun enforcing a rule that was already
written down, against items it had previously let through.

That is three separate observable things, and only the first two are free:

1. **The contract changed** — a published `api-version` is not what it was.
2. **The documentation is silent** — the contract says one thing, the page that
   should explain it says nothing.
3. **The runtime changed without the contract changing** — invisible to anyone
   not calling the API.

This ADR covers 1 and 2. The third needs live calls, a credential and a bill,
and is deliberately left out (see *Not in scope*).

## This is a second data domain, not more roadmap events

Contract and documentation findings do **not** enter the roadmap event stream.
They have no rollout month, no product list, no slip in months; forcing them
into `ChangeEvent` would mean either a shapeless union type or a feed in which
"Teams background blur slipped to December" sits beside "a required property
appeared in 2025-04-01-preview". The two questions have different readers.

So they get their own files, their own workflow and their own page:

```
contracts.json   per api-version: the tracked surface, and what changed
docs.json        per tracked doc: content hash, ms.date, and what changed
```

Both live on the same `data` branch, for the same reason everything else does
(ADR 0003), and are written by `scripts/contracts.mjs` — a separate entry point
from `scripts/fetch.mjs`. A failure in one must never hold up the other.

## Cadence: daily, not six-hourly

The roadmap is checked every six hours because a date can be edited in place at
any moment and the edit is the whole product. Specs and docs move through pull
requests and publishing pipelines; six-hourly adds no fidelity and multiplies
the cost of the enumeration step below. Daily.

## Enumerating api-versions

Versions are **discovered, not listed in our code**. A hardcoded list means a
new `api-version` is invisible until a human notices, and a new `api-version`
appearing is itself one of the more interesting things this can report.

The enumeration is a `git clone --filter=tree:0 --depth 1 --no-checkout` of
`Azure/azure-rest-api-specs`, then `git ls-tree` of one directory. The filter
means the initial clone is ~200 KB and trees are fetched lazily: listing the
AzureOpenAI inference directory costs about 10 MB and under two seconds, rather
than cloning one of the largest repositories on GitHub.

The `readme.md` in that directory also declares versions, and was the obvious
place to read them from. It is **stale** — it stops at `2025-01-01-preview`
while `2025-03-01-preview` and `2025-04-01-preview` exist on disk. Trusting it
would have silently missed every recent version. The directory listing is the
truth; the readme is Microsoft's description of it, and the two disagree.

## What counts as a contract change

The comparison is per `api-version`, against our own previous snapshot — never
between versions. Version `2025-04-01-preview` differing from
`2025-03-01-preview` is a new version doing new things, which is normal and
uninteresting. Version `2025-04-01-preview` differing **from itself last week**
is the finding, and it is the finding whether or not the change is breaking,
because the promise attached to a pinned `api-version` is that it does not move.

Severity is recorded but does not decide what is reported:

| Change | Breaking for | Why |
|---|---|---|
| required property added | callers | payloads that validated stop validating |
| operation removed | callers | the call disappears |
| enum value removed | callers | a legal value becomes illegal |
| property removed | consumers | a field read from the response vanishes |
| required property removed | — | strictly loosening |
| operation / property / enum added | — | strictly widening |

Additions are still recorded. A pinned version growing new operations is not
harmless news; it is evidence that the version is not frozen, which is the
premise everything else rests on.

## Documentation, and the include indirection

`MicrosoftDocs/azure-ai-docs` is public and clones treeless in under a
megabyte. Tracked pages are checked out individually.

**Article files are frequently stubs.** `articles/foundry/openai/how-to/
responses.md` is 581 bytes: front matter, an `<h1>`, and an
`[!INCLUDE [...](../includes/how-to-responses-content.md)]` pointing at 138 KB
of actual content. A watcher that hashes the article path sees a file that
never changes and reports "documentation unchanged" forever, which is worse
than not watching at all — it is a confident wrong answer. Includes are
therefore resolved transitively before hashing, with a depth limit and a
visited set, and the resolved size is recorded so a silent regression to
stub-only hashing is visible in the data.

`ms.date` is Microsoft's own freshness claim in the front matter. It is *not* a
modification time — it is routinely bumped by freshness passes that change
nothing else. That gap is not noise to be filtered out, it is a second finding:

- **`ms.date` bumped, resolved content byte-identical** → a page asserting it
  was reviewed on a date when nothing about it changed.
- **content changed, `ms.date` not bumped** → a page that moved while still
  claiming its old review date.

## Correlation is evidence, never inference

The tempting feature is "the contract changed and the docs did not, therefore
Microsoft shipped an undocumented change". The site cannot say *therefore*.

There is no machine-readable link from a schema in a spec to a page in the docs
repo. So the map is **hand-curated** in `scripts/lib/apimap.mjs` — a short list
of API surfaces to the doc paths that should describe them — and every finding
shows its working: the changed symbol, the doc searched, and whether that
symbol appears in the doc's resolved text. A reader can check the claim in two
clicks.

This follows the contradiction register (ADR 0003's descendant): only ever put
two of *their* artefacts side by side and let the reader draw the conclusion. A
generated keyword match presented as an accusation would be the first thing on
this site that could be wrong in a way nobody could check.

An unmapped surface produces **no finding**, not a guess. The map being
incomplete is a known, stated limitation; a wrong correlation would be a
credibility loss the archive does not recover from.

## Holding an implausible round

Both halves inherit the roadmap's anomaly guard (E1), because both write logs
that cannot be re-derived.

**Contracts** are held per api-version: a diff of 40+ changes that moves more
than a fifth of that version's own surface is refused, and the snapshot is
*not* written either. Writing the new surface while discarding its changes
would quietly adopt the suspect document as the next run's baseline, so the
following run would compare against it, find nothing wrong, and lose the
evidence and the alarm in one step. Held per version rather than per run, so
one malformed document does not cost the other twenty-six their comparison.

This was not a hypothetical: running the pipeline against a fixture while the
directory still held a live snapshot produced **384 changes across a surface of
394** — 97% of a pinned api-version apparently rewritten. The guard caught it,
which is how the threshold came to be chosen.

**Documentation** is held as a whole round: if fewer than half the tracked
pages read, the round is discarded rather than diffed. The realistic failure is
a partially materialised checkout, where `diffDocs` would faithfully record
every unread page as removed — an append-only log poisoned by an outage that
had nothing to do with Microsoft.

## Not in scope

**Probing the live API** (backlog N15). It is the only thing that would have
caught the incident that prompted this, and it needs a credential, costs money
per run, and varies by region and tenant. The hard part is not the call — it is
that a probe failing for a billing or quota reason must never be recorded as
"Microsoft broke it". Until that distinction is airtight, recording it would
poison the one thing this project sells, which is that its history is true.

**Every Azure API.** The enumeration generalises; the curated doc map does not.
Starting with Azure OpenAI inference keeps the map honest and small.
