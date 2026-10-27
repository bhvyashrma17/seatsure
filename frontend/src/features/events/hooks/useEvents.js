// [FULLSTACK M2.11: Custom API hooks] All TanStack Query logic for events lives here, so components just
// call useEventsInfinite(filters) / useEvent(id) / useRegister(id).
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '../../../services/catalogApi.js';
import { eventsApi } from '../../../services/eventsApi.js';
import { registrationsApi } from '../../../services/registrationsApi.js';
import { queryKeys } from '../../../shared/lib/queryKeys.js';
import { useCurrentUser } from '../../users/index.js';

/**
 * [FULLSTACK M3.9: Cursor pagination with useInfiniteQuery] Each page is fetched with the previous page's
 * nextCursor; the hook keeps every loaded page so the list can grow as the user scrolls.
 */
export function useEventsInfinite(params) {
  return useInfiniteQuery({
    queryKey: queryKeys.events.list(params),
    queryFn: ({ pageParam }) => eventsApi.list(params, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
    // [FULLSTACK M2.4 + M3.12: Freshness] Catalogue data may be 15 s old; seat counts refresh every 30 s.
    staleTime: 15_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData, // keep showing old results while new filters load
  });
}

/** One event. Polled every 5 s so "seats left" is live while someone is deciding. */
export function useEvent(eventId) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.events.detail(eventId, userId),
    queryFn: () => eventsApi.get(eventId),
    select: (res) => res.data,
    staleTime: 3_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useEventActivity(eventId) {
  return useQuery({
    queryKey: queryKeys.events.activity(eventId),
    queryFn: () => eventsApi.activity(eventId),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useClubs() {
  return useQuery({ queryKey: queryKeys.clubs, queryFn: catalogApi.clubs, select: (r) => r.data, staleTime: 10 * 60_000 });
}

export function useVenues() {
  return useQuery({ queryKey: queryKeys.venues, queryFn: catalogApi.venues, select: (r) => r.data, staleTime: 10 * 60_000 });
}

/**
 * [FULLSTACK M2.6: POST mutation + cache invalidation] After registering, refresh exactly the data that
 * changed: this event (seats, my status), catalogue lists (seat counts) and "My passes".
 */
export function useRegister(eventId) {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  return useMutation({
    mutationFn: (answers) => registrationsApi.register(eventId, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId, userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.me.registrations(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.activity(eventId) });
    },
  });
}
