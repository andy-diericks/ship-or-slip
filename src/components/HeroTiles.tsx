import type { ChangeEvent, EventType } from '../lib/types';
import { EVENT_META } from '../lib/types';

interface Props {
  events: ChangeEvent[];
  selected: EventType[];
  onToggle: (type: EventType) => void;
}

/**
 * The headline counts, one tile per event type present in the window.
 *
 * Tiles double as filters — the number you just read is the set you get when
 * you click it, which is the shortest path from "12 slipped" to "which 12?".
 * Types with no events are omitted rather than shown as zero.
 */
export function HeroTiles({ events, selected, onToggle }: Props) {
  const counts = new Map<EventType, number>();
  for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);

  const tiles = [...counts.entries()].sort(
    (a, b) => EVENT_META[a[0]].weight - EVENT_META[b[0]].weight,
  );

  if (!tiles.length) return null;

  return (
    <div className="tiles" role="group" aria-label="Change summary">
      {tiles.map(([type, count]) => {
        const meta = EVENT_META[type];
        const isSelected = selected.includes(type);
        return (
          <button
            key={type}
            type="button"
            className={`tile tone-${meta.tone}`}
            aria-pressed={isSelected}
            onClick={() => onToggle(type)}
          >
            <div className="tile__value">{count}</div>
            <div className="tile__label">{meta.label}</div>
          </button>
        );
      })}
    </div>
  );
}
