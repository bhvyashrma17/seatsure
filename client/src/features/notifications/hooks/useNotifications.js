import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '../../../services/catalogApi.js';
import { queryKeys } from '../../../shared/lib/queryKeys.js';
import { useCurrentUser } from '../../users/index.js';

// [FULLSTACK M3.12: Polling] The bell checks for new notifications every 15 s (and on window focus).
export function useNotifications() {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.me.notifications(userId),
    queryFn: catalogApi.notifications,
    enabled: Boolean(userId),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  return useMutation({
    mutationFn: catalogApi.markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me.notifications(userId) }),
  });
}
