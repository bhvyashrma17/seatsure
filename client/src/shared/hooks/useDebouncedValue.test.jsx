import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue.js';

afterEach(() => vi.useRealTimers());

describe('useDebouncedValue', () => {
  it('FS-T04 only publishes the value after typing pauses', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), { initialProps: { value: 'h' } });
    rerender({ value: 'ha' });
    rerender({ value: 'hack' });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('h'); // still the old value
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('hack');
  });
});
