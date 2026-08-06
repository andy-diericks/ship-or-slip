# Playbook — adding a third feed

The pipeline is source-agnostic after normalisation: the differ, the storage
layer and the UI all speak `TrackedItem`. Adding a feed means writing one
normalizer, not touching the pipeline.

1. **Capture a real sample first.** Save the raw response to `fixtures/`,
   trimmed to a few dozen representative records. Never write a parser against
   what the documentation claims the shape is — both current feeds differ from
   their docs.

2. **Decide the tracked date.** Every source needs exactly one field whose
   movement is the story. If a feed has no such field, it does not belong here.

3. **Write the normalizer** in `scripts/lib/normalize.mjs`, returning
   `TrackedItem[]` with `id` namespaced as `<source>:<feed id>`. The id must be
   stable across runs — if the feed has no stable key, stop and open a
   `needs-human` issue, because an unstable id turns every run into a flood of
   fake `added` and `dropped` events.

4. **Decide whether it is windowed.** If the feed exposes only recent items,
   register it with `windowed: true` in `scripts/fetch.mjs`. Read the
   windowed-feed rule in ADR 0003 before you do — getting this wrong is the one
   mistake that breaks trust in the whole site.

5. **Test the normalizer** against the fixture: the happy path, a record with
   the tracked date missing, a malformed document, and an empty document.

6. **Add it to `SOURCES`** in `scripts/fetch.mjs` and to `SOURCE_LABELS` in
   `src/lib/types.ts`.

7. **Verify end to end** before opening the PR:

   ```bash
   node scripts/fetch.mjs --offline --dry-run
   node scripts/fetch.mjs --data-dir=/tmp/check      # a real fetch
   npm run lint && npm run typecheck && npm test && npm run build
   ```

8. **Check the first run seeds rather than floods.** A new source's first run
   must report `seeded (no diff)`. If it reports thousands of events, the
   seeding guard is not covering it.
