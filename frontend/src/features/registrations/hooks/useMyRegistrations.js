import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { registrationsApi } from '../../../services/registrationsApi.js';
import { queryKeys } from '../../../shared/lib/queryKeys.js';
import { useCurrentUser } from '../../users/index.js';

export function useMyRegistrations() {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.me.registrations(userId),
    queryFn: registrationsApi.mine,
    enabled: Boolean(userId),
    staleTime: 0, // passes change when *other* people cancel (promotion), so always revalidate
    refetchOnWindowFocus: true,
  });
}

/**
 * [FULLSTACK M2.8: Optimistic update] The pass flips to "Cancelled" instantly, before the server answers.
 *  onMutate  - pause refetches, snapshot the cache, write the optimistic version
 *  onError   - restore the snapshot (rollback) if the server refuses (e.g. 409 event started)
 *  onSettled - refetch so the cache matches the server either way
 * [FULLSTACK M2.7: Selective invalidation] Only my passes, this event and the catalogue lists are refreshed.
 */
export function useCancelRegistration() {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  const key = queryKeys.me.registrations(userId);

  return useMutation({
    mutationFn: ({ registrationId }) => registrationsApi.cancel(registrationId),
    onMutate: async ({ registrationId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) =>
        old
          ? {
              ...old,
              data: old.data.map((r) => (r.id === registrationId ? { ...r, status: 'CANCELLED', position: null, cancelledAt: new Date().toISOString() } : r)),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: (_data, _err, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: key });
      if (eventId) {
        queryClient.invalidateQueries({ queryKey: ['events', 'detail', Number(eventId)] });
        queryClient.invalidateQueries({ queryKey: queryKeys.events.activity(eventId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.events.lists() });
    },
  });
}
