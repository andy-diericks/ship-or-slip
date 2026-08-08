import { describe, it, expect } from 'vitest';
import { reachedPreview, describeContext } from './lifecycle';
import type { EventContext } from './types';

const context = (overrides: Partial<EventContext> = {}): EventContext => ({
  ga: '2026-07',
  gaRaw: 'July CY2026',
  preview: '2026-04',
  previewRaw: 'April CY2026',
  phases: ['General Availability', 'Preview'],
  status: 'In development',
  ...overrides,
});

const AUG = '2026-08-08T09:00:00.000Z';

describe('reachedPreview', () => {
  it('is reached when the preview month has passed', () => {
    expect(reachedPreview(context(), AUG)).toBe('preview');
  });

  it('counts the preview month itself as reached', () => {
    // Microsoft labels this date "Preview available", not "preview starts
    // some time during that month".
    expect(reachedPreview(context({ preview: '2026-08' }), AUG)).toBe('preview');
  });

  it('is merely scheduled when the preview is still ahead', () => {
    expect(reachedPreview(context({ preview: '2026-11' }), AUG)).toBe('scheduled');
  });

  it('is unknown without a preview date', () => {
    expect(reachedPreview(context({ preview: null }), AUG)).toBe('unknown');
    expect(reachedPreview(null, AUG)).toBe('unknown');
  });

  it('is unknown for an unparseable timestamp rather than guessing', () => {
    expect(reachedPreview(context(), 'nonsense')).toBe('unknown');
  });
});

describe('describeContext', () => {
  it('leads with how far a cancelled feature actually got', () => {
    const { lead } = describeContext(context(), 'cancelled', AUG);
    expect(lead).toBe('Preview had been available since April 2026');
  });

  it('distinguishes a cancellation before the preview ever landed', () => {
    const { lead } = describeContext(context({ preview: '2026-11' }), 'cancelled', AUG);
    expect(lead).toBe('Preview was scheduled for November 2026');
  });

  it('treats a drop the same as a cancellation', () => {
    expect(describeContext(context(), 'dropped', AUG).lead).toMatch(/had been available/);
  });

  it('does not editorialise on a slip', () => {
    // A slip that happens to have a preview date needs no commentary.
    expect(describeContext(context(), 'slipped', AUG).lead).toBeNull();
  });

  it("restates Microsoft's own labels rather than inventing terminology", () => {
    const { parts } = describeContext(context(), 'slipped', AUG);
    expect(parts).toEqual([
      'Preview available April 2026',
      'Rollout start July 2026',
      'Phases: General Availability, Preview',
    ]);
  });

  it('does not repeat the preview date the lead already stated', () => {
    const { lead, parts } = describeContext(context(), 'cancelled', AUG);
    expect(lead).toContain('April 2026');
    expect(parts.some((p) => p.startsWith('Preview available'))).toBe(false);
    expect(parts).toEqual(['Rollout start July 2026', 'Phases: General Availability, Preview']);
  });

  it('omits fields Microsoft did not publish', () => {
    const { parts } = describeContext(
      context({ preview: null, previewRaw: null, phases: null }),
      'cancelled',
      AUG,
    );
    expect(parts).toEqual(['Rollout start July 2026']);
  });

  it('returns nothing when there is no context at all', () => {
    expect(describeContext(null, 'cancelled', AUG)).toEqual({ lead: null, parts: [] });
    expect(describeContext(undefined, 'slipped', AUG)).toEqual({ lead: null, parts: [] });
  });

  it('gives no lead when a cancelled item has no preview date', () => {
    expect(describeContext(context({ preview: null }), 'cancelled', AUG).lead).toBeNull();
  });
});
