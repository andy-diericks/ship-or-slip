import type { Timeline } from '../lib/types';
import { EVENT_META, SOURCE_LABELS } from '../lib/types';
import { formatDate, formatDay } from '../lib/format';

interface Props {
  id: string;
  timeline: Timeline | undefined;
  onBack: () => void;
}

/**
 * One feature's full recorded history.
 *
 * This is the page that justifies the project: Microsoft shows the current
 * date, and this shows every date it has been.
 */
export function ItemPage({ id, timeline, onBack }: Props) {
  if (!timeline) {
    return (
      <div>
        <button type="button" className="back" onClick={onBack}>← Back to the feed</button>
        <div className="state">
          <p className="state__title">No history recorded for this item</p>
          <p>
            Ship or Slip only has history from the moment it started watching. This item
            ({id}) has not moved since then.
          </p>
        </div>
      </div>
    );
  }

  const points = [...timeline.points].reverse();

  return (
    <div>
      <button type="button" className="back" onClick={onBack}>← Back to the feed</button>

      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{timeline.title}</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 14 }}>
        {SOURCE_LABELS[timeline.source]}
        {timeline.products.length > 0 && ` · ${timeline.products.join(', ')}`}
        {' · '}
        <a href={timeline.link} target="_blank" rel="noreferrer">
          Microsoft's page for this item
        </a>
      </p>

      <section className="panel">
        <h3 className="panel__title">
          {points.length} recorded {points.length === 1 ? 'change' : 'changes'}
        </h3>
        <ul className="timeline">
          {points.map((point) => {
            const meta = EVENT_META[point.type];
            return (
              <li key={`${point.ts}-${point.type}-${point.to}`} className="timeline__row">
                <span className="timeline__when">{formatDay(point.ts)}</span>
                <span>
                  <span className={`badge tone-${meta.tone}`}>{meta.label}</span>{' '}
                  {(point.from || point.to) && (
                    <span className="event__move">
                      {formatDate(point.from)}
                      <span className="event__arrow"> → </span>
                      {formatDate(point.to)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
