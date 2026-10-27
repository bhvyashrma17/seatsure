// [FULLSTACK M1.11: useReducer] The catalogue has five related filter values that change together
// ("reset" clears all of them; a category chip toggles). One reducer with named actions keeps
// those transitions in one tested place instead of five separate useState setters.
export const initialFilters = Object.freeze({ q: '', clubId: '', category: '', availability: '', sort: 'soonest' });

export function filtersReducer(state, action) {
  switch (action.type) {
    case 'search':
      return { ...state, q: action.value };
    case 'club':
      return { ...state, clubId: action.value };
    case 'toggleCategory':
      return { ...state, category: state.category === action.value ? '' : action.value };
    case 'availability':
      return { ...state, availability: action.value };
    case 'sort':
      return { ...state, sort: action.value };
    case 'reset':
      return initialFilters;
    default:
      throw new Error(`Unknown filter action: ${action.type}`);
  }
}

/** Only non-empty filters become query params (so the cache key stays small and stable). */
export function toQueryParams(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined && v !== null));
}

export function activeFilterCount(filters) {
  return ['q', 'clubId', 'category', 'availability'].filter((k) => filters[k]).length;
}
