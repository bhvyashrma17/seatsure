// [FULLSTACK M1.4: Context API] Who is using the app is needed by the header, the event page, "My passes",
// the organiser area and the API client. Context provides it everywhere without prop drilling.
// (Real login is Module 4; here a demo user is chosen from a list and remembered in localStorage.)
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { catalogApi } from '../../services/catalogApi.js';
import { configureApiClient } from '../../services/apiClient.js';
import { queryKeys } from '../../shared/lib/queryKeys.js';

const STORAGE_KEY = 'seatsure.userId';
const CurrentUserContext = createContext(null);

function readStoredId() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function CurrentUserProvider({ children, initialUserId }) {
  const queryClient = useQueryClient();
  const [userId, setUserIdState] = useState(() => initialUserId ?? readStoredId());

  // The Axios interceptor reads the id through a ref, so it always sees the latest value.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  useEffect(() => {
    configureApiClient({ userIdGetter: () => userIdRef.current });
  }, []);

  const profile = useQuery({
    queryKey: queryKeys.me.profile(userId),
    queryFn: catalogApi.me,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const setUserId = useCallback(
    (id) => {
      const next = id ? Number(id) : null;
      try {
        if (next) window.localStorage.setItem(STORAGE_KEY, String(next));
        else window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* private mode: keep it in memory only */
      }
      userIdRef.current = next;
      setUserIdState(next);
      // Per-user caches are keyed by user id, but organiser screens and event details also
      // depend on permissions, so refresh what is on screen.
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    [queryClient],
  );

  const value = useMemo(
    () => ({
      userId,
      user: profile.data?.data ?? null,
      isLoading: Boolean(userId) && profile.isPending,
      isOrganiser: profile.data?.data?.role === 'ORGANISER',
      setUserId,
      signOut: () => setUserId(null),
    }),
    [userId, profile.data, profile.isPending, setUserId],
  );

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

// [FULLSTACK M1.5: Custom hook] Components call useCurrentUser() instead of useContext(...) directly.
export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error('useCurrentUser must be used inside <CurrentUserProvider>');
  return ctx;
}
