import type { ChangeEvent } from '../lib/types';
import { EVENT_META, SOURCE_LABELS } from '../lib/types';
import { formatDate, formatMagnitude, formatDay } from '../lib/format';

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
  const showsMove = !isRename && (event.from != null || event.to != null);

  return (
    <button type="button" className="event" onClick={() => onOpen(event.id)}>
      <h3 className="event__title">{event.title}</h3>

      {magnitude && (
        <span className={`event__magnitude tone-${meta.tone}`}>{magnitude}</span>
      )}

      <div className="event__meta">
        <span className={`badge tone-${meta.tone}`}>{meta.label}</span>

        {isRename && event.from && (
          <span className="event__was">was “{event.from}”</span>
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
      </div>
    </button>
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
