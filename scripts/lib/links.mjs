// Links back to Microsoft, derived from an item's id.
//
// Derived rather than stored, deliberately. Every archived event carries a
// `link` captured when it was recorded, so a stored URL that turns out to be
// wrong stays wrong for all of history. Deriving at render time means fixing
// the rule here repairs every past event at once.
//
// Imported by both the pipeline and the app. ADR 0001 chose one npm project
// specifically so a shared rule like this has exactly one definition — the
// predecessor project hand-mirrored its equivalent and the copies drifted.

/**
 * The feed's own id, without our `<source>:` namespace.
 * @param {string} id e.g. "m365:558683"
 * @returns {string}  e.g. "558683"
 */
export function featureId(id) {
  const raw = String(id ?? '');
  const colon = raw.indexOf(':');
  return colon === -1 ? raw : raw.slice(colon + 1);
}

/**
 * The public Microsoft page for an item.
 *
 * M365 uses `?searchterms=<id>`. The more obvious-looking `?featureid=<id>`
 * loads the roadmap but does not select the feature — the page is a
 * client-rendered app, so both URLs return HTTP 200 and only the rendered
 * result differs. Verified by hand, not by status code.
 *
 * No locale in the path: microsoft.com redirects to the reader's own.
 *
 * @param {string} id      namespaced id, e.g. "m365:558683"
 * @param {string} [source] falls back to the id's own prefix
 * @returns {string}
 */
export function sourceLink(id, source) {
  const feed = source ?? String(id ?? '').split(':')[0];
  const raw = featureId(id);
  if (!raw) return 'https://www.microsoft.com/microsoft-365/roadmap';
  return feed === 'azure'
    ? `https://azure.microsoft.com/updates?id=${encodeURIComponent(raw)}`
    : `https://www.microsoft.com/microsoft-365/roadmap?searchterms=${encodeURIComponent(raw)}`;
}
