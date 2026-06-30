/**
 * Unit tests for the Theme_Token runtime resolve guard.
 *
 * Feature: website-ui-redesign (Task 1.3)
 * Validates: Requirements 10.5
 *
 * The guard `resolveToken(name)` must:
 *  - return the documented fallback AND emit a development `console.warn` when a
 *    token is undefined (its CSS custom property resolves empty), and
 *  - return the resolved value and NOT warn when the token is defined on the
 *    document root.
 */

import {
  DEFAULT_TOKEN_FALLBACK,
  GLASS_BLUR,
  LANDING_ACCENT,
  LANDING_TEXT,
  getTokenFallback,
  resolveToken,
} from '../tokens';

/** Remove any inline custom properties we set on the root between tests. */
function clearRootTokens(...names: string[]): void {
  for (const name of names) {
    document.documentElement.style.removeProperty(name);
  }
}

afterEach(() => {
  // Keep the document root clean so one test cannot leak a defined token into
  // another that expects it to be undefined.
  clearRootTokens(LANDING_ACCENT, LANDING_TEXT, GLASS_BLUR);
  vi.restoreAllMocks();
});

describe('getTokenFallback', () => {
  it('returns the documented fallback for a known token', () => {
    // LANDING_ACCENT has a specific documented fallback (the canonical mint).
    expect(getTokenFallback(LANDING_ACCENT)).toBe('#aeefe3');
  });

  it('returns the generic DEFAULT_TOKEN_FALLBACK for an unregistered name', () => {
    expect(getTokenFallback('--not-a-real-token')).toBe(DEFAULT_TOKEN_FALLBACK);
    expect(DEFAULT_TOKEN_FALLBACK).toBe('transparent');
  });
});

describe('resolveToken — undefined token', () => {
  it('returns the documented fallback and warns in dev for an unresolved token', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // LANDING_ACCENT is never declared in jsdom's stylesheet, so it resolves empty.
    const resolved = resolveToken(LANDING_ACCENT);

    // Falls back to the documented value rather than an empty string.
    expect(resolved).toBe(getTokenFallback(LANDING_ACCENT));
    expect(resolved).toBe('#aeefe3');

    // A development-time warning fired and names the unresolved token.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain(LANDING_ACCENT);
  });

  it('returns the generic fallback for an unregistered, undefined token', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = resolveToken('--totally-made-up-token');

    expect(resolved).toBe(DEFAULT_TOKEN_FALLBACK);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('--totally-made-up-token');
  });
});

describe('resolveToken — defined token', () => {
  it('returns the resolved value and does NOT warn for a defined token', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Define the token on the document root, exactly as the stylesheet would.
    // Use a value deliberately different from the documented fallback so we can
    // prove the resolved (not the fallback) value is returned.
    expect(getTokenFallback(GLASS_BLUR)).not.toBe('12px');
    document.documentElement.style.setProperty(GLASS_BLUR, '12px');

    const resolved = resolveToken(GLASS_BLUR);

    expect(resolved).toBe('12px');
    // The defined value is returned, NOT the documented fallback.
    expect(resolved).not.toBe(getTokenFallback(GLASS_BLUR));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace from the resolved value', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    document.documentElement.style.setProperty(LANDING_TEXT, '  #ffffff  ');

    const resolved = resolveToken(LANDING_TEXT);

    expect(resolved).toBe('#ffffff');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
