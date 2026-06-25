/**
 * Design System — ThemeProvider.
 *
 * Feature: website-ui-redesign
 *
 * Owns the active Theme_Mode, applies it to the document root (as both
 * `data-theme` and the `.dark` class), and persists the user's choice to
 * `localStorage` (Req 14.2, 14.4, 14.5).
 *
 * - On mount it resolves the initial mode (stored → system light hint → Dark
 *   default) and reconciles the document root in case the pre-paint bootstrap in
 *   `index.html` differs (or never ran).
 * - `setTheme`/`toggleTheme` re-apply on the root synchronously (well within the
 *   200 ms budget, Req 14.4) and persist the new value.
 *
 * The provider deliberately keeps no DOM/storage logic inline — those concerns
 * live as pure helpers in `ThemeContext.ts` so they can be unit-tested and reused
 * by the pre-paint bootstrap without React.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ThemeContext,
  type ThemeContextValue,
  type ThemeMode,
  applyThemeToRoot,
  resolveInitialTheme,
  writeStoredTheme,
} from './ThemeContext';

export interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Optional explicit starting mode (mainly for tests/Storybook). When omitted,
   * the provider resolves the initial mode from storage/system/default.
   */
  defaultTheme?: ThemeMode;
}

/**
 * Wraps the application tree, supplying the active Theme_Mode and the
 * setter/toggle controls via {@link ThemeContext}.
 */
export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  // Resolve once on first render. `resolveInitialTheme` is safe in non-DOM envs.
  const [theme, setThemeState] = useState<ThemeMode>(
    () => defaultTheme ?? resolveInitialTheme(),
  );

  // Reconcile the document root on mount and whenever the active mode changes.
  // Covers the case where the pre-paint bootstrap applied a different value
  // (e.g. an explicit `defaultTheme` prop) or did not run at all.
  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    // Apply to the root immediately so surfaces re-skin within 200 ms (Req 14.4),
    // then persist. State update triggers a re-render of token-derived styles.
    applyThemeToRoot(mode);
    writeStoredTheme(mode);
    setThemeState(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
