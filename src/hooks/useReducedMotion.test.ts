import { describe, it, expect, beforeEach, afterEach, vitest } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Tests for useReducedMotion hook
 *
 * Validates:
 *   Requirements 7.1, 7.2
 *   - Detects prefers-reduced-motion media query
 *   - Caches value in state to avoid re-computing on every render
 *   - Returns boolean value indicating user preference
 */

/**
 * Builds a MediaQueryList-like mock. Optionally captures the registered
 * `change` listener so tests can simulate OS preference changes.
 */
function createMatchMediaMock(
  matches: boolean,
  hooks?: {
    addEventListener?: ReturnType<typeof vitest.fn>;
    removeEventListener?: ReturnType<typeof vitest.fn>;
    onChange?: (listener: (e: MediaQueryListEvent) => void) => void;
  },
) {
  return vitest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vitest.fn(),
    removeListener: vitest.fn(),
    addEventListener:
      hooks?.addEventListener ??
      vitest.fn((event: string, listener: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          hooks?.onChange?.(listener);
        }
      }),
    removeEventListener: hooks?.removeEventListener ?? vitest.fn(),
    dispatchEvent: vitest.fn(),
  }));
}

describe('useReducedMotion', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    vitest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original matchMedia so tests stay isolated
    window.matchMedia = originalMatchMedia;
    vitest.restoreAllMocks();
  });

  it('should return false when user does not prefer reduced motion', () => {
    window.matchMedia = createMatchMediaMock(false) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useReducedMotion());

    // After effect runs, should return false
    expect(result.current).toBe(false);
  });

  it('should return true when user prefers reduced motion', () => {
    window.matchMedia = createMatchMediaMock(true) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useReducedMotion());

    // After effect runs, should return true
    expect(result.current).toBe(true);
  });

  it('should cache the value and not recompute on re-render', () => {
    const mockMatchMedia = createMatchMediaMock(false);
    window.matchMedia = mockMatchMedia as unknown as typeof window.matchMedia;

    const { result, rerender } = renderHook(() => useReducedMotion());

    const firstRenderValue = result.current;

    // Re-render the hook
    rerender();

    // Value should be the same (cached)
    expect(result.current).toBe(firstRenderValue);
    // matchMedia should only be called once (during first effect)
    expect(mockMatchMedia).toHaveBeenCalledTimes(1);
  });

  it('should listen for media query changes and update state when preference changes', async () => {
    let changeListener: ((e: MediaQueryListEvent) => void) | null = null;

    window.matchMedia = createMatchMediaMock(false, {
      onChange: listener => {
        changeListener = listener;
      },
    }) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useReducedMotion());

    // Initial value should be false
    expect(result.current).toBe(false);

    // Simulate media query change (user changes OS preference to reduce motion)
    act(() => {
      changeListener?.({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
      } as MediaQueryListEvent);
    });

    // Value should update to true
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('should remove event listener on unmount', () => {
    const removeEventListenerMock = vitest.fn();

    window.matchMedia = createMatchMediaMock(false, {
      removeEventListener: removeEventListenerMock,
    }) as unknown as typeof window.matchMedia;

    const { unmount } = renderHook(() => useReducedMotion());

    // Unmount the hook
    unmount();

    // removeEventListener should have been called during cleanup
    expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('should work correctly with multiple hook instances', () => {
    window.matchMedia = createMatchMediaMock(true) as unknown as typeof window.matchMedia;

    const { result: result1 } = renderHook(() => useReducedMotion());
    const { result: result2 } = renderHook(() => useReducedMotion());

    // Both hooks should have the same value
    expect(result1.current).toBe(true);
    expect(result2.current).toBe(true);
  });

  /**
   * Property 1: useReducedMotion always returns the current media query state
   * Validates: Requirements 7.1, 7.2
   *
   * Property: For any media query state (matches: true or false),
   * useReducedMotion should return a value matching that state
   */
  it('should always reflect the current media query state (property test)', () => {
    const testCases = [
      { matches: true, expectedValue: true },
      { matches: false, expectedValue: false },
    ];

    testCases.forEach(({ matches, expectedValue }) => {
      window.matchMedia = createMatchMediaMock(matches) as unknown as typeof window.matchMedia;

      const { result, unmount } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(expectedValue);

      unmount();
    });
  });

  /**
   * Property 2: Hook returns consistent value across re-renders (caching)
   * Validates: Requirements 7.2
   *
   * Property: For a given initial media query state, the hook should return
   * the same cached value across multiple re-renders until the state changes
   */
  it('should consistently cache the value across re-renders (property test)', () => {
    window.matchMedia = createMatchMediaMock(false) as unknown as typeof window.matchMedia;

    const { result, rerender } = renderHook(() => useReducedMotion());

    const values = [result.current];

    // Re-render 10 times and collect values
    for (let i = 0; i < 10; i++) {
      rerender();
      values.push(result.current);
    }

    // All values should be the same (false)
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBe(false);
  });
});
