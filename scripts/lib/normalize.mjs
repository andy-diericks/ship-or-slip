// Feed-specific shapes in, one common item shape out.
//
// Everything after this file is source-agnostic: the differ, the storage
// layer and the UI all speak `TrackedItem`. Adding a third feed later means
// writing one normalizer, not touching the pipeline.

import { parseRoadmapDate, parseRetirementDate } from './dates.mjs';
import { parseRss } from './rss.mjs';

/**
 * @typedef {object} TrackedItem
 * @property {string} id          `<source>:<feed id>` — stable across runs
 * @property {'m365'|'azure'} source
 * @property {string} title
 * @property {string} link
 * @property {string|null} status Feed status, M365 only
 * @property {string|null} date   The tracked date: `YYYY-MM` (M365 GA) or `YYYY-MM-DD` (Azure retirement)
 * @property {string|null} dateRaw What Microsoft actually wrote
 * @property {string|null} preview M365 public preview month, `YYYY-MM`
 * @property {string[]} products
 * @property {string[]} phases
 * @property {string[]} clouds
 * @property {string[]} [platforms] Desktop / Web / Mac / Mobile — M365 only
 * @property {string|null} updated Feed's own last-modified timestamp
 */

const names = (tags) => (Array.isArray(tags) ? tags.map((t) => t?.tagName).filter(Boolean) : []);

/**
 * Normalize the M365 roadmap API payload.
 *
 * The tracked date is `publicDisclosureAvailabilityDate` — the GA commitment.
 * That single field moving is the core event this whole project exists to
 * record, because the API only ever exposes its current value.
 *
 * @param {any[]} raw
 * @returns {TrackedItem[]}
 */
export function normalizeM365(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && r.id != null)
    .map((r) => {
      const container = r.tagsContainer ?? {};
      return {
        id: `m365:${r.id}`,
        source: /** @type {'m365'} */ ('m365'),
        title: String(r.title ?? '').trim(),
        link: `https://www.microsoft.com/microsoft-365/roadmap?featureid=${r.id}`,
        status: r.status ? String(r.status).trim() : null,
        date: parseRoadmapDate(r.publicDisclosureAvailabilityDate),
        dateRaw: r.publicDisclosureAvailabilityDate
          ? String(r.publicDisclosureAvailabilityDate).trim()
          : null,
        preview: parseRoadmapDate(r.publicPreviewDate),
        products: names(container.products),
        phases: names(container.releasePhase),
        clouds: names(container.cloudInstances),
        // Captured so scope changes can be detected: a feature quietly losing
        // "Mac" or "Mobile" is a cut that touches no date (see diff.mjs).
        platforms: names(container.platforms),
        updated: r.modified ? String(r.modified) : null,
      };
    });
}

/** Azure tags retirement notices with this category; titles are less reliable. */
const RETIREMENT_CATEGORY = /^retirement/i;
const RETIREMENT_TEXT = /\bretire(?:d|ment|s)?\b|\bdeprecat/i;

/**
 * True when an Azure update is a retirement notice rather than ordinary news.
 *
 * The category is authoritative when present; the text check catches notices
 * that were filed under a service category only.
 *
 * @param {{title: string, description: string, categories: string[]}} item
 */
export function isRetirement(item) {
  if (item.categories?.some((c) => RETIREMENT_CATEGORY.test(c))) return true;
  return RETIREMENT_TEXT.test(`${item.title} ${item.description}`);
}

/** Categories that describe the update's kind, not the product it belongs to. */
const META_CATEGORIES = new Set([
  'Retirements', 'Feature', 'Features', 'Services', 'Launched', 'In preview',
  'In development', 'Announcement', 'Microsoft Build', 'Microsoft Ignite', 'SDK and Tools',
]);

/**
 * Normalize the Azure service-updates RSS feed, keeping only retirements.
 *
 * The tracked date is the retirement date parsed from the title, falling back
 * to the description. Notices with no parseable date are still kept — knowing
 * a retirement was announced matters even before a date is attached, and one
 * appearing later is itself an event worth recording.
 *
 * @param {string} xml
 * @returns {TrackedItem[]}
 */
export function normalizeAzure(xml) {
  return parseRss(xml)
    .filter((item) => item.guid && isRetirement(item))
    .map((item) => {
      const date = parseRetirementDate(item.title) ?? parseRetirementDate(item.description);
      return {
        id: `azure:${item.guid}`,
        source: /** @type {'azure'} */ ('azure'),
        title: item.title,
        link: item.link || `https://azure.microsoft.com/updates?id=${item.guid}`,
        status: null,
        date,
        dateRaw: date ? item.title : null,
        preview: null,
        products: item.categories.filter((c) => !META_CATEGORIES.has(c)),
        phases: [],
        clouds: [],
        updated: item.pubDate || null,
      };
    });
}
