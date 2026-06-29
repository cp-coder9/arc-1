/**
 * Property-based test — Theme persistence round-trip + complete token resolution.
 *
 * Feature: website-ui-redesign, Property 16: Theme persistence round-trip and
 * complete token resolution.
 *
 * Validates: Requirements 14.2, 14.4, 14.5
 *
 * Property 16 (design.md): For any Theme_Mode selection, applying it persists the
 * preference and re-applies it to the document root, and a subsequent fresh
 * initialization (simulating reload) restores exactly that Theme_Mode; when no
 * stored preference exists initialization yields the Dark_Theme default; and under
 * whichever mode is active every semantic Theme_Token resolves to a value.
 *
 * Strategy: run under jsdom with a mocked `localStorage` (controllable in-memory
 * store) and a mocked `window.matchMedia` (controllable `prefers-color-scheme:
 * light` result), generating mode selections and stored/system-preference states.
 * Each property runs `{ numRuns: 100 }` iterations.
 */

import fc from 'fast-check';

import {
  ALL_TOKEN_NAMES,
  getTokenFallback,
  resolveToken,
} from '../tokens';
import {
  applyThemeToRoot,
  DEFAULT_THEME,
  readStoredTheme,
  resolveInitialTheme,
  type ThemeMode,
  THEME_STORAGE_KEY,
  writeStoredTheme,
} from '../theme/ThemeContext';

/** Arbitrary over the two selectable Theme_Modes (Req 14.1). */
const themeMode: fc.Arbitrary<ThemeMode> = fc.constantFrom('dark', 'light');

/** In-memory backing store for the mocked localStorage (reset every test). */
let store: Map<string, string>;
/** Controls the mocked `prefers-color-scheme: light` result for a given run. */
let systemPrefersLight = false;

beforeEach(() => {
  store = new Map<string, string>();

  // Mock localStorage with a controllable in-memory store so persistence is
  // deterministic and isolated from any real browser/jsdom storage.
  const mockLocalStorage = {
    getItem: (key: string): string | null => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string): void => {
      store.set(key, String(value));
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
    key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
    get length(): number {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: mockLocalStorage,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: mockLocalStorage,
  });

  // Mock matchMedia: only the light-scheme query reflects `systemPrefersLight`.
  systemPrefersLight = false;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-color-scheme: light') ? systemPrefersLight : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Start each run from a clean document root.
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  // Remove any token values a run set inline on the root.
  for (const name of ALL_TOKEN_NAMES) {
    document.documentElement.style.removeProperty(name);
  }
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
});

describe('Property 16: theme persistence round-trip and complete token resolution', () => {
  it('(a) persists a selected mode and a fresh init restores exactly that mode (Req 14.4, 14.5)', () => {
    fc.assert(
      fc.property(themeMode, fc.boolean(), (mode, light) => {
        store.clear();
        // The system preference must NOT influence the result once a preference
        // is stored — vary it to prove the stored value always wins.
        systemPrefersLight = light;

        // Apply + persist the chosen mode (what setTheme/toggleTheme do).
        applyThemeToRoot(mode);
        writeStoredTheme(mode);

        // The preference was actually persisted.
        expect(readStoredTheme()).toBe(mode);

        // Simulate a reload: a fresh initialization restores exactly the mode.
        expect(resolveInitialTheme()).toBe(mode);
      }),
      { numRuns: 100 },
    );
  });

  it('(b) with no stored preference, init yields Dark_Theme default unless the system prefers light (Req 14.2)', () => {
    fc.assert(
      fc.property(fc.boolean(), (light) => {
        // No stored preference for this run.
        store.clear();
        expect(readStoredTheme()).toBeNull();

        systemPrefersLight = light;

        const initial = resolveInitialTheme();

        // No stored value + system not-light → Dark_Theme default (Req 14.2).
        // No stored value + system light → Light_Theme.
        expect(initial).toBe(light ? 'light' : 'dark');
        if (!light) {
          expect(initial).toBe(DEFAULT_THEME);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(c) applyThemeToRoot sets data-theme and toggles the .dark class consistently', () => {
    fc.assert(
      fc.property(themeMode, (mode) => {
        applyThemeToRoot(mode);

        const root = document.documentElement;
        // data-theme always reflects the active mode.
        expect(root.getAttribute('data-theme')).toBe(mode);
        // The .dark class is present iff the active mode is dark (keeps the
        // existing `@custom-variant dark` working).
        expect(root.classList.contains('dark')).toBe(mode === 'dark');
      }),
      { numRuns: 100 },
    );
  });

  it("(d) under whichever mode is active, the full semantic Theme_Token set resolves to that mode's values", () => {
    fc.assert(
      fc.property(themeMode, (mode) => {
        applyThemeToRoot(mode);

        for (const name of ALL_TOKEN_NAMES) {
          // Every registered token has a non-empty documented fallback, so a
          // reference never resolves to an empty style even before the
          // stylesheet loads (jsdom does not load src/index.css).
          expect(getTokenFallback(name).length).toBeGreaterThan(0);

          // Simulate the active mode supplying this token's value on the root,
          // then confirm the resolve guard returns that mode-specific value.
          const value = `${mode}-token-value`;
          document.documentElement.style.setProperty(name, value);
          expect(resolveToken(name)).toBe(value);
          document.documentElement.style.removeProperty(name);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('uses the documented storage key for persistence', () => {
    // Guards against accidental key drift breaking cross-reload restoration.
    expect(THEME_STORAGE_KEY).toBe('architex-theme');
    writeStoredTheme('light');
    expect(store.get(THEME_STORAGE_KEY)).toBe('light');
  });
});
