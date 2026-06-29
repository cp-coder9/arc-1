/**
 * Theme hook — re-exported from design system.
 *
 * Provides access to the active Theme_Mode and controls for switching between
 * Dark_Theme and Light_Theme, with automatic localStorage persistence and CSS
 * custom property updates.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 *
 * @throws if called outside a {@link ThemeProvider}.
 *
 * @example
 * const { theme, toggleTheme, setTheme } = useTheme();
 * // theme is 'dark' or 'light'
 * toggleTheme(); // Switches theme, persists, updates all var(--token) values
 */

export { useTheme } from '@/design-system/theme/useTheme';
export type { ThemeContextValue, ThemeMode } from '@/design-system/theme/ThemeContext';
