// Which documentation is supposed to describe which part of the API.
//
// There is no machine-readable link from a schema in an OpenAPI document to a
// page in the docs repository, so this map is hand-written and short. That is
// a deliberate limit, not a stub waiting to be generated: a guessed mapping
// would produce a confident accusation nobody could check, and this site's
// only real asset is that its claims survive being checked (ADR 0004).
//
// A surface that is not in this map produces **no finding**. Silence is the
// correct output for something we have not mapped; a guess is not.
//
// Every path below was checked against the repository rather than inferred
// from the published URL — three of the first five guesses were wrong, and a
// path that does not exist yields no documentation to search, which would read
// as "undocumented" for the wrong reason.

/**
 * @typedef {object} SurfaceMap
 * @property {string} id
 * @property {string} label     how the finding names this surface
 * @property {RegExp} schemas   which schema names belong to it
 * @property {RegExp} [routes]  which operations belong to it
 * @property {string[]} docs    repo-relative doc paths that should describe it
 */

/** @type {SurfaceMap[]} */
export const SURFACES = [
  {
    id: 'responses',
    label: 'Responses API',
    schemas: /^(Response|Input|Output|Item|EasyInput|Reasoning|Conversation)/,
    routes: /\/responses/,
    docs: [
      'articles/foundry/openai/how-to/responses.md',
      'articles/foundry/agents/quickstarts/responses-api.md',
    ],
  },
  {
    id: 'chat-completions',
    label: 'Chat Completions',
    schemas: /^(ChatCompletion|ChatMessage|CreateChatCompletion)/,
    routes: /\/chat\/completions/,
    docs: ['articles/foundry/openai/how-to/chatgpt.md'],
  },
  {
    id: 'assistants',
    label: 'Assistants',
    schemas: /^(Assistant|Thread|Run|MessageObject)/,
    routes: /\/(assistants|threads)/,
    // Only under `foundry-classic`: the Assistants documentation never moved
    // to the new tree, which is itself worth noticing about its status.
    docs: [
      'articles/foundry-classic/openai/how-to/assistant.md',
      'articles/foundry-classic/openai/concepts/assistants.md',
    ],
  },
  {
    id: 'batch',
    label: 'Batch',
    schemas: /^Batch/,
    routes: /\/batches/,
    docs: ['articles/foundry/openai/how-to/batch.md'],
  },
];

/** The surface a change belongs to, or null when it is unmapped. */
export function surfaceFor(change) {
  const target = String(change?.target ?? '');
  const isRoute = /^[A-Z]+ \//.test(target);
  return SURFACES.find((s) => (isRoute
    ? s.routes?.test(target)
    : s.schemas.test(target))) ?? null;
}

/**
 * The one symbol a reader would search the documentation for.
 *
 * The changed field when there is one — someone hitting "annotations is
 * required" searches for `annotations`, not for `OutputText`.
 */
export function primarySymbol(change) {
  return String(change?.field ?? change?.target ?? '') || null;
}

/**
 * Does this text mention the symbol?
 *
 * Word-boundary and case-sensitive. Case-sensitive because these symbols are
 * `input_text` and `OutputText`, and a case-insensitive match on a word like
 * "annotations" would hit ordinary prose about annotating and turn a checkable
 * claim into a coin flip. A missed mention costs one finding; a false "it is
 * documented" would quietly suppress a true one.
 */
export function mentions(text, symbol) {
  if (!text || !symbol) return false;
  const escaped = String(symbol).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(String(text));
}

/**
 * Pair contract changes with the documentation that should describe them.
 *
 * Every finding carries its own working — the symbol, the docs searched, and
 * whether each one mentions it — so a reader can check the claim rather than
 * take it. Nothing here asserts intent: the output is "this changed and these
 * pages do not mention it", never "Microsoft hid this".
 *
 * @param {Array<object>} changes contract changes from diffSurfaces
 * @param {Record<string, object>} docs docPath → docState
 * @param {(docPath: string) => string} readDocText resolved text for a doc
 * @returns {Array<object>} findings, breaking ones first
 */
export function correlate(changes, docs, readDocText) {
  const findings = [];

  // One symbol, one finding. A property becoming required also shows up as a
  // property being added, and reporting "annotations is undocumented" twice
  // makes the page look padded rather than thorough. The breaking change wins.
  const seen = new Map();

  for (const change of changes ?? []) {
    const surface = surfaceFor(change);
    if (!surface) continue;

    const symbol = primarySymbol(change);
    if (!symbol) continue;

    const searched = surface.docs
      .filter((docPath) => docs?.[docPath])
      .map((docPath) => ({
        path: docPath,
        title: docs[docPath].title ?? null,
        msDate: docs[docPath].msDate ?? null,
        mentions: mentions(readDocText(docPath), symbol),
      }));

    // No tracked page for this surface means we cannot say anything about its
    // documentation — which is different from saying it is undocumented.
    if (searched.length === 0) continue;

    const finding = {
      kind: searched.some((d) => d.mentions) ? 'documented' : 'undocumented',
      surface: surface.id,
      surfaceLabel: surface.label,
      version: change.version ?? null,
      change,
      symbol,
      docs: searched,
    };

    const key = `${finding.version}|${surface.id}|${symbol}`;
    const existing = seen.get(key);
    if (existing && (existing.change?.breaking || !change.breaking)) continue;
    if (existing) findings.splice(findings.indexOf(existing), 1);
    seen.set(key, finding);
    findings.push(finding);
  }

  // Undocumented first, then breaking ones, so the loudest finding leads.
  const rank = (f) => (f.kind === 'undocumented' ? 0 : 1) + (f.change?.breaking ? 0 : 0.5);
  return findings.sort((a, b) => rank(a) - rank(b));
}
