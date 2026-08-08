import type { UpdateNote } from '../lib/types';
import { formatDate } from '../lib/format';

/**
 * Microsoft's own words, quoted and attributed.
 *
 * This is the strongest thing the site can show. Everywhere else the page says
 * what *we* concluded from comparing two snapshots; here Microsoft says it
 * themselves, on a date they chose. Presented as a quotation with attribution
 * so there is no ambiguity about who is speaking — the reader should never
 * have to wonder whether a sentence is ours or theirs.
 *
 * The date shown is Microsoft's, not ours: it is when *they* say the change
 * happened, which can precede the run that noticed it.
 */
export function MicrosoftNote({ note }: { note: UpdateNote | null | undefined }) {
  if (!note?.text) return null;

  // Microsoft's own rendering is the fallback, typos included ("Augut 7, 2026")
  // — quoting a source means not silently tidying it.
  const when = note.date ? formatDate(note.date) : note.dateRaw;

  return (
    <blockquote className="msnote">
      <p className="msnote__text">“{note.text}”</p>
      <cite className="msnote__cite">
        — Microsoft{when ? `, ${when}` : ''}
      </cite>
    </blockquote>
  );
}
