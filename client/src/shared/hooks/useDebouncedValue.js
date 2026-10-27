// [FULLSTACK M1.5: Custom hook] Returns `value` only after it has stopped changing for `delayMs`.
// Used for the search box so typing "hackathon" sends one request, not nine.
import { useEffect, useState } from 'react';

export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
