// Feature: website-ui-redesign, Property 10
//
// Property 10: Visible focus indicator — Validates Requirements 9.3
//
// Req 9.3: "WHEN an interactive control receives keyboard focus, THE System
//   SHALL display a focus indicator that fully encloses the control, remains
//   visible for the entire duration the control holds focus, and maintains a
//   contrast ratio of at least 3:1 between the focus indicator and the adjacent
//   background."
//
// jsdom limitation
// ----------------
// jsdom does not compute real CSS, does not implement `:focus-visible`, and
// cannot rasterize a focus ring to measure its rendered contrast. A faithful,
// pixel-level check of "the ring fully encloses the control AND measures ≥3:1
// against what is actually painted behind it" therefore belongs to an E2E /
// visual test. This suite takes a pragmatic, still-meaningful two-pronged
// approach that pins the same guarantees structurally:
//
//   Part A — Per control (render the real LandingPage, install a class-based
//     no-op ResizeObserver, collect every focusable control): assert each
//     control declares a visible focus indicator. The design-system pattern is
//     that a control EITHER keeps the user-agent default focus outline (which
//     encloses the control and persists while focused) OR fully replaces it
//     with a token-driven ring. So the invariant is: a control that suppresses
//     the native outline (`outline-none` / `focus-visible:outline-none`) MUST
//     declare a focus-visible ring that encloses the control — `ring-2` (a ring
//     around the whole control) AND a `ring-offset-*` class — whose ring color
//     is set to a Theme_Token (`var(--ring)` or `var(--landing-accent)`), i.e.
//     not removed / `none`. fast-check generates which collected control to
//     check across ≥100 runs.
//
//   Part B — Compute the WCAG relative-luminance contrast (implemented below)
//     of each ring-color Theme_Token value against the adjacent background
//     token (`--landing-bg`), parsing the canonical values straight from
//     `src/index.css` for BOTH Theme_Modes (`:root` Light_Theme +
//     `[data-theme="dark"], .dark` Dark_Theme), and assert ≥3:1. Both ring
//     tokens that landing controls use are checked: `--ring` (#aeefe3 dark /
//     #006b5c light) and `--landing-accent` (#aeefe3 dark / #005b4e light).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, cleanup, type RenderResult } from '@testing-library/react';
import fc from 'fast-check';

import { LandingPage } from '../LandingPage';
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';
import { LANDING_BG, RING, LANDING_ACCENT } from '@/design-system/tokens';

const RUNS = { numRuns: 100 } as const;

// LandingPage observes its container via `new ResizeObserver(...)`. The shared
// test setup installs a non-constructable arrow-function mock, so install a
// proper class-based no-op observer for this suite (jsdom has none).
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: NoopResizeObserver,
  });
});

afterEach(() => {
  cleanup();
});

// ── Part A helpers: collect focusable controls + inspect their focus styling ──

/** Selector for keyboard-focusable controls (excludes tabindex="-1"). */
const FOCUSABLE_SELECTOR =
  'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function renderLanding(): RenderResult {
  return render(
    <ThemeProvider defaultTheme="dark">
      <LandingPage onSignUp={() => {}} onNavigate={() => {}} onSignIn={() => {}} />
    </ThemeProvider>,
  );
}

function collectControls(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
}

/** Read the inline `--tw-ring-color` custom property robustly under jsdom. */
function ringColor(el: HTMLElement): string {
  const fromStyle = el.style.getPropertyValue('--tw-ring-color').trim();
  if (fromStyle) return fromStyle;
  // Fallback: parse the raw style attribute string.
  const attr = el.getAttribute('style') ?? '';
  const m = attr.match(/--tw-ring-color\s*:\s*([^;]+)/);
  return m ? m[1].trim() : '';
}

interface FocusIndicator {
  /** 'ring' = token-driven focus ring; 'native' = relies on the UA outline. */
  kind: 'ring' | 'native' | 'none';
  classes: string;
  ringColor: string;
}

/** The ring color tokens a landing control is allowed to use (Req 9.3). */
const ALLOWED_RING_TOKENS = new Set([`var(${RING})`, `var(${LANDING_ACCENT})`]);

/**
 * Classify a control's focus indicator. A control with a visible indicator
 * EITHER keeps the user-agent default outline (does not suppress it) OR fully
 * replaces it with a token-driven focus-visible ring that encloses the control.
 */
function classifyFocusIndicator(el: HTMLElement): FocusIndicator {
  const classes = el.getAttribute('class') ?? '';
  const color = ringColor(el);

  const suppressesOutline = /(?:focus-visible:)?outline-none/.test(classes);
  const hasRing = /(?:focus-visible:)?ring-2(?:\b|$)/.test(classes);
  const hasOffset = /(?:focus-visible:)?ring-offset-(?:0|2)\b/.test(classes);
  const hasTokenRingColor =
    ALLOWED_RING_TOKENS.has(color) && color !== 'none' && color !== '';

  const fullRing = hasRing && hasOffset && hasTokenRingColor;

  if (fullRing) return { kind: 'ring', classes, ringColor: color };
  // No full ring: it is only acceptable if the native outline is NOT removed,
  // so the UA default focus outline still encloses the control.
  if (!suppressesOutline) return { kind: 'native', classes, ringColor: color };
  return { kind: 'none', classes, ringColor: color };
}

// ── Part B helpers: parse canonical token values from src/index.css ───────────

const CSS_PATH = resolve(process.cwd(), 'src/index.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function extractBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Selector "${selector}" not found in index.css`);
  const braceStart = css.indexOf('{', start);
  const braceEnd = css.indexOf('}', braceStart);
  if (braceStart === -1 || braceEnd === -1) {
    throw new Error(`Malformed block for selector "${selector}"`);
  }
  return css.slice(braceStart + 1, braceEnd);
}

function parseDecls(block: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const chunk of block.split(';')) {
    const m = chunk.match(/(--[\w-]+)\s*:\s*(.+)/s);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

/** Resolve any `var(--x[, fallback])` references against a scope map. */
function resolveValue(value: string, scope: Record<string, string>): string {
  let v = value;
  let guard = 0;
  while (v.includes('var(') && guard++ < 20) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_, name: string) => scope[name] ?? '');
  }
  return v.trim();
}

const cleaned = stripComments(CSS);
const rootDecls = parseDecls(extractBlock(cleaned, ':root {'));
const darkDecls = parseDecls(extractBlock(cleaned, '[data-theme="dark"], .dark {'));

// Light_Theme = :root. Dark_Theme = :root overridden by the dark scope.
const PALETTES = {
  light: rootDecls,
  dark: { ...rootDecls, ...darkDecls },
} as const;

type ThemeMode = keyof typeof PALETTES;

function tokenValue(mode: ThemeMode, name: string): string {
  const scope = PALETTES[mode];
  const raw = scope[name];
  if (raw === undefined) throw new Error(`Token "${name}" not defined in ${mode} scope`);
  return resolveValue(raw, scope);
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function parseColor(input: string): RGB {
  const s = input.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
      };
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => parseFloat(p.trim()));
    return { r: parts[0], g: parts[1], b: parts[2] };
  }
  throw new Error(`Unsupported color value: "${input}"`);
}

function relativeLuminance({ r, g, b }: RGB): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: RGB, bg: RGB): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Minimum WCAG contrast for a focus indicator vs the adjacent background. */
const MIN_FOCUS_CONTRAST = 3;

/** Ring-color Theme_Tokens used by landing controls, checked in both modes. */
const RING_TOKENS = [RING, LANDING_ACCENT] as const;
const MODES: ThemeMode[] = ['dark', 'light'];

function measureRingContrast(mode: ThemeMode, ringToken: string): number {
  const ring = parseColor(tokenValue(mode, ringToken));
  const bg = parseColor(tokenValue(mode, LANDING_BG));
  return contrastRatio(ring, bg);
}

// ── Part A: structural focus-indicator presence on every control ─────────────

describe('Property 10: Visible focus indicator — structural (Req 9.3)', () => {
  it('every focusable Landing control declares a visible focus indicator (enclosing ring or native outline)', () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        const { container } = renderLanding();
        try {
          const controls = collectControls(container);
          expect(controls.length).toBeGreaterThan(0);

          const control = controls[n % controls.length];
          const indicator = classifyFocusIndicator(control);

          expect(
            indicator.kind,
            `control <${control.tagName.toLowerCase()}` +
              `${control.getAttribute('aria-label') ? ` aria-label="${control.getAttribute('aria-label')}"` : ''}>` +
              ` has no visible focus indicator. classes="${indicator.classes}" ringColor="${indicator.ringColor}"`,
          ).not.toBe('none');

          // A control that opts into the token-driven ring must enclose the
          // control (ring-2 + ring-offset) and color the ring from a Theme_Token
          // (never removed / none).
          if (indicator.kind === 'ring') {
            expect(ALLOWED_RING_TOKENS.has(indicator.ringColor)).toBe(true);
          }
        } finally {
          cleanup();
        }
      }),
      RUNS,
    );
  }, 60_000);

  it('all focusable controls simultaneously have a visible focus indicator', () => {
    const { container } = renderLanding();
    const controls = collectControls(container);
    expect(controls.length).toBeGreaterThan(0);

    const offenders = controls
      .map((el) => ({ el, indicator: classifyFocusIndicator(el) }))
      .filter(({ indicator }) => indicator.kind === 'none')
      .map(
        ({ el, indicator }) =>
          `<${el.tagName.toLowerCase()} aria-label="${el.getAttribute('aria-label') ?? ''}"> classes="${indicator.classes}"`,
      );

    expect(offenders, `controls without a focus indicator:\n${offenders.join('\n')}`).toEqual([]);
  });
});

// ── Part B: ring-color contrast vs the adjacent background, in both modes ─────

describe('Property 10: Visible focus indicator — contrast ≥3:1 (Req 9.3)', () => {
  it('every ring-color Theme_Token meets ≥3:1 against --landing-bg in both modes', () => {
    fc.assert(
      fc.property(fc.constantFrom(...MODES), fc.constantFrom(...RING_TOKENS), (mode, ringToken) => {
        const ratio = measureRingContrast(mode, ringToken);
        expect(
          ratio,
          `${mode} • focus ring ${ringToken} vs ${LANDING_BG} (need ≥${MIN_FOCUS_CONTRAST}:1) measured ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(MIN_FOCUS_CONTRAST);
      }),
      RUNS,
    );
  });

  it('reports the measured ring contrast ratio for every token in both modes', () => {
    const report: Array<{ mode: string; ringToken: string; need: string; measured: string; pass: boolean }> = [];
    for (const mode of MODES) {
      for (const ringToken of RING_TOKENS) {
        const ratio = measureRingContrast(mode, ringToken);
        report.push({
          mode,
          ringToken,
          need: `${MIN_FOCUS_CONTRAST}:1`,
          measured: `${ratio.toFixed(2)}:1`,
          pass: ratio >= MIN_FOCUS_CONTRAST,
        });
        expect(ratio).toBeGreaterThanOrEqual(MIN_FOCUS_CONTRAST);
      }
    }
    // eslint-disable-next-line no-console
    console.table(report);
  });
});
