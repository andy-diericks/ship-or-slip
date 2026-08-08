import type { ChangeEvent } from '../lib/types';
import { EVENT_META, SOURCE_LABELS } from '../lib/types';
import { formatDate, formatMagnitude, formatDay } from '../lib/format';
import { featureId } from '../../scripts/lib/links.mjs';
import { MicrosoftNote } from './MicrosoftNote';

/** Group consecutive events by the UTC day they were detected. */
export function groupByDay(events: ChangeEvent[]): { day: string; events: ChangeEvent[] }[] {
  const groups: { day: string; events: ChangeEvent[] }[] = [];
  for (const event of events) {
    const day = event.ts.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}

function EventRow({ event, onOpen }: { event: ChangeEvent; onOpen: (id: string) => void }) {
  const meta = EVENT_META[event.type];
  const magnitude = formatMagnitude(event);
  // A rename's from/to are titles, not dates. Rendering them through the date
  // formatter would technically work — it passes unparseable values through —
  // but two full titles either side of an arrow is unreadable. The heading
  // already carries the new title, so only the old one needs showing.
  const isRename = event.type === 'renamed';
  // Scope events carry tag lists in from/to, not dates. `fromRaw` holds the
  // summary that matters ("Clouds lost: GCC High") — the full before/after
  // lists are context, so they follow it rather than lead.
  const isScope = event.type === 'scope_reduced' || event.type === 'scope_expanded';
  const showsMove = !isRename && !isScope && (event.from != null || event.to != null);

  // The card is a div, not a button. A button may only contain phrasing
  // content, so the heading and the quoted note would both be invalid inside
  // one — and a screen reader would lose the heading structure entirely. The
  // title carries the real control; the card forwards clicks for the mouse.
  return (
    <div className="event" onClick={() => onOpen(event.id)}>
      <h3 className="event__title">
        <button type="button" className="event__link" onClick={() => onOpen(event.id)}>
          {event.title}
        </button>
      </h3>

      {magnitude && (
        <span className={`event__magnitude tone-${meta.tone}`}>{magnitude}</span>
      )}

      <div className="event__meta">
        <span className={`badge tone-${meta.tone}`}>{meta.label}</span>

        {isRename && event.from && (
          <span className="event__was">was “{event.from}”</span>
        )}

        {isScope && (
          <>
            {event.fromRaw && (
              <span className={`event__scope tone-${meta.tone}`}>{event.fromRaw}</span>
            )}
            <span className="event__move">
              {event.from}
              <span className="event__arrow"> → </span>
              {event.to}
            </span>
          </>
        )}

        {showsMove && (
          <span className="event__move">
            {formatDate(event.from)}
            <span className="event__arrow"> → </span>
            {formatDate(event.to)}
          </span>
        )}

        <span>{SOURCE_LABELS[event.source]}</span>

        {event.products.slice(0, 3).map((product) => (
          <span key={product} className="event__product">{product}</span>
        ))}

        <span className="event__id" title="Microsoft's own id for this item">
          #{featureId(event.id)}
        </span>
      </div>

      <MicrosoftNote note={event.note} />
    </div>
  );
}

interface Props {
  events: ChangeEvent[];
  onOpen: (id: string) => void;
  grouped?: boolean;
}

export function EventFeed({ events, onOpen, grouped = true }: Props) {
  if (!events.length) {
    return (
      <div className="state">
        <p className="state__title">Nothing matches those filters</p>
        <p>Try clearing a facet, or widening the search.</p>
      </div>
    );
  }

  // Sorting by magnitude deliberately breaks the day grouping — the whole point
  // of that view is to rank across the window, not within a day.
  if (!grouped) {
    return (
      <div>
        {events.map((event) => (
          <EventRow key={`${event.id}-${event.type}-${event.ts}`} event={event} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {groupByDay(events).map((group) => (
        <section key={group.day}>
          <h2 className="feed__day">{formatDay(group.day)}</h2>
          {group.events.map((event) => (
            <EventRow key={`${event.id}-${event.type}-${event.ts}`} event={event} onOpen={onOpen} />
          ))}
        </section>
      ))}
    </div>
  );
}
