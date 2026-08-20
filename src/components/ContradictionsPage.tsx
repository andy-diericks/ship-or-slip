import { useEffect, useState } from 'react';
import type { ContradictionRegister, Contradiction, Timeline } from '../lib/types';
import { CONTRADICTION_LABELS } from '../lib/types';
import { loadContradictions } from '../lib/data';
import { formatDate } from '../lib/format';
import { featureId } from '../../scripts/lib/links.mjs';
import { RowDetails } from './RowDetails';
import { RegisterFilterBar } from './RegisterFilterBar';
import {
  applyRegisterFilter, registerProducts, registerFacet, EMPTY_REGISTER_FILTER,
} from '../lib/registerFilter';
import type { RegisterFilter } from '../lib/registerFilter';

/**
 * Items whose own record disagrees with itself.
 *
 * Every row shows Microsoft's claim and Microsoft's contradiction of it side
 * by side. The page asserts nothing of its own — it only puts two of their
 * fields next to each other, which is the only way this stands up.
 */
export function ContradictionsPage({
  onBack,
  timelines,
  onOpenItem,
}: {
  onBack: () => void;
  timelines: Record<string, Timeline>;
  onOpenItem: (id: string) => void;
}) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; data: ContradictionRegister }
  >({ status: 'loading' });
  const [filter, setFilter] = useState<RegisterFilter>(EMPTY_REGISTER_FILTER);
  // Kept local rather than added to the shared RegisterFilter: `kind` exists
  // only on this register, and widening the shared shape for it would put a
  // dead field on the overdue page.
  const [kind, setKind] = useState<Contradiction['kind'] | null>(null);

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
  const visible = applyRegisterFilter(items, filter)
    .filter((item) => !kind || item.kind === kind);

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
          {/* Tiles double as filters, exactly as on the feed: the number you
              just read is the set you get when you click it. Counts come from
              the unfiltered summary so the tiles do not renumber under the
              reader as they narrow. */}
          <div className="tiles" role="group" aria-label="Filter by contradiction kind">
            {Object.entries(summary.byKind).map(([tileKind, count]) => {
              const selected = kind === tileKind;
              return (
                <button
                  key={tileKind}
                  type="button"
                  className="tile tone-slip"
                  aria-pressed={selected}
                  onClick={() =>
                    setKind(selected ? null : (tileKind as Contradiction['kind']))}
                >
                  <div className="tile__value">{count}</div>
                  <div className="tile__label">
                    {CONTRADICTION_LABELS[tileKind as Contradiction['kind']] ?? tileKind}
                  </div>
                </button>
              );
            })}
          </div>

          {/* The search and product bar is only worth showing once the
              register is big enough to hide something; at five rows it would
              be noise. The kind tiles above carry the filtering until then.

              Still no status chips: `kind` is not `status`, and a chip that
              filtered nothing would be worse than no chip. */}
          {items.length > 8 && (
            <RegisterFilterBar
              filter={filter}
              onChange={setFilter}
              products={registerProducts(items)}
              statuses={[]}
              resultCount={visible.length}
              totalCount={items.length}
              clouds={registerFacet(items, 'clouds')}
              platforms={registerFacet(items, 'platforms')}
              searchLabel="Search contradictions…"
            />
          )}

          {visible.length !== items.length && (
            <div className="filters__row" role="status">
              <span className="filters__legend">
                Showing {visible.length} of {items.length}
                {kind ? ` — ${CONTRADICTION_LABELS[kind]}` : ''}
              </span>
              <button
                type="button"
                className="chip chip--clear"
                onClick={() => { setKind(null); setFilter(EMPTY_REGISTER_FILTER); }}
              >
                Clear filters
              </button>
            </div>
          )}

          <div>
            {visible.map((item) => (
              <ContradictionRow
                key={`${item.id}-${item.kind}`}
                item={item}
                hasTimeline={Boolean(timelines[item.id])}
                onOpenTimeline={() => onOpenItem(item.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ContradictionRow({
  item,
  hasTimeline,
  onOpenTimeline,
}: {
  item: Contradiction;
  hasTimeline: boolean;
  onOpenTimeline: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `contradiction-${item.id.replace(/[^a-z0-9]/gi, '-')}-${item.kind}`;

  return (
    <div className={open ? 'event event--open' : 'event'}>
      <h3 className="event__title">
        <button
          type="button"
          className="event__link"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <span className="event__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
          {item.title}
        </button>
      </h3>
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

      {open && (
        <div id={panelId} className="event__panel">
          <RowDetails
            id={item.id}
            source={item.source}
            products={item.products}
            note={item.note}
            hasTimeline={hasTimeline}
            onOpenTimeline={onOpenTimeline}
            facts={[
              { label: 'What the roadmap says', value: item.claim },
              { label: 'What contradicts it', value: item.evidence },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default ContradictionsPage;
