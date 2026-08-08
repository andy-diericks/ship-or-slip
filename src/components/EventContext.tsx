import type { EventContext as Context, EventType } from '../lib/types';
import { describeContext } from '../lib/lifecycle';

/**
 * Where the feature stood when the event happened.
 *
 * The `lead` is emphasised because on a cancellation it is the story — a
 * feature killed after months of public preview is a different event from one
 * abandoned before anyone saw it, and the bare word "Cancelled" hides that.
 */
export function EventContextLine({
  context,
  type,
  at,
}: {
  context: Context | null | undefined;
  type: EventType;
  at: string;
}) {
  const { lead, parts } = describeContext(context, type, at);
  if (!lead && parts.length === 0) return null;

  return (
    <p className="event__context">
      {lead && <strong className="event__reach">{lead}</strong>}
      {lead && parts.length > 0 && ' · '}
      {parts.join(' · ')}
    </p>
  );
}
