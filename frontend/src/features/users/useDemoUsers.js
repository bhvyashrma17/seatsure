import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '../../services/catalogApi.js';
import { queryKeys } from '../../shared/lib/queryKeys.js';

export function useDemoUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: catalogApi.users, staleTime: 10 * 60_000, select: (res) => res.data });
}
