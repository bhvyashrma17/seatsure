// [FULLSTACK M2.3 + M2.10: QueryClient defaults + controlled retries]
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: true,
        // Retry only failures that a retry can fix: the network or a 5xx/503. Never retry 4xx
        // (a 404 or 409 will not change by asking again).
        retry: (failureCount, error) => failureCount < 2 && (error?.status === 0 || error?.status >= 500),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      },
      mutations: { retry: false },
    },
  });
}
