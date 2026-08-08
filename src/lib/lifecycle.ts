import type { EventContext, EventType } from './types';
import { formatDate } from './format';

/**
 * How far a feature had actually got when something happened to it.
 *
 * "Cancelled" on its own is ambiguous: abandoned before anyone saw it, or
 * killed after a public preview had been available for four months? Microsoft's
 * own card shows "PREVIEW AVAILABLE April 2026" next to a cancellation notice
 * and lets the reader work it out. This makes it explicit.
 */
export type Reach = 'preview' | 'scheduled' | 'unknown';

/** Events where how far it got is the interesting part. */
const LOSS_TYPES = new Set<EventType>(['cancelled', 'dropped']);

/**
 * Had the preview date passed by the time this happened?
 *
 * Compared at month precision, because that is all the roadmap publishes. A
 * preview month equal to the event month counts as reached — Microsoft labels
 * that date "Preview available", not "preview begins some time that month".
 */
export function reachedPreview(
  context: EventContext | null | undefined,
  atIso: string,
): Reach {
  if (!context?.preview) return 'unknown';
  const at = String(atIso).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(at)) return 'unknown';
  return context.preview <= at ? 'preview' : 'scheduled';
}

/**
 * A one-line summary of where the feature stood.
 *
 * Deliberately restates Microsoft's own labels rather than inventing our own:
 * they call the preview date "Preview available" and the availability date
 * "Rollout start", so those are the words used here. Paraphrasing a source
 * into different terminology is how small misrepresentations start.
 */
export function describeContext(
  context: EventContext | null | undefined,
  type: EventType,
  atIso: string,
): { lead: string | null; parts: string[] } {
  if (!context) return { lead: null, parts: [] };

  // The lead only appears where it changes the meaning of the event. A slip
  // that happens to have a preview date does not need editorialising.
  let lead: string | null = null;
  if (LOSS_TYPES.has(type)) {
    const reach = reachedPreview(context, atIso);
    if (reach === 'preview') {
      lead = `Preview had been available since ${formatDate(context.preview)}`;
    } else if (reach === 'scheduled') {
      lead = `Preview was scheduled for ${formatDate(context.preview)}`;
    }
  }

  const parts: string[] = [];
  // The lead already states the preview date; repeating it as a bare fact
  // reads as a stutter.
  if (context.preview && !lead) parts.push(`Preview available ${formatDate(context.preview)}`);
  if (context.ga) parts.push(`Rollout start ${formatDate(context.ga)}`);
  if (context.phases?.length) parts.push(`Phases: ${context.phases.join(', ')}`);

  return { lead, parts };
}
