import { useEffect, useState } from 'react';
import type { ContradictionRegister, Contradiction } from '../lib/types';
import { CONTRADICTION_LABELS } from '../lib/types';
import { loadContradictions } from '../lib/data';
import { formatDate } from '../lib/format';
import { featureId } from '../../scripts/lib/links.mjs';

/**
 * Items whose own record disagrees with itself.
 *
 * Every row shows Microsoft's claim and Microsoft's contradiction of it side
 * by side. The page asserts nothing of its own — it only puts two of their
 * fields next to each other, which is the only way this stands up.
 */
export function ContradictionsPage({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; data: ContradictionRegister }
  >({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    loadContradictions(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    return () => controller.abort();
  }, []);

  const back = <button type="button" className="back" onClick={onBack}>← Back to the feed</button>;

  if (state.status === 'loading') {
    return (
      <div>
        {back}
        <div aria-busy="true" aria-label="Loading contradictions">
          <div className="skeleton" /><div className="skeleton" />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        {back}
        <div className="state">
          <p className="state__title">Could not load the contradictions register</p>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const { items, month, summary } = state.data;

  return (
    <div>
      {back}
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Contradictions</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 14 }}>
        Items whose roadmap entry disagrees with itself — as of {formatDate(month)}.
        Both halves of every row are Microsoft's own; this page only sets them
        side by side.
      </p>

      {items.length === 0 ? (
        <div className="state">
          <p className="state__title">Nothing contradictory right now</p>
          <p>Microsoft's roadmap is internally consistent today. It does not always stay that way.</p>
        </div>
      ) : (
        <>
          <div className="tiles">
            {Object.entries(summary.byKind).map(([kind, count]) => (
              <div key={kind} className="tile tone-slip">
                <div className="tile__value">{count}</div>
                <div className="tile__label">
                  {CONTRADICTION_LABELS[kind as Contradiction['kind']] ?? kind}
                </div>
              </div>
            ))}
          </div>

          <div>
            {items.map((item) => (
              <div className="event" key={`${item.id}-${item.kind}`}>
                <h3 className="event__title">{item.title}</h3>
                <div className="event__meta">
                  <span className="badge tone-slip">{CONTRADICTION_LABELS[item.kind] ?? item.kind}</span>
                  {item.products.slice(0, 3).map((p) => (
                    <span key={p} className="event__product">{p}</span>
                  ))}
                  <span className="event__id">#{featureId(item.id)}</span>
                </div>
                <p className="contradiction">
                  <span className="contradiction__claim">{item.claim}</span>
                  <span className="contradiction__vs">but</span>
                  <span className="contradiction__evidence">{item.evidence}</span>
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ContradictionsPage;
