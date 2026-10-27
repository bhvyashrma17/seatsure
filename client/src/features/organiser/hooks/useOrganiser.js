// [FULLSTACK M2.11: Custom API hooks for the organiser feature]
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '../../../services/catalogApi.js';
import { eventsApi } from '../../../services/eventsApi.js';
import { registrationsApi } from '../../../services/registrationsApi.js';
import { queryKeys } from '../../../shared/lib/queryKeys.js';
import { useCurrentUser } from '../../users/index.js';

/** [FULLSTACK M3.8: Offset pagination] page/pageSize -> Prisma skip/take on the server. */
export function useMyClubEvents(params) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.events.mine(userId, params),
    queryFn: () => eventsApi.mine(params),
    placeholderData: keepPreviousData, // keep the old page visible while the next one loads
    enabled: Boolean(userId),
  });
}

export function useOrganiserEvent(eventId) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.events.detail(eventId, userId),
    queryFn: () => eventsApi.get(eventId),
    select: (r) => r.data,
    enabled: Boolean(eventId),
  });
}

function useInvalidateOrganiserViews() {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  return (eventId) => {
    queryClient.invalidateQueries({ queryKey: ['events', 'mine', userId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.events.lists() });
    if (eventId) queryClient.invalidateQueries({ queryKey: ['events', 'detail', Number(eventId)] });
  };
}

/** [FULLSTACK M2.6: POST mutation] */
export function useCreateEvent() {
  const invalidate = useInvalidateOrganiserViews();
  return useMutation({ mutationFn: eventsApi.create, onSuccess: () => invalidate() });
}

/** [FULLSTACK M2.7: PUT/PATCH mutation with selective invalidation] */
export function useUpdateEvent() {
  const invalidate = useInvalidateOrganiserViews();
  return useMutation({
    mutationFn: ({ eventId, changes }) => eventsApi.update(eventId, changes),
    onSuccess: (_res, { eventId }) => invalidate(eventId),
  });
}

/** [FULLSTACK M2.7: DELETE mutation] */
export function useDeleteEvent() {
  const invalidate = useInvalidateOrganiserViews();
  return useMutation({ mutationFn: (eventId) => eventsApi.remove(eventId), onSuccess: () => invalidate() });
}

export function useAttendees(eventId, params) {
  return useQuery({
    queryKey: queryKeys.events.attendees(eventId, params),
    queryFn: () => eventsApi.attendees(eventId, params),
    placeholderData: keepPreviousData,
  });
}

/** Check-in only refreshes this event's attendee pages, nothing else. */
export function useCheckIn(eventId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId) => registrationsApi.checkIn(registrationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.attendeesOf(eventId) }),
  });
}

export function useAnalyticsOverview(scope) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.analytics.overview(userId, scope),
    queryFn: () => catalogApi.analyticsOverview({ scope }),
    select: (r) => r.data,
    staleTime: 60_000,
    throwOnError: true, // let the analytics error boundary handle failures
  });
}

export function useAnalyticsActivity(scope) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.analytics.activity(userId, scope),
    queryFn: () => catalogApi.analyticsActivity({ scope }),
    select: (r) => r.data,
    staleTime: 30_000,
  });
}

/** Developer switch for the reliability demo: take MongoDB down / bring it back. */
export function useMongoSwitch() {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
    queryClient.invalidateQueries({ queryKey: ['me'] });
    queryClient.invalidateQueries({ queryKey: ['events', 'activity'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.health });
  };
  const outage = useMutation({ mutationFn: catalogApi.simulateMongoOutage, onSuccess: refresh });
  const restore = useMutation({ mutationFn: catalogApi.restoreMongo, onSuccess: refresh });
  const health = useQuery({ queryKey: queryKeys.health, queryFn: catalogApi.health, select: (r) => r.data, refetchInterval: 5_000 });
  return { outage, restore, health };
}
