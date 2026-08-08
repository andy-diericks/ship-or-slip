import { describe, it, expect } from 'vitest';
import { parseUpdateNote } from './notes.mjs';

describe('parseUpdateNote', () => {
  it('extracts the note and the date Microsoft attached to it', () => {
    const note = parseUpdateNote(
      'Use the in-product migration tool. Updated August 7, 2026: We have decided not to move forward with this change. We apologize for any inconvenience.',
    );
    expect(note).toEqual({
      date: '2026-08-07',
      dateRaw: 'August 7, 2026',
      text: 'We have decided not to move forward with this change. We apologize for any inconvenience.',
    });
  });

  it("survives Microsoft's own typos", () => {
    // Feature 558683 really says "Augut 7, 2026". Month names are matched on
    // their first three letters, so this still resolves rather than being lost.
    const note = parseUpdateNote('Something. Augut is wrong but: Updated Augut 7, 2026: We stopped.');
    expect(note?.date).toBe('2026-08-07');
    expect(note?.dateRaw).toBe('Augut 7, 2026');
  });

  it('takes the LAST note — Microsoft appends rather than replaces', () => {
    const note = parseUpdateNote(
      'Base text. Updated June 2, 2026: We hit a problem. Updated August 7, 2026: We have cancelled it.',
    );
    expect(note?.text).toBe('We have cancelled it.');
    expect(note?.date).toBe('2026-08-07');
  });

  it('collapses whitespace in the quoted text', () => {
    expect(parseUpdateNote('x Updated May 1, 2026:  We   paused\n  this.')?.text)
      .toBe('We paused this.');
  });

  it('returns null for a description with no note', () => {
    expect(parseUpdateNote('Just an ordinary feature description.')).toBeNull();
    expect(parseUpdateNote('')).toBeNull();
    expect(parseUpdateNote(null)).toBeNull();
    expect(parseUpdateNote(undefined)).toBeNull();
  });

  it('returns null when the note has a date but no text', () => {
    expect(parseUpdateNote('Something. Updated August 7, 2026:   ')).toBeNull();
  });

  it('keeps the raw date even when it cannot be parsed', () => {
    const note = parseUpdateNote('x Updated Bogusmonth 7, 2026: We changed it.');
    expect(note?.text).toBe('We changed it.');
    expect(note?.date).toBeNull();
    expect(note?.dateRaw).toBe('Bogusmonth 7, 2026');
  });
});
