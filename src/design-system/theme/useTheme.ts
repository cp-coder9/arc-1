/**
 * Design System — useTheme hook.
 *
 * Feature: website-ui-redesign
 *
 * Consumes {@link ThemeContext}. Throws when used outside a `ThemeProvider` so
 * the mistake surfaces immediately during development rather than silently
 * reading a `null` context.
 */

import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './ThemeContext';

/**
 * Returns the active Theme_Mode and the `setTheme`/`toggleTheme` controls.
 *
 * @throws if called outside a {@link ThemeProvider}.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }
  return context;
}
