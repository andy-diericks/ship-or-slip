// Watching Microsoft's documentation for what it does and does not say.
//
// Two things are recorded per tracked page: the *resolved* content, and the
// `ms.date` Microsoft stamps in the front matter as its own freshness claim.
// Keeping them apart is the entire design, because the interesting findings
// live in the gap between them (ADR 0004):
//
//   date bumped, content identical → reviewed on paper only
//   content changed, date not bumped → moved while claiming an older review
//
// That is why the content hash covers the body **and not the front matter**.
// Hashing the whole file would fold `ms.date` into the hash, every freshness
// bump would look like a content change, and neither finding could ever be
// made.

import path from 'node:path';
import crypto from 'node:crypto';

/** `[!INCLUDE [label](relative/path.md)]` — the docs' transclusion syntax. */
const INCLUDE = /\[!INCLUDE\s*\[[^\]]*\]\(([^)]+)\)\s*\]/gi;

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split YAML front matter from the body.
 *
 * Deliberately not a YAML parser: these pages use a flat `key: value` header
 * and the only fields read here are scalars. Pulling in a YAML dependency
 * would break the pipeline's zero-dependency rule (ADR 0001) to parse eight
 * lines.
 *
 * @param {string} text
 * @returns {{data: Record<string,string>, body: string}}
 */
export function parseFrontMatter(text) {
  const source = String(text ?? '');
  const match = source.match(FRONT_MATTER);
  if (!match) return { data: {}, body: source };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    // Nested list items (`ms.custom:` and friends) are indented; skip them
    // rather than recording `- build-2025` as a key.
    if (/^\s/.test(line)) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    if (key) data[key] = value;
  }
  return { data, body: source.slice(match[0].length) };
}

/**
 * `ms.date` as `YYYY-MM-DD`.
 *
 * Microsoft writes it `MM/DD/YYYY`. Stored ISO so it sorts, and returned null
 * rather than guessed when it is written some other way — an unparsed date
 * quietly rendered as today would fabricate a freshness claim.
 */
export function msDate(front) {
  const raw = String(front?.['ms.date'] ?? '').trim();
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

/**
 * Follow `[!INCLUDE]` transclusions from one article.
 *
 * The reason this exists: `articles/foundry/openai/how-to/responses.md` is 581
 * bytes — front matter, a heading, and one include pointing at 138 KB of the
 * actual documentation. Hashing the article path alone would report that page
 * as unchanged forever, which is a confident wrong answer and worse than not
 * watching it at all.
 *
 * @param {(p: string) => string|null} read returns file text, or null if absent
 * @param {string} startPath repo-relative path of the article
 * @param {{maxDepth?: number}} [options]
 * @returns {{text: string, includes: string[], missing: string[], truncated: boolean}}
 */
export function resolveIncludes(read, startPath, { maxDepth = 4 } = {}) {
  const includes = [];
  const missing = [];
  const seen = new Set();
  let truncated = false;

  const walk = (filePath, depth) => {
    // A cycle, or a nesting depth no real page uses. Both stop here and are
    // reported, rather than being allowed to hang the run.
    if (seen.has(filePath)) return '';
    seen.add(filePath);
    if (depth > maxDepth) {
      truncated = true;
      return '';
    }

    const raw = read(filePath);
    if (raw == null) {
      missing.push(filePath);
      return '';
    }

    const { body } = parseFrontMatter(raw);
    return body.replace(INCLUDE, (whole, href) => {
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(filePath), String(href).split('#')[0].trim()),
      );
      if (target.startsWith('..')) return whole;
      includes.push(target);
      return walk(target, depth + 1);
    });
  };

  return { text: walk(startPath, 0), includes, missing, truncated };
}

/** Short, stable content fingerprint. */
export function hashContent(text) {
  // Line endings and trailing whitespace are normalized away: the docs repo
  // takes contributions from every editor on earth, and a CRLF round-trip is
  // not a documentation change.
  const normalized = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Everything recorded about one tracked page.
 *
 * @param {(p: string) => string|null} read
 * @param {string} docPath
 * @returns {object|null} null when the article itself is absent
 */
export function docState(read, docPath) {
  const raw = read(docPath);
  if (raw == null) return null;

  const { data } = parseFrontMatter(raw);
  const resolved = resolveIncludes(read, docPath);

  return {
    path: docPath,
    title: data.title ?? null,
    msDate: msDate(data),
    hash: hashContent(resolved.text),
    // Both sizes are kept on purpose. If a future change ever regresses to
    // hashing the stub, `resolvedBytes` collapsing to roughly `bytes` makes it
    // visible in the data instead of silently reporting "never changes".
    bytes: raw.length,
    resolvedBytes: resolved.text.length,
    includes: resolved.includes,
    missingIncludes: resolved.missing,
  };
}

/**
 * Compare two rounds of doc states.
 *
 * @param {Record<string, object>} before
 * @param {Record<string, object>} after
 * @returns {Array<object>}
 */
export function diffDocs(before, after) {
  // As with the contract diff: no previous snapshot means we have not been
  // watching, not that every page just appeared.
  if (!before) return [];

  const changes = [];
  for (const [docPath, prev] of Object.entries(before)) {
    const now = after?.[docPath];
    if (!now) {
      changes.push({ type: 'doc_removed', path: docPath, title: prev.title ?? null });
      continue;
    }

    const contentMoved = prev.hash !== now.hash;
    const dateMoved = prev.msDate !== now.msDate;

    if (contentMoved && dateMoved) {
      changes.push({
        type: 'doc_updated',
        path: docPath,
        title: now.title ?? null,
        from: prev.msDate,
        to: now.msDate,
      });
    } else if (contentMoved) {
      changes.push({
        type: 'doc_changed_silently',
        path: docPath,
        title: now.title ?? null,
        from: prev.msDate,
        to: now.msDate,
      });
    } else if (dateMoved) {
      changes.push({
        type: 'doc_freshness_only',
        path: docPath,
        title: now.title ?? null,
        from: prev.msDate,
        to: now.msDate,
      });
    }
  }

  for (const docPath of Object.keys(after ?? {})) {
    if (!(docPath in before)) {
      changes.push({ type: 'doc_added', path: docPath, title: after[docPath].title ?? null });
    }
  }

  return changes;
}

export const DOC_CHANGE_LABELS = {
  doc_updated: 'Updated',
  doc_changed_silently: 'Changed without updating its own date',
  doc_freshness_only: 'Date bumped, content identical',
  doc_added: 'Added',
  doc_removed: 'Removed',
};

/** The public page for a tracked article. */
export function docLink(docPath) {
  // The repo mirrors the published site: `articles/<x>.md` → `/azure/<x>`.
  const slug = String(docPath ?? '')
    .replace(/^articles\//, '')
    .replace(/\.md$/, '');
  return `https://learn.microsoft.com/en-us/azure/${slug}`;
}
