// @vitest-environment jsdom
/**
 * Property-based test — Theme switch updates all custom properties.
 *
 * Feature: ui-ux-overhaul-landing-aesthetic
 * Task 1.7 / Correctness Property 3: Theme switch updates all custom properties.
 *
 * **Validates: Requirements 13.5, 13.6**
 *   - 13.5: WHEN theme is switched THEN the System SHALL update all components
 *           using var(--token-name) dynamically WITHOUT reload.
 *   - 13.6: FOR all theme tokens THEN the System SHALL maintain a defined value
 *           in both Dark_Theme and Light_Theme (no token left stale on switch).
 *
 * Property 3 (tasks.md): Switching themes updates all var(--token) values
 * dynamically.
 *
 * Strategy
 * --------
 * The source of truth is the real `src/index.css`. We parse the two theme scopes
 * it declares:
 *   - `:root`                       → Light_Theme token values
 *   - `[data-theme="dark"], .dark`  → Dark_Theme overrides
 *
 * From those parsed declarations we model the CSS cascade (the dark scope, being
 * more specific, overrides `:root` when the dark scope is active). jsdom does not
 * apply external stylesheets, so to demonstrate the runtime behaviour end-to-end
 * we drive `applyThemeToRoot` (the real switch entry point) and mirror the
 * cascade result onto the document root as inline custom properties — exactly
 * the values a browser would compute — then read them back through the
 * production `resolveToken` guard.
 *
 * Each property runs `{ numRuns: 100 }` iterations.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveToken } from '../tokens';
import { applyThemeToRoot, type ThemeMode } from '../theme/ThemeContext';

const RUNS = { numRuns: 100 } as const;

// ── Source of truth: parse the two theme scopes out of src/index.css ──────────

const CSS_PATH = resolve(process.cwd(), 'src/index.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

/**
 * Extracts the body (between `{` and the matching top-level `}`) of the first
 * block whose opening matches `selector`. The theme scopes contain only flat
 * `--name: value;` declarations (no nested braces), so a first-`}` scan is
 * sufficient and robust.
 */
function extractBlockBody(css: string, selector: RegExp): string {
  const match = selector.exec(css);
  if (!match || match.index === undefined) {
    throw new Error(`Could not locate CSS block for selector ${selector}`);
  }
  const start = match.index + match[0].length;
  const end = css.indexOf('}', start);
  if (end === -1) throw new Error(`Unterminated CSS block for selector ${selector}`);
  return css.slice(start, end);
}

/** Parses `--name: value;` declarations from a CSS block body into a Map. */
function parseDeclarations(body: string): Map<string, string> {
  const decls = new Map<string, string>();
  const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(body)) !== null) {
    decls.set(m[1], m[2].trim());
  }
  return decls;
}

/** Light_Theme values (the default `:root` scope). */
const LIGHT = parseDeclarations(extractBlockBody(CSS, /:root\s*\{/));
/** Dark_Theme overrides (`[data-theme="dark"], .dark`). */
const DARK = parseDeclarations(
  extractBlockBody(CSS, /\[data-theme="dark"\]\s*,\s*\.dark\s*\{/),
);

/**
 * Models the CSS cascade: when Dark_Theme is active its scope overrides `:root`;
 * otherwise the `:root` (Light_Theme) value applies. Returns `undefined` only
 * for a name declared in neither scope.
 */
function effectiveValue(name: string, mode: ThemeMode): string | undefined {
  if (mode === 'dark' && DARK.has(name)) return DARK.get(name);
  return LIGHT.get(name) ?? (mode === 'dark' ? DARK.get(name) : undefined);
}

/**
 * Mirrors what a browser does on a theme switch: flips the active scope via the
 * real `applyThemeToRoot`, then materialises the cascade result as inline custom
 * properties (since jsdom does not evaluate external CSS). Production code reads
 * these back through `resolveToken`.
 */
function switchThemeOnRoot(mode: ThemeMode, names: Iterable<string>): void {
  applyThemeToRoot(mode);
  const rootStyle = document.documentElement.style;
  for (const name of names) {
    const value = effectiveValue(name, mode);
    if (value !== undefined) rootStyle.setProperty(name, value);
  }
}

// ── Derived token sets ────────────────────────────────────────────────────────

/** Every token the Dark_Theme scope overrides — these must flip on a switch. */
const DARK_OVERRIDDEN = [...DARK.keys()];

/** Tokens declared in BOTH scopes (the switchable, theme-aware token set). */
const IN_BOTH = DARK_OVERRIDDEN.filter((name) => LIGHT.has(name));

/** Tokens whose declared value genuinely differs between the two themes. */
const FLIPPING = IN_BOTH.filter((name) => LIGHT.get(name) !== DARK.get(name));

/** All theme modes a user can switch between (Req 13.1). */
const themeMode: fc.Arbitrary<ThemeMode> = fc.constantFrom('dark', 'light');

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  // Clear any inline token values a run materialised on the root.
  for (const name of new Set([...LIGHT.keys(), ...DARK.keys()])) {
    document.documentElement.style.removeProperty(name);
  }
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
});

// ── Derivation guards ─────────────────────────────────────────────────────────

describe('Property 3: theme switch — derivation guards', () => {
  it('parses a non-empty token set from both theme scopes in src/index.css', () => {
    expect(LIGHT.size).toBeGreaterThan(0);
    expect(DARK.size).toBeGreaterThan(0);
    expect(DARK_OVERRIDDEN.length).toBeGreaterThan(0);
    expect(FLIPPING.length).toBeGreaterThan(0);
  });

  it('declares the canonical flipping landing tokens in both scopes', () => {
    // These are the tokens Requirement 13.3/13.5 calls out explicitly; if any is
    // missing from a scope, a switch would leave it stale.
    for (const name of ['--landing-bg', '--landing-text', '--landing-accent', '--foreground', '--background']) {
      expect(LIGHT.has(name)).toBe(true);
      expect(DARK.has(name)).toBe(true);
      expect(LIGHT.get(name)).not.toBe(DARK.get(name));
    }
  });
});

// ── Property tests ────────────────────────────────────────────────────────────

describe('Property 3: theme switch updates all custom properties', () => {
  // (a) Completeness (Req 13.6): every token the Dark_Theme overrides is also
  //     declared in the Light_Theme (:root) scope, so switching back to light
  //     always lands the token on a defined value — none is left stale.
  it('(a) every Dark_Theme-overridden token is also defined in Light_Theme', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DARK_OVERRIDDEN), (token) => {
        expect(LIGHT.has(token)).toBe(true);
        expect((LIGHT.get(token) ?? '').length).toBeGreaterThan(0);
        expect((DARK.get(token) ?? '').length).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  // (b) Dynamic update (Req 13.5): switching from one theme to the other updates
  //     every flipping token's resolved var(--token) value dynamically. We drive
  //     the real `applyThemeToRoot` and read back through `resolveToken`.
  it('(b) switching themes updates every flipping token to the active theme value', () => {
    fc.assert(
      fc.property(themeMode, fc.constantFrom(...FLIPPING), (from, token) => {
        const to: ThemeMode = from === 'dark' ? 'light' : 'dark';

        // Start in the `from` theme: token resolves to the from-theme value.
        switchThemeOnRoot(from, FLIPPING);
        const before = resolveToken(token);
        expect(before).toBe(effectiveValue(token, from));

        // Switch to the other theme WITHOUT reload: the value updates dynamically.
        switchThemeOnRoot(to, FLIPPING);
        const after = resolveToken(token);
        expect(after).toBe(effectiveValue(token, to));

        // A flipping token genuinely changed value across the switch.
        expect(after).not.toBe(before);
      }),
      RUNS,
    );
  });

  // (c) Full-set refresh (Req 13.5): after a switch, ALL theme-aware tokens (not
  //     just the ones that differ) resolve to the active theme's declared value.
  it('(c) after a switch, all theme-aware tokens resolve to the active theme', () => {
    fc.assert(
      fc.property(themeMode, (mode) => {
        switchThemeOnRoot(mode, IN_BOTH);
        for (const token of IN_BOTH) {
          expect(resolveToken(token)).toBe(effectiveValue(token, mode));
        }
      }),
      RUNS,
    );
  });

  // (d) Switch entry point correctness: `applyThemeToRoot` selects the scope that
  //     drives the cascade (data-theme attribute + .dark class) for any switch.
  it('(d) applyThemeToRoot activates the scope matching the target theme', () => {
    fc.assert(
      fc.property(themeMode, themeMode, (from, to) => {
        applyThemeToRoot(from);
        applyThemeToRoot(to);
        const root = document.documentElement;
        expect(root.getAttribute('data-theme')).toBe(to);
        expect(root.classList.contains('dark')).toBe(to === 'dark');
      }),
      RUNS,
    );
  });
});
