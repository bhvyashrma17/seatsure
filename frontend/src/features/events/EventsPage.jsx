import { useCallback, useMemo, useReducer } from 'react';
import { EmptyState, ErrorState, Spinner } from '../../shared/components/Feedback.jsx';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js';
import { useIntersectionObserver } from '../../shared/hooks/useIntersectionObserver.js';
import { EventCard } from './EventCard.jsx';
import { EventFilters } from './EventFilters.jsx';
import { useClubs, useEventsInfinite } from './hooks/useEvents.js';
import { filtersReducer, initialFilters, toQueryParams } from './state/filtersReducer.js';

export default function EventsPage() {
  const [filters, dispatch] = useReducer(filtersReducer, initialFilters);
  const debouncedQ = useDebouncedValue(filters.q, 300);
  const { clubId, category, availability, sort } = filters;

  // [FULLSTACK M1.7: useMemo] A stable params object -> a stable query key -> no accidental refetches.
  const params = useMemo(() => toQueryParams({ clubId, category, availability, sort, q: debouncedQ.trim() }), [clubId, category, availability, sort, debouncedQ]);

  const { data: clubs } = useClubs();
  const { data, error, isPending, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage, refetch } = useEventsInfinite(params);
  const events = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

  // [FULLSTACK M3.11: Infinite scroll] When the sentinel below the grid becomes visible, load the next page.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const sentinelRef = useIntersectionObserver(loadMore, { enabled: Boolean(hasNextPage) });

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>Upcoming events</h1>
          <p className="lead">Register in one click. Seats are guaranteed; when an event is full you join a fair, first-come waitlist.</p>
        </div>
        {isFetching && !isPending && <span className="pill pill--live">Updating…</span>}
      </header>

      <EventFilters filters={filters} dispatch={dispatch} clubs={clubs} />

      {isPending ? (
        <Spinner label="Loading events" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : events.length === 0 ? (
        <EmptyState title="No events match these filters">Try another club or category.</EmptyState>
      ) : (
        <>
          <div className="grid grid--cards" data-testid="event-grid">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          <div ref={sentinelRef} className="sentinel" aria-hidden="true" />
          {hasNextPage ? (
            <div className="center">
              <button className="btn btn--ghost" onClick={loadMore} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </button>
            </div>
          ) : (
            <p className="center muted small">You have reached the end · {events.length} events</p>
          )}
        </>
      )}
    </section>
  );
}
