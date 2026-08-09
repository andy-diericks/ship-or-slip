import type { Source, UpdateNote } from '../lib/types';
import { SOURCE_LABELS } from '../lib/types';
import { featureId, sourceLink } from '../../scripts/lib/links.mjs';
import { MicrosoftNote } from './MicrosoftNote';

export interface Fact {
  label: string;
  value: string;
}

/**
 * The panel revealed when a register row is expanded.
 *
 * The registers are computed from the current snapshot, so most of their rows
 * describe items that have never *changed* and therefore have no recorded
 * timeline. Sending those to the item page would land the reader on "no
 * history recorded" — a dead end. Expanding in place shows what is actually
 * known, and offers the timeline only when one exists.
 */
export function RowDetails({
  id,
  source,
  products,
  facts,
  note,
  hasTimeline,
  onOpenTimeline,
}: {
  id: string;
  source: Source;
  products: string[];
  facts: Fact[];
  note?: UpdateNote | null;
  hasTimeline: boolean;
  onOpenTimeline: () => void;
}) {
  return (
    <div className="details">
      <dl className="details__facts">
        {facts.map((fact) => (
          <div className="details__fact" key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
        <div className="details__fact">
          <dt>Source</dt>
          <dd>{SOURCE_LABELS[source]}</dd>
        </div>
        <div className="details__fact">
          <dt>{source === 'azure' ? 'Update ID' : 'Roadmap ID'}</dt>
          <dd className="mono">{featureId(id)}</dd>
        </div>
        {products.length > 0 && (
          <div className="details__fact">
            <dt>Products</dt>
            <dd>{products.join(', ')}</dd>
          </div>
        )}
      </dl>

      <MicrosoftNote note={note} />

      <p className="details__links">
        <a href={sourceLink(id, source)} target="_blank" rel="noreferrer">
          Microsoft's page for this item ↗
        </a>
        {hasTimeline ? (
          <>
            {' · '}
            <button type="button" className="details__link-button" onClick={onOpenTimeline}>
              View recorded changes →
            </button>
          </>
        ) : (
          <span className="details__quiet">
            {' · '}No changes recorded since we started watching
          </span>
        )}
      </p>
    </div>
  );
}
