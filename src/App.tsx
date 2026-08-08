import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, DataIndex, EventType, Timeline } from './lib/types';
import { loadDashboard, FEED_URL } from './lib/data';
import { applyFilters, queryToFilters, filtersToQuery, toggleFacet } from './lib/filters';
import type { Filters } from './lib/filters';
import { useRoute } from './lib/useRoute';
import { useTheme } from './lib/theme';
import { FreshnessBadge } from './components/FreshnessBadge';
import { HeroTiles } from './components/HeroTiles';
import { FilterBar } from './components/FilterBar';
import { EventFeed } from './components/EventFeed';
import { ItemPage } from './components/ItemPage';

// Recharts is the bundle's centre of gravity and the chart is below the fold,
// so it loads on its own rather than delaying the feed.
const ActivityChart = lazy(() => import('./components/ActivityChart'));
// The register is the largest thing the site serves and most visits never open
// it, so it stays out of the main bundle.
const OverduePage = lazy(() => import('./components/OverduePage'));

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: DataIndex; events: ChangeEvent[]; timelines: Record<string, Timeline> };

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [route, navigate] = useRoute();
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal)
      .then(({ index, events, timelines }) =>
        setState({ status: 'ready', index, events, timelines }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    return () => controller.abort();
  }, []);

  const filters = useMemo(() => queryToFilters(route.query), [route.query]);

  const setFilters = (next: Filters) => {
    const query = filtersToQuery(next);
    navigate(query ? `/?${query}` : '/', true);
  };

  const events = useMemo(
    () => (state.status === 'ready' ? state.events : []),
    [state],
  );
  const visible = useMemo(() => applyFilters(events, filters), [events, filters]);

  const header = (
    <header className="header">
      <div>
        <h1 className="header__title">
          <a href="#/" onClick={() => navigate('/')}>Ship or Slip</a>
        </h1>
        <p className="header__tagline">
          Every date Microsoft promised, and every date it moved.
        </p>
      </div>
      <div className="header__side">
        {state.status === 'ready' && (
          <FreshnessBadge generated={state.index.generated} warnings={state.index.warnings} />
        )}
        <button
          type="button"
          className="icon-button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );

  if (state.status === 'loading') {
    return (
      <div className="app">
        {header}
        <div aria-busy="true" aria-label="Loading changes">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="app">
        {header}
        <div className="state">
          <p className="state__title">Could not load the change history</p>
          <p>{state.message}</p>
          <p>
            The data lives on this repository's <code>data</code> branch. If the pipeline
            has not run yet, there is nothing to show.
          </p>
        </div>
      </div>
    );
  }

  if (route.name === 'item') {
    return (
      <div className="app">
        {header}
        <ItemPage
          id={route.id}
          timeline={state.timelines[route.id]}
          onBack={() => navigate('/')}
        />
      </div>
    );
  }

  if (route.name === 'overdue') {
    return (
      <div className="app">
        {header}
        <Suspense fallback={<div className="skeleton" />}>
          <OverduePage onBack={() => navigate('/')} />
        </Suspense>
      </div>
    );
  }

  const onToggleType = (type: EventType) =>
    setFilters({ ...filters, types: toggleFacet(filters.types, type) });

  return (
    <div className="app">
      {header}

      {state.index.overdue && state.index.overdue.count > 0 && (
        <a
          className="overdue-banner"
          href="#/overdue"
          onClick={() => navigate('/overdue')}
        >
          <strong>{state.index.overdue.count} features are past their promised date</strong>
          {' — '}
          {state.index.overdue.stillInDevelopment} still in development, worst{' '}
          {state.index.overdue.worstMonthsLate} months late. See the register →
        </a>
      )}

      {state.index.warnings.length > 0 && (
        <div className="warnings" role="status">
          {state.index.warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      )}

      {events.length === 0 ? (
        <div className="state">
          <p className="state__title">Watching, but nothing has moved yet</p>
          <p>
            The pipeline has taken its first snapshot of{' '}
            {Object.values(state.index.sources).reduce((n, s) => n + s.count, 0)} tracked items.
            Changes appear here as Microsoft makes them.
          </p>
        </div>
      ) : (
        <>
          <HeroTiles events={visible} selected={filters.types} onToggle={onToggleType} />
          <Suspense fallback={null}>
            <ActivityChart events={events} />
          </Suspense>
          <FilterBar
            events={events}
            filters={filters}
            onChange={setFilters}
            resultCount={visible.length}
          />
          <EventFeed
            events={visible}
            onOpen={(id) => navigate(`/item/${encodeURIComponent(id)}`)}
            grouped={filters.sort === 'recent'}
          />
        </>
      )}

      <footer className="footer">
        Tracking {Object.entries(state.index.sources)
          .map(([name, meta]) => `${meta.count} ${name === 'm365' ? 'Microsoft 365 roadmap items' : 'Azure retirements'}`)
          .join(' and ')}
        {' · '}last {state.index.recentDays} days shown
        {' · '}
        <a href={FEED_URL} target="_blank" rel="noreferrer">
          Atom feed
        </a>
        {' · '}
        <a href="https://github.com/andy-diericks/ship-or-slip" target="_blank" rel="noreferrer">
          source on GitHub
        </a>
      </footer>
    </div>
  );
}
