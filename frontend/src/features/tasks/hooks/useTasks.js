// [FULLSTACK M2.11: Custom API hooks] for the tasks feature: one query (my tasks) and three mutations.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../../../services/tasksApi.js';
import { queryKeys } from '../../../shared/lib/queryKeys.js';
import { useCurrentUser } from '../../users/index.js';

export function useTasks() {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.me.tasks(userId),
    queryFn: tasksApi.list,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

/** [FULLSTACK M2.6: POST mutation] After a create, refetch the list so the server's order and ids are shown. */
export function useCreateTask() {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  return useMutation({
    mutationFn: (task) => tasksApi.create(task),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me.tasks(userId) }),
  });
}

/**
 * [FULLSTACK M2.7 + M2.8: PATCH mutation with an optimistic update] Ticking a task done (or saving an edit)
 * shows instantly; the snapshot comes back if the server refuses, and the list is refetched either way.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  const key = queryKeys.me.tasks(userId);
  return useMutation({
    mutationFn: ({ id, changes }) => tasksApi.update(id, changes),
    onMutate: async ({ id, changes }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) => (old ? { ...old, data: old.data.map((t) => (t.id === id ? { ...t, ...changes } : t)) } : old));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** [FULLSTACK M2.7: DELETE mutation] */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  return useMutation({
    mutationFn: (id) => tasksApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me.tasks(userId) }),
  });
}
