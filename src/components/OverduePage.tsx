import { useEffect, useState } from 'react';
import type { OverdueRegister, OverdueItem, Timeline } from '../lib/types';
import { loadOverdue } from '../lib/data';
import { formatDate } from '../lib/format';
import { featureId } from '../../scripts/lib/links.mjs';
import { RowDetails } from './RowDetails';
import { RegisterFilterBar } from './RegisterFilterBar';
import {
  applyRegisterFilter, registerProducts, registerFacet, EMPTY_REGISTER_FILTER,
} from '../lib/registerFilter';
import type { RegisterFilter } from '../lib/registerFilter';

/**
 * The overdue register.
 *
 * The plainest evidence the site has: features whose promised month has passed
 * while they sit unshipped. Microsoft's roadmap shows the same items with the
 * same stale dates and no indication anything is amiss.
 *
 * Loaded on demand rather than with the dashboard — it is by far the largest
 * file, and most visits never open it.
 */
export function OverduePage({
  onBack,
  timelines,
  onOpenItem,
}: {
  onBack: () => void;
  timelines: Record<string, Timeline>;
  onOpenItem: (id: string) => void;
}) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: OverdueRegister }
  >({ status: 'loading' });
  const [filter, setFilter] = useState<RegisterFilter>(EMPTY_REGISTER_FILTER);

  useEffect(() => {
    const controller = new AbortController();
    loadOverdue(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      });
    return () => controller.abort();
  }, []);

  const back = (
    <button type="button" className="back" onClick={onBack}>← Back to the feed</button>
  );

  if (state.status === 'loading') {
    return (
      <div>
        {back}
        <div aria-busy="true" aria-label="Loading the overdue register">
          <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        {back}
        <div className="state">
          <p className="state__title">Could not load the overdue register</p>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const { summary, items, month } = state.data;
  const statuses = Object.entries(summary.byStatus).sort((a, b) => b[1] - a[1]);
  const visible = applyRegisterFilter(items, filter);
  const products = registerProducts(items);

  return (
    <div>
      {back}

      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Overdue</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 14 }}>
        Features whose rollout month has passed without them shipping or being
        cancelled, as of {formatDate(month)}. Microsoft still lists these with
        the same dates.
      </p>

      <div className="tiles">
        <div className="tile tone-slip">
          <div className="tile__value">{summary.count}</div>
          <div className="tile__label">Overdue ({summary.share}% of tracked)</div>
        </div>
        <div className="tile tone-slip">
          <div className="tile__value">{summary.stillInDevelopment}</div>
          <div className="tile__label">Still in development</div>
        </div>
        <div className="tile tone-drop">
          <div className="tile__value">{summary.worstMonthsLate}</div>
          <div className="tile__label">Months late, worst case</div>
        </div>
      </div>

      <RegisterFilterBar
        filter={filter}
        onChange={setFilter}
        products={products}
        statuses={statuses}
        resultCount={visible.length}
        totalCount={items.length}
        clouds={registerFacet(items, 'clouds')}
        platforms={registerFacet(items, 'platforms')}
        searchLabel="Search overdue features and products…"
      />

      {visible.length === 0 && (
        <div className="state">
          <p className="state__title">Nothing matches those filters</p>
          <p>Try clearing a facet, or widening the search.</p>
        </div>
      )}

      <div>
        {visible.map((item) => (
          <OverdueRow
            key={item.id}
            item={item}
            hasTimeline={Boolean(timelines[item.id])}
            onOpenTimeline={() => onOpenItem(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function OverdueRow({
  item,
  hasTimeline,
  onOpenTimeline,
}: {
  item: OverdueItem;
  hasTimeline: boolean;
  onOpenTimeline: () => void;
}) {
  const [open, setOpen] = useState(false);
  const years = item.monthsLate >= 12;
  const panelId = `overdue-${item.id.replace(/[^a-z0-9]/gi, '-')}`;

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
      <span className={`event__magnitude ${years ? 'tone-slip' : 'tone-drop'}`}>
        {item.monthsLate} {item.monthsLate === 1 ? 'month' : 'months'} late
      </span>
      <div className="event__meta">
        <span className="badge tone-slip">{item.status ?? 'Unknown'}</span>
        <span className="event__move">Due {formatDate(item.due)}</span>
        {item.products.slice(0, 3).map((p) => (
          <span key={p} className="event__product">{p}</span>
        ))}
        <span className="event__id">#{featureId(item.id)}</span>
      </div>

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
              { label: 'Promised for', value: item.dueRaw ?? formatDate(item.due) },
              { label: 'How late', value: `${item.monthsLate} months` },
              { label: 'Current status', value: item.status ?? 'Unknown' },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default OverduePage;
