import { CATEGORY_LABELS } from '../../shared/lib/format.js';
import { activeFilterCount } from './state/filtersReducer.js';

export function EventFilters({ filters, dispatch, clubs = [] }) {
  return (
    <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
      <input
        className="input filters__search"
        type="search"
        placeholder="Search events…"
        value={filters.q}
        maxLength={60}
        onChange={(e) => dispatch({ type: 'search', value: e.target.value })}
        aria-label="Search events by title"
      />
      <select className="input" value={filters.clubId} onChange={(e) => dispatch({ type: 'club', value: e.target.value })} aria-label="Club">
        <option value="">All clubs</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select className="input" value={filters.availability} onChange={(e) => dispatch({ type: 'availability', value: e.target.value })} aria-label="Availability">
        <option value="">Any availability</option>
        <option value="open">Seats available</option>
        <option value="full">Full (waitlist)</option>
      </select>
      <select className="input" value={filters.sort} onChange={(e) => dispatch({ type: 'sort', value: e.target.value })} aria-label="Sort by">
        <option value="soonest">Soonest first</option>
        <option value="latest">Latest first</option>
        <option value="popular">Most popular</option>
      </select>
      <div className="chips" role="group" aria-label="Category">
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={`chip ${filters.category === value ? 'chip--active' : ''}`}
            aria-pressed={filters.category === value}
            onClick={() => dispatch({ type: 'toggleCategory', value })}
          >
            {label}
          </button>
        ))}
        {activeFilterCount(filters) > 0 && (
          <button type="button" className="chip chip--clear" onClick={() => dispatch({ type: 'reset' })}>
            Clear filters
          </button>
        )}
      </div>
    </form>
  );
}
