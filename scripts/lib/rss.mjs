// A deliberately small RSS reader.
//
// The Azure feed is a single well-formed document from one publisher, so a
// regex reader is enough and keeps the pipeline dependency-free (ADR 0001).
// It is not a general-purpose parser and should not grow into one.

/** Undo the five XML entities the Azure feed actually emits. */
export function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Strip CDATA wrappers and any HTML tags, then collapse whitespace. */
export function stripMarkup(s) {
  return decodeEntities(
    String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(item, name) {
  const m = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? stripMarkup(m[1]) : '';
}

function tagAll(item, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi');
  return [...item.matchAll(re)].map((m) => stripMarkup(m[1])).filter(Boolean);
}

/**
 * Parse an RSS 2.0 document into plain item objects.
 *
 * @param {string} xml
 * @returns {{guid: string, title: string, link: string, description: string,
 *            pubDate: string, categories: string[]}[]}
 */
export function parseRss(xml) {
  if (!xml) return [];
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  return items.map((item) => ({
    guid: tag(item, 'guid'),
    title: tag(item, 'title'),
    link: tag(item, 'link'),
    description: tag(item, 'description'),
    pubDate: tag(item, 'pubDate'),
    categories: tagAll(item, 'category'),
  }));
}
