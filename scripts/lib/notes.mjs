// Microsoft's own explanations.
//
// When Microsoft changes its mind about a feature it appends a line to the
// description: "Updated August 7, 2026: We have decided not to move forward
// with this change." That sentence is the primary source — it turns our claim
// that something was cancelled into Microsoft saying so, in their words, on a
// date they chose.
//
// Only the note is kept, not the whole description. Full descriptions across
// ~1,800 items would triple the snapshot for prose that never changes; the
// note is the part that carries news, and it averages about 100 characters.

import { parseRetirementDate } from './dates.mjs';

/** Microsoft's own phrasing, including the occasional typo ("Augut 7, 2026"). */
const UPDATE_NOTE = /Updated\s+([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})\s*:\s*([\s\S]+)$/;

/**
 * @typedef {object} UpdateNote
 * @property {string|null} date `YYYY-MM-DD`, when Microsoft says they changed it
 * @property {string} dateRaw   Microsoft's own rendering of that date
 * @property {string} text      What they said
 */

/**
 * Pull the trailing "Updated <date>: …" note out of a description.
 *
 * The *last* such note wins: Microsoft appends rather than replaces, so a
 * feature that has wobbled twice carries both, and the newest is the current
 * position.
 *
 * @param {string|null|undefined} description
 * @returns {UpdateNote|null}
 */
export function parseUpdateNote(description) {
  if (!description) return null;
  const text = String(description);

  // Find the last occurrence by walking matches from the left.
  let lastIndex = -1;
  const finder = /Updated\s+[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}\s*:/g;
  for (let m = finder.exec(text); m; m = finder.exec(text)) lastIndex = m.index;
  if (lastIndex === -1) return null;

  const match = UPDATE_NOTE.exec(text.slice(lastIndex));
  if (!match) return null;

  const dateRaw = match[1].trim();
  const note = match[2].replace(/\s+/g, ' ').trim();
  if (!note) return null;

  return {
    // parseRetirementDate matches month names on their first three letters,
    // which is why Microsoft's "Augut 7, 2026" still resolves.
    date: parseRetirementDate(dateRaw),
    dateRaw,
    text: note,
  };
}
