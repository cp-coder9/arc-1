/**
 * Design System — Theme context, types, and pure theme helpers.
 *
 * Feature: website-ui-redesign
 *
 * Why this module exists
 * ----------------------
 * `ThemeProvider.tsx` owns the React state and `useTheme.ts` consumes it. If the
 * provider and the hook imported the context from each other we'd have a circular
 * dependency. Centralizing the shared pieces — the `ThemeContext` object, the
 * `ThemeMode`/`ThemeContextValue` types, the storage key, and the framework-free
 * resolve/apply helpers — in one leaf module keeps both consumers clean and lets
 * the helpers be unit-tested without React.
 *
 * Theme strategy (see design.md → Theme Mode): the active mode is applied to
 * `document.documentElement` as BOTH a `data-theme` attribute and the `.dark`
 * class so the existing `@custom-variant dark (&:is(.dark *))` in `src/index.css`
 * keeps working unchanged. Dark_Theme is the default appearance (Req 14.2).
 */

import { createContext } from 'react';

/** The two selectable Theme_Modes (Req 14.1). Dark is the default (Req 14.2). */
export type ThemeMode = 'dark' | 'light';

/** Value exposed by {@link ThemeContext} and the `useTheme` hook. */
export interface ThemeContextValue {
  /** The currently active Theme_Mode. */
  theme: ThemeMode;
  /** Apply a specific Theme_Mode (persists + re-applies on the root). */
  setTheme: (mode: ThemeMode) => void;
  /** Flip between Dark_Theme and Light_Theme (persists + re-applies). */
  toggleTheme: () => void;
}

/** `localStorage` key under which the user's Theme_Mode preference is stored. */
export const THEME_STORAGE_KEY = 'architex-theme';

/** The default Theme_Mode when nothing else is known (Req 14.2). */
export const DEFAULT_THEME: ThemeMode = 'dark';

/**
 * React context carrying the active Theme_Mode. `null` until a `ThemeProvider`
 * supplies a value — `useTheme` treats `null` as "used outside a provider" and
 * throws, so misuse fails loudly during development.
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Narrows an arbitrary value to a valid {@link ThemeMode}, else `null`. */
export function normalizeThemeMode(value: unknown): ThemeMode | null {
  return value === 'dark' || value === 'light' ? value : null;
}

/**
 * Reads the stored Theme_Mode preference from `localStorage`.
 *
 * All storage access is wrapped in try/catch: a corrupt value, a disabled or
 * unavailable storage API (private mode, SSR, sandboxed iframe), or a thrown
 * `SecurityError` all degrade to `null` (no stored preference) rather than
 * crashing (Req 14.2, Error Handling in design.md).
 */
export function readStoredTheme(): ThemeMode | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Persists the Theme_Mode preference to `localStorage`. Wrapped in try/catch so
 * a full quota, disabled storage, or unavailable API never breaks a theme change
 * (Req 14.4) — persistence is best-effort.
 */
export function writeStoredTheme(mode: ThemeMode): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* Storage unavailable/full — persistence is best-effort, never fatal. */
  }
}

/**
 * True when the system prefers a light color scheme. Only consulted when there
 * is no stored preference (Req 14.2). Wrapped defensively for environments where
 * `matchMedia` is missing or throws.
 */
export function prefersLightColorScheme(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

/**
 * Resolves the initial Theme_Mode in priority order (Req 14.2):
 *   1. a stored preference in `localStorage['architex-theme']`, else
 *   2. `prefers-color-scheme: light` (consulted ONLY when no stored value), else
 *   3. the Dark_Theme default.
 *
 * Any storage corruption/unavailability falls through to the system check and
 * ultimately to Dark_Theme without crashing.
 */
export function resolveInitialTheme(): ThemeMode {
  const stored = readStoredTheme();
  if (stored) return stored;
  if (prefersLightColorScheme()) return 'light';
  return DEFAULT_THEME;
}

/**
 * Applies a Theme_Mode to the document root by setting BOTH the `data-theme`
 * attribute and toggling the `.dark` class on `<html>`. The class keeps the
 * existing `@custom-variant dark` and any `dark:` utilities working (design.md).
 * No-ops safely when there is no DOM (SSR / non-browser test envs).
 */
export function applyThemeToRoot(mode: ThemeMode): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.classList.toggle('dark', mode === 'dark');
}
