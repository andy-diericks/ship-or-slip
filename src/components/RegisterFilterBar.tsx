import type { ChangeEvent } from 'react';
import type { RegisterFilter } from '../lib/registerFilter';
import { hasRegisterFilter, toggleProduct, EMPTY_REGISTER_FILTER } from '../lib/registerFilter';

/**
 * Search, product and status controls shared by both registers.
 *
 * Deliberately the same shapes and behaviour as the main feed's filter bar —
 * chips that toggle, a search box that matches titles and products — so the
 * registers do not have to be learned as a separate interface.
 */
export function RegisterFilterBar({
  filter,
  onChange,
  products,
  statuses,
  clouds = [],
  platforms = [],
  resultCount,
  totalCount,
  searchLabel,
}: {
  filter: RegisterFilter;
  onChange: (next: RegisterFilter) => void;
  products: string[];
  statuses: [string, number][];
  clouds?: string[];
  platforms?: string[];
  resultCount: number;
  totalCount: number;
  searchLabel: string;
}) {
  const set = (patch: Partial<RegisterFilter>) => onChange({ ...filter, ...patch });

  return (
    <section className="filters" aria-label="Filter the register">
      <input
        className="filters__search"
        type="search"
        placeholder={searchLabel}
        aria-label={searchLabel}
        value={filter.search}
        onChange={(e: ChangeEvent<HTMLInputElement>) => set({ search: e.target.value })}
      />

      {statuses.length > 1 && (
        <div className="filters__row">
          <span className="filters__legend">Status</span>
          {statuses.map(([status, count]) => (
            <button
              key={status}
              type="button"
              className="chip"
              aria-pressed={filter.status === status}
              onClick={() => set({ status: filter.status === status ? null : status })}
            >
              {status} ({count})
            </button>
          ))}
        </div>
      )}

      {/* The tenant facets lead, because "does this affect me?" is asked before
          "which product is it?" by anyone who runs an estate. */}
      {clouds.length > 1 && (
        <div className="filters__row">
          <span className="filters__legend">Cloud</span>
          {clouds.map((cloud) => (
            <button
              key={cloud}
              type="button"
              className="chip"
              aria-pressed={filter.clouds.includes(cloud)}
              onClick={() => set({ clouds: toggleProduct(filter.clouds, cloud) })}
            >
              {cloud}
            </button>
          ))}
        </div>
      )}

      {platforms.length > 1 && (
        <div className="filters__row">
          <span className="filters__legend">Platform</span>
          {platforms.map((platform) => (
            <button
              key={platform}
              type="button"
              className="chip"
              aria-pressed={filter.platforms.includes(platform)}
              onClick={() => set({ platforms: toggleProduct(filter.platforms, platform) })}
            >
              {platform}
            </button>
          ))}
        </div>
      )}

      {products.length > 0 && (
        <div className="filters__row">
          <span className="filters__legend">Product</span>
          {products.map((product) => (
            <button
              key={product}
              type="button"
              className="chip"
              aria-pressed={filter.products.includes(product)}
              onClick={() => set({ products: toggleProduct(filter.products, product) })}
            >
              {product}
            </button>
          ))}
        </div>
      )}

      <div className="filters__row">
        <span className="filters__legend">
          Showing {resultCount} of {totalCount}
        </span>
        {hasRegisterFilter(filter) && (
          <button
            type="button"
            className="chip chip--clear"
            onClick={() => onChange(EMPTY_REGISTER_FILTER)}
          >
            Clear filters
          </button>
        )}
      </div>
    </section>
  );
}
