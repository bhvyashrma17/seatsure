// [FULLSTACK M1.5 + M3.11: Custom hook for infinite scroll] Calls `onIntersect` whenever the returned
// ref's element scrolls into view. The page attaches it to a sentinel below the last card.
import { useEffect, useRef } from 'react';

export function useIntersectionObserver(onIntersect, { enabled = true, rootMargin = '300px' } = {}) {
  const targetRef = useRef(null);
  const callbackRef = useRef(onIntersect);
  callbackRef.current = onIntersect;

  useEffect(() => {
    const node = targetRef.current;
    if (!enabled || !node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callbackRef.current();
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return targetRef;
}
