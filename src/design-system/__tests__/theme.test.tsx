/**
 * Example tests — ThemeToggle behavior and theme application.
 *
 * Feature: website-ui-redesign (Task 3.4)
 *
 * Validates: Requirements 14.1, 14.3, 14.4, 14.7, 14.8
 *
 * Coverage:
 *  - 14.3 / 14.4  Activating the Theme_Toggle flips the active Theme_Mode and
 *                 applies it to the document root synchronously (well within the
 *                 200 ms budget), updating `data-theme`, the `.dark` class, and
 *                 the toggle's `aria-pressed` state.
 *  - 14.1         Both Theme_Mode scopes (`:root` Light_Theme and
 *                 `[data-theme="dark"], .dark` Dark_Theme) declare the full
 *                 landing/glass semantic token set, and every registered token
 *                 has a non-empty resolved fallback.
 *  - 14.7         A single shared component (GlassSurface) renders under both
 *                 modes via the same code path — identical markup/structure — so
 *                 only token-derived styles differ (no markup or logic fork).
 *  - 14.8         In Light_Theme the `.glass` tokens resolve to light-appropriate
 *                 values while `backdrop-filter` blur remains present (the glass
 *                 material is re-skinned, not removed).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GlassSurface } from '../GlassSurface';
import { ALL_TOKEN_NAMES, getTokenFallback, THEME_TOKENS } from '../tokens';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemeToggle } from '../theme/ThemeToggle';
import { THEME_STORAGE_KEY } from '../theme/ThemeContext';

/** Read the canonical stylesheet once — it is the source of token truth. */
const CSS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../index.css',
);
const indexCss = readFileSync(CSS_PATH, 'utf8');

/** Extracts the body of the first CSS rule whose selector matches `selectorRe`. */
function ruleBody(css: string, selectorRe: RegExp): string {
  const match = css.match(selectorRe);
  return match ? match[1] : '';
}

const root = () => document.documentElement;

beforeEach(() => {
  // Start every test from a clean root + storage so theme resolution is
  // deterministic and isolated from other tests.
  try {
    window.localStorage.clear();
  } catch {
    /* storage may be mocked/unavailable — ignore. */
  }
  root().removeAttribute('data-theme');
  root().classList.remove('dark');
});

afterEach(() => {
  root().removeAttribute('data-theme');
  root().classList.remove('dark');
});

describe('ThemeToggle — flips and applies the Theme_Mode (Req 14.3, 14.4)', () => {
  it('starts in Dark_Theme with the toggle reflecting the active mode', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle />
      </ThemeProvider>,
    );

    // The provider applies the default Dark_Theme to the root on mount.
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);

    // aria-pressed reflects the active (dark) mode.
    const toggle = screen.getByRole('button', { name: 'Switch color theme' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking flips dark -> light: data-theme, .dark class, and aria-pressed all update', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle />
      </ThemeProvider>,
    );

    const toggle = screen.getByRole('button', { name: 'Switch color theme' });

    await user.click(toggle);

    // The flip is applied to the document root.
    expect(root().getAttribute('data-theme')).toBe('light');
    expect(root().classList.contains('dark')).toBe(false);
    // The toggle's state reflects the now-active light mode.
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking twice returns to Dark_Theme (round-trip)', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle />
      </ThemeProvider>,
    );

    const toggle = screen.getByRole('button', { name: 'Switch color theme' });

    await user.click(toggle); // -> light
    expect(root().getAttribute('data-theme')).toBe('light');

    await user.click(toggle); // -> dark
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies the new mode synchronously, well within the 200 ms budget (Req 14.4)', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle />
      </ThemeProvider>,
    );

    const toggle = screen.getByRole('button', { name: 'Switch color theme' });

    // Apply happens inside the click handler (synchronous). Measure the elapsed
    // time across the click act() and assert the root already reflects the flip.
    const start = performance.now();
    act(() => {
      toggle.click();
    });
    const elapsed = performance.now() - start;

    expect(root().getAttribute('data-theme')).toBe('light');
    expect(elapsed).toBeLessThan(200);
  });
});

describe('Theme_Token set resolves in both scopes (Req 14.1)', () => {
  it('every registered Theme_Token has a non-empty documented fallback', () => {
    // jsdom does not load src/index.css, so resolveToken relies on these
    // documented fallbacks — none may be empty, guaranteeing the full semantic
    // token set always resolves to a value under either mode.
    for (const name of ALL_TOKEN_NAMES) {
      expect(getTokenFallback(name).length).toBeGreaterThan(0);
    }
  });

  it('the Light_Theme :root scope declares the landing + glass semantic tokens', () => {
    const lightScope = ruleBody(indexCss, /:root\s*\{([^}]*)\}/);

    const semanticTokens = [
      ...Object.values(THEME_TOKENS.landing),
      ...Object.values(THEME_TOKENS.glass),
    ];
    for (const token of semanticTokens) {
      expect(lightScope).toContain(`${token}:`);
    }
  });

  it('the Dark_Theme [data-theme="dark"], .dark scope declares the landing + glass semantic tokens', () => {
    const darkScope = ruleBody(indexCss, /\[data-theme="dark"\][^{]*\{([^}]*)\}/);

    const semanticTokens = [
      ...Object.values(THEME_TOKENS.landing),
      ...Object.values(THEME_TOKENS.glass),
    ];
    for (const token of semanticTokens) {
      expect(darkScope).toContain(`${token}:`);
    }
  });
});

describe('A single shared component renders identically under both modes (Req 14.7)', () => {
  it('GlassSurface produces the same markup/structure in Dark_Theme and Light_Theme', () => {
    const renderUnder = (mode: 'dark' | 'light') => {
      const { container, unmount } = render(
        <ThemeProvider defaultTheme={mode}>
          <GlassSurface data-testid="surface">Welcome to Architex OS</GlassSurface>
        </ThemeProvider>,
      );
      const el = screen.getByTestId('surface');
      const snapshot = {
        tagName: el.tagName,
        className: el.className,
        html: el.outerHTML,
      };
      unmount();
      return snapshot;
    };

    const dark = renderUnder('dark');
    const light = renderUnder('light');

    // Same code path → identical element, classes, and DOM structure. Only the
    // token-derived computed styles (resolved from --glass-* per mode) differ.
    expect(dark.tagName).toBe(light.tagName);
    expect(dark.className).toBe(light.className);
    expect(dark.className).toContain('glass');
    expect(light.className).toContain('glass');
    expect(dark.html).toBe(light.html);
  });
});

describe('Light_Theme keeps the glass material, re-skinned to light tokens (Req 14.8)', () => {
  it(':root resolves --glass-bg/--glass-border to light values distinct from Dark_Theme', () => {
    const lightScope = ruleBody(indexCss, /:root\s*\{([^}]*)\}/);
    const darkScope = ruleBody(indexCss, /\[data-theme="dark"\][^{]*\{([^}]*)\}/);

    // Both scopes define the glass tokens.
    expect(lightScope).toMatch(/--glass-bg:\s*[^;]+;/);
    expect(lightScope).toMatch(/--glass-border:\s*[^;]+;/);
    expect(darkScope).toMatch(/--glass-bg:\s*[^;]+;/);
    expect(darkScope).toMatch(/--glass-border:\s*[^;]+;/);

    // The light values are re-skinned (different from the dark values), proving
    // the material adapts to the mode rather than reusing the dark appearance.
    const lightBg = lightScope.match(/--glass-bg:\s*([^;]+);/)?.[1].trim();
    const darkBg = darkScope.match(/--glass-bg:\s*([^;]+);/)?.[1].trim();
    expect(lightBg).toBeTruthy();
    expect(darkBg).toBeTruthy();
    expect(lightBg).not.toBe(darkBg);
  });

  it('the .glass rule still declares backdrop-filter blur (material not removed)', () => {
    const glassRule = ruleBody(indexCss, /\.glass\s*\{([^}]*)\}/);

    // The glass blur (the defining material layer) is present and driven by the
    // theme-flipping --glass-blur token, so it survives a theme change.
    expect(glassRule).toMatch(/backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
    expect(glassRule).toMatch(/-webkit-backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
    // The translucency + border layers also reference the (re-skinning) tokens.
    expect(glassRule).toContain('background: var(--glass-bg)');
    expect(glassRule).toContain('border: 1px solid var(--glass-border)');
  });
});
