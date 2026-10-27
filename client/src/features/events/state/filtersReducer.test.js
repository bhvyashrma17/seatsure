// [FULLSTACK M1.11] useReducer logic is a pure function, so it is tested without rendering anything.
import { describe, expect, it } from 'vitest';
import { activeFilterCount, filtersReducer, initialFilters, toQueryParams } from './filtersReducer.js';

describe('filtersReducer', () => {
  it('FS-T01 toggles a category chip on and off', () => {
    const on = filtersReducer(initialFilters, { type: 'toggleCategory', value: 'TALK' });
    expect(on.category).toBe('TALK');
    expect(filtersReducer(on, { type: 'toggleCategory', value: 'TALK' }).category).toBe('');
  });

  it('FS-T02 reset clears every filter at once; unknown actions are a bug', () => {
    let state = filtersReducer(initialFilters, { type: 'search', value: 'git' });
    state = filtersReducer(state, { type: 'club', value: '3' });
    state = filtersReducer(state, { type: 'availability', value: 'open' });
    expect(activeFilterCount(state)).toBe(3);
    expect(filtersReducer(state, { type: 'reset' })).toEqual(initialFilters);
    expect(() => filtersReducer(state, { type: 'explode' })).toThrow(/Unknown filter action/);
  });

  it('FS-T03 only non-empty filters become query params', () => {
    expect(toQueryParams({ ...initialFilters, category: 'TALK' })).toEqual({ category: 'TALK', sort: 'soonest' });
  });
});
