import type { ChangeEvent as ReactChangeEvent } from 'react';
import type { ChangeEvent, EventType, Source } from '../lib/types';
import { EVENT_META, SOURCE_LABELS } from '../lib/types';
import { productOptions, hasActiveFilters, toggleFacet } from '../lib/filters';
import type { Filters } from '../lib/filters';

interface Props {
  events: ChangeEvent[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  resultCount: number;
}

export function FilterBar({ events, filters, onChange, resultCount }: Props) {
  const products = productOptions(events, 14);
  const sources = [...new Set(events.map((e) => e.source))];
  const types = [...new Set(events.map((e) => e.type))].sort(
    (a, b) => EVENT_META[a].weight - EVENT_META[b].weight,
  );

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <section className="filters" aria-label="Filters">
      <input
        className="filters__search"
        type="search"
        placeholder="Search features and products…"
        aria-label="Search features and products"
        value={filters.search}
        onChange={(e: ReactChangeEvent<HTMLInputElement>) => set({ search: e.target.value })}
      />

      {sources.length > 1 && (
        <div className="filters__row">
          <span className="filters__legend">Source</span>
          {sources.map((source: Source) => (
            <button
              key={source}
              type="button"
              className="chip"
              aria-pressed={filters.sources.includes(source)}
              onClick={() => set({ sources: toggleFacet(filters.sources, source) })}
            >
              {SOURCE_LABELS[source]}
            </button>
          ))}
        </div>
      )}

      <div className="filters__row">
        <span className="filters__legend">Change</span>
        {types.map((type: EventType) => (
          <button
            key={type}
            type="button"
            className="chip"
            aria-pressed={filters.types.includes(type)}
            onClick={() => set({ types: toggleFacet(filters.types, type) })}
          >
            {EVENT_META[type].label}
          </button>
        ))}
      </div>

      {products.length > 0 && (
        <div className="filters__row">
          <span className="filters__legend">Product</span>
          {products.map((product) => (
            <button
              key={product}
              type="button"
              className="chip"
              aria-pressed={filters.products.includes(product)}
              onClick={() => set({ products: toggleFacet(filters.products, product) })}
            >
              {product}
            </button>
          ))}
        </div>
      )}

      <div className="filters__row">
        <span className="filters__legend">Sort</span>
        <button
          type="button"
          className="chip"
          aria-pressed={filters.sort === 'recent'}
          onClick={() => set({ sort: 'recent' })}
        >
          Most recent
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={filters.sort === 'biggest'}
          onClick={() => set({ sort: 'biggest' })}
        >
          Biggest move
        </button>
        {hasActiveFilters(filters) && (
          <>
            <span className="filters__legend">
              {resultCount} {resultCount === 1 ? 'match' : 'matches'}
            </span>
            <button
              type="button"
              className="chip chip--clear"
              onClick={() => onChange({ search: '', types: [], sources: [], products: [], sort: filters.sort })}
            >
              Clear filters
            </button>
          </>
        )}
      </div>
    </section>
  );
}
