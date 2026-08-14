// The calendar feed.
//
// Retirements are the one thing here with a real, day-precision date and a
// consequence: something you depend on stops working. Roadmap rollout dates
// are month-precision guesses that move — useful on a page, misleading in a
// calendar, and there are hundreds of them. A calendar people keep subscribed
// to is one that only tells them what will break.
//
// RFC 5545 is fussy in three ways that silently break importers, so all three
// are handled here rather than hoped for: CRLF line endings, escaping, and
// folding long lines at 75 octets.

/** Longest permitted content line, per RFC 5545. Continuations begin with a space. */
const FOLD_AT = 75;

/**
 * Escape a text value.
 *
 * Backslash first, or the escapes we add would themselves be escaped.
 */
export function escapeIcs(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold a line to 75 octets, continuations prefixed with a single space.
 *
 * Measured in octets rather than characters: a multi-byte character split
 * across a fold boundary corrupts the file, and Microsoft's titles are long
 * enough that folding always happens (the longest is 133 characters).
 */
export function foldLine(line) {
  const bytes = Buffer.from(String(line), 'utf8');
  if (bytes.length <= FOLD_AT) return String(line);

  const parts = [];
  let start = 0;
  let limit = FOLD_AT;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = FOLD_AT - 1; // continuation lines lose one octet to the leading space
  }

  return parts.join('\r\n ');
}

/** `YYYY-MM-DD` → `YYYYMMDD`, the DATE form used by all-day events. */
const toIcsDate = (iso) => String(iso ?? '').slice(0, 10).replace(/-/g, '');

/** The day after — DTEND is exclusive for all-day events. */
function nextDay(iso) {
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const toIcsStamp = (iso) => `${String(iso).replace(/[-:]/g, '').slice(0, 15)}Z`;

/**
 * Build an iCalendar document of dated retirements.
 *
 * @param {{items: any[], generated: string, siteUrl: string, link: (item: any) => string}} options
 * @returns {string}
 */
export function buildCalendar({ items, generated, siteUrl, link }) {
  const stamp = toIcsStamp(generated);

  const events = (items ?? [])
    .filter((item) => item?.kind === 'retirement' && item.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .flatMap((item) => {
      const end = nextDay(item.date);
      if (!end) return [];
      const description = [
        item.note?.text ? `Microsoft's note: ${item.note.text}` : null,
        item.products?.length ? `Products: ${item.products.join(', ')}` : null,
        `Recorded by Ship or Slip — ${siteUrl}`,
      ].filter(Boolean).join('\n');

      return [
        'BEGIN:VEVENT',
        // Stable per item, so re-subscribing updates rather than duplicates.
        `UID:${escapeIcs(item.id)}@ship-or-slip`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${toIcsDate(item.date)}`,
        `DTEND;VALUE=DATE:${toIcsDate(end)}`,
        `SUMMARY:${escapeIcs(item.title)}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        `URL:${escapeIcs(link ? link(item) : siteUrl)}`,
        'CATEGORIES:Azure retirement',
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      ];
    });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ship or Slip//Azure retirements//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Ship or Slip — Azure retirements',
    `X-WR-CALDESC:${escapeIcs('Dated Azure retirement notices. Things that will stop working.')}`,
    // Most clients poll far more often than needed; an explicit hint is polite.
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    ...events,
    'END:VCALENDAR',
  ];

  // CRLF throughout, and a trailing CRLF: some importers reject the last line
  // without it.
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
