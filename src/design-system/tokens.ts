/**
 * Design System — Theme_Token name constants + runtime resolve guard.
 *
 * Feature: website-ui-redesign
 *
 * Why this file exists
 * --------------------
 * Every color/typography/material value in the redesign comes from a CSS custom
 * property (a "Theme_Token") declared in `src/index.css`. Markup must reference
 * those tokens by NAME only — never an inline hex literal (Req 1.5). Hand-typing
 * raw strings like `var(--landing-acent)` is error-prone and a typo would resolve
 * to an empty value at runtime with no warning.
 *
 * Centralizing the token names as exported string constants makes every reference
 * typo-safe: a misspelled constant is a *compile-time* TypeScript error, and the
 * `TokenName` union lets helpers accept only real tokens (Req 1.7).
 *
 * `resolveToken(name)` is the runtime safety net (Req 10.5): it reads the live
 * computed value of a token from the document root and, if the token is missing
 * or empty (e.g. referenced before the stylesheet loaded, or never declared),
 * emits a development-time `console.warn` naming the unresolved token and returns
 * a documented fallback style instead of an empty string.
 *
 * The constants below mirror the tokens declared in `src/index.css`. Adding a new
 * token there should be accompanied by a constant here so markup can reference it
 * safely.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Token name constants
 *
 * Each constant is the exact CSS custom-property name (including the leading
 * `--`) so it can be used directly with both `var(...)` in styles and
 * `getPropertyValue(...)` at runtime.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Core semantic color tokens (theme-flipping; shared with the role-based app) */
export const BACKGROUND = '--background';
export const FOREGROUND = '--foreground';
export const CARD = '--card';
export const CARD_FOREGROUND = '--card-foreground';
export const POPOVER = '--popover';
export const POPOVER_FOREGROUND = '--popover-foreground';

/* Brand color tokens — reused as-is, never redefined (Req 1.2) */
export const PRIMARY = '--primary';
export const PRIMARY_LIGHT = '--primary-light';
export const PRIMARY_DARK = '--primary-dark';
export const PRIMARY_FOREGROUND = '--primary-foreground';
export const SECONDARY = '--secondary';
export const SECONDARY_FOREGROUND = '--secondary-foreground';

export const MUTED = '--muted';
export const MUTED_FOREGROUND = '--muted-foreground';
export const ACCENT = '--accent';
export const ACCENT_FOREGROUND = '--accent-foreground';
export const DESTRUCTIVE = '--destructive';
export const DESTRUCTIVE_FOREGROUND = '--destructive-foreground';
export const BORDER = '--border';
export const INPUT = '--input';
export const RING = '--ring';

/* Landing / Liquid Glass semantic tokens (theme-flipping) */
export const LANDING_BG = '--landing-bg';
export const LANDING_BG_DEEP = '--landing-bg-deep';
export const LANDING_TEXT = '--landing-text';
export const LANDING_TEXT_MUTED = '--landing-text-muted';
export const LANDING_ACCENT = '--landing-accent';
export const GLASS_BG = '--glass-bg';
export const GLASS_BORDER = '--glass-border';
export const GLASS_GLOW = '--glass-glow';
export const GLASS_BLUR = '--glass-blur';

/* Layout token — theme-invariant grid cell size */
export const GRID_STEP = '--grid-step';

/* Typography tokens (declared via `@theme inline`) */
export const FONT_HEADING = '--font-heading';
export const FONT_SANS = '--font-sans';
export const FONT_MONO = '--font-mono';

/* Radius token */
export const RADIUS = '--radius';

/**
 * The canonical, grouped registry of every Theme_Token name the design system
 * references. Prefer the individual named constants in markup; this object is
 * handy for iteration (e.g. tests that assert every token resolves).
 */
export const THEME_TOKENS = {
  color: {
    background: BACKGROUND,
    foreground: FOREGROUND,
    card: CARD,
    cardForeground: CARD_FOREGROUND,
    popover: POPOVER,
    popoverForeground: POPOVER_FOREGROUND,
    primary: PRIMARY,
    primaryLight: PRIMARY_LIGHT,
    primaryDark: PRIMARY_DARK,
    primaryForeground: PRIMARY_FOREGROUND,
    secondary: SECONDARY,
    secondaryForeground: SECONDARY_FOREGROUND,
    muted: MUTED,
    mutedForeground: MUTED_FOREGROUND,
    accent: ACCENT,
    accentForeground: ACCENT_FOREGROUND,
    destructive: DESTRUCTIVE,
    destructiveForeground: DESTRUCTIVE_FOREGROUND,
    border: BORDER,
    input: INPUT,
    ring: RING,
  },
  landing: {
    bg: LANDING_BG,
    bgDeep: LANDING_BG_DEEP,
    text: LANDING_TEXT,
    textMuted: LANDING_TEXT_MUTED,
    accent: LANDING_ACCENT,
  },
  glass: {
    bg: GLASS_BG,
    border: GLASS_BORDER,
    glow: GLASS_GLOW,
    blur: GLASS_BLUR,
  },
  layout: {
    gridStep: GRID_STEP,
  },
  font: {
    heading: FONT_HEADING,
    sans: FONT_SANS,
    mono: FONT_MONO,
  },
  radius: RADIUS,
} as const;

/** A flat array of every registered Theme_Token name. */
export const ALL_TOKEN_NAMES = [
  BACKGROUND, FOREGROUND, CARD, CARD_FOREGROUND, POPOVER, POPOVER_FOREGROUND,
  PRIMARY, PRIMARY_LIGHT, PRIMARY_DARK, PRIMARY_FOREGROUND,
  SECONDARY, SECONDARY_FOREGROUND,
  MUTED, MUTED_FOREGROUND, ACCENT, ACCENT_FOREGROUND,
  DESTRUCTIVE, DESTRUCTIVE_FOREGROUND, BORDER, INPUT, RING,
  LANDING_BG, LANDING_BG_DEEP, LANDING_TEXT, LANDING_TEXT_MUTED, LANDING_ACCENT,
  GLASS_BG, GLASS_BORDER, GLASS_GLOW, GLASS_BLUR,
  GRID_STEP,
  FONT_HEADING, FONT_SANS, FONT_MONO,
  RADIUS,
] as const;

/** Union of all registered Theme_Token names — enables typo-safe references. */
export type TokenName = (typeof ALL_TOKEN_NAMES)[number];

/* ────────────────────────────────────────────────────────────────────────────
 * Documented fallback styles
 *
 * Returned by `resolveToken` when a token cannot be resolved at runtime. These
 * are deliberately the Dark_Theme defaults (the standard appearance of the
 * site, Req 1.1) so an unresolved token degrades to a legible, on-brand value
 * rather than an empty string. The generic fallback (`transparent`) covers any
 * name not in this map.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Fallback used for any token without a more specific documented value. */
export const DEFAULT_TOKEN_FALLBACK = 'transparent';

const TOKEN_FALLBACKS: Record<string, string> = {
  [BACKGROUND]: '#0d2520',
  [FOREGROUND]: '#ffffff',
  [CARD]: '#11302a',
  [CARD_FOREGROUND]: '#ffffff',
  [POPOVER]: '#11302a',
  [POPOVER_FOREGROUND]: '#ffffff',
  [PRIMARY]: '#005b4e',
  [PRIMARY_LIGHT]: '#007666',
  [PRIMARY_DARK]: '#00201b',
  [PRIMARY_FOREGROUND]: '#ffffff',
  [SECONDARY]: '#aeefe3',
  [SECONDARY_FOREGROUND]: '#00201c',
  [MUTED]: '#123129',
  [MUTED_FOREGROUND]: 'rgba(255, 255, 255, 0.62)',
  [ACCENT]: '#9b7bd4',
  [ACCENT_FOREGROUND]: '#0d2520',
  [DESTRUCTIVE]: '#d95747',
  [DESTRUCTIVE_FOREGROUND]: '#ffffff',
  [BORDER]: 'rgba(174, 239, 227, 0.16)',
  [INPUT]: 'rgba(174, 239, 227, 0.16)',
  [RING]: '#aeefe3',
  [LANDING_BG]: '#0d2520',
  [LANDING_BG_DEEP]: '#081a16',
  [LANDING_TEXT]: '#ffffff',
  [LANDING_TEXT_MUTED]: 'rgba(255, 255, 255, 0.62)',
  [LANDING_ACCENT]: '#aeefe3',
  [GLASS_BG]: 'rgba(255, 255, 255, 0.07)',
  [GLASS_BORDER]: 'rgba(174, 239, 227, 0.24)',
  [GLASS_GLOW]: 'rgba(0, 118, 102, 0.38)',
  [GLASS_BLUR]: '20px',
  [GRID_STEP]: '54px',
  [FONT_HEADING]: "'Space Grotesk', sans-serif",
  [FONT_SANS]: "'Inter', sans-serif",
  [FONT_MONO]: "'JetBrains Mono', monospace",
  [RADIUS]: '1.25rem',
};

/**
 * Returns the documented fallback style for a token name, or the generic
 * `DEFAULT_TOKEN_FALLBACK` when no specific fallback is registered.
 */
export function getTokenFallback(name: string): string {
  return TOKEN_FALLBACKS[name] ?? DEFAULT_TOKEN_FALLBACK;
}

/**
 * True when running in a development build. Prefers Vite's `import.meta.env.DEV`
 * and falls back to `process.env.NODE_ENV` for non-Vite runtimes (e.g. some test
 * environments). Production builds suppress the unresolved-token warning.
 */
function isDevEnvironment(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return Boolean(import.meta.env.DEV);
    }
  } catch {
    /* `import.meta` unavailable — fall through to the process check. */
  }
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
}

/**
 * Resolve guard for Theme_Tokens (Req 10.5).
 *
 * Reads the live computed value of a CSS custom property from the document root.
 * If the token resolves to a non-empty value, that value (trimmed) is returned.
 * Otherwise — the token is undefined, empty, or the DOM is unavailable (SSR) —
 * a documented fallback is returned, and in development a `console.warn` names
 * the unresolved token so the gap surfaces during development rather than
 * silently rendering an empty style.
 *
 * @param name  A Theme_Token name (use the exported constants for type safety).
 * @returns     The resolved token value, or a documented fallback.
 */
export function resolveToken(name: TokenName | string): string {
  // SSR / non-DOM environments: there is no document to read from.
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return getTokenFallback(name);
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (value === '') {
    const fallback = getTokenFallback(name);
    if (isDevEnvironment()) {
      // eslint-disable-next-line no-console
      console.warn(
        `[design-system] Unresolved Theme_Token "${name}". ` +
          `It is not defined in src/index.css (or resolved empty). ` +
          `Falling back to "${fallback}".`,
      );
    }
    return fallback;
  }

  return value;
}

/**
 * Convenience helper that wraps a token name in a CSS `var()` reference with an
 * optional inline fallback. Useful for inline styles where the browser performs
 * the resolution: `style={{ color: tokenVar(LANDING_TEXT) }}`.
 */
export function tokenVar(name: TokenName | string, fallback?: string): string {
  return fallback !== undefined ? `var(${name}, ${fallback})` : `var(${name})`;
}
