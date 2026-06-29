// Feature: website-ui-redesign, Property 2: Text contrast on every background, in every Theme_Mode
//
// Property-based test for WCAG 2.1 text contrast across BOTH Theme_Modes.
//
// For all Theme_Modes (Dark_Theme and Light_Theme) and for all Landing text
// pairings the page actually uses (including text composited over a
// Glass_Surface), the contrast ratio between the foreground text token and its
// effective background — both resolved under the active mode — is at least
// 4.5:1 for body text and at least 3:1 for large text and focus indicators.
//
// Validates: Requirements 1.3, 2.4, 9.5, 14.6, 14.8
//
// The per-mode palette is parsed directly from `src/index.css` (the source of
// truth) so the test cannot drift from the canonical token values. Translucent
// Glass_Surface backgrounds are composited over the opaque Landing background to
// obtain the effective background before measuring; translucent foreground
// tokens (e.g. --landing-text-muted) are likewise composited over their
// effective background to obtain the rendered foreground color, per the WCAG
// approach for partially-transparent colors.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import {
  LANDING_BG,
  LANDING_BG_DEEP,
  LANDING_TEXT,
  LANDING_TEXT_MUTED,
  LANDING_ACCENT,
  GLASS_BG,
  RING,
} from '../tokens';

const RUNS = { numRuns: 100 } as const;

// ── Load the canonical token values straight from src/index.css ──────────────

const CSS_PATH = resolve(process.cwd(), 'src/index.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

/** Strip CSS block comments so they never pollute declaration parsing. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extract the declaration body of the first rule whose selector text starts
 * with `selector`. The targeted rules (`:root`, the dark scope) contain only
 * flat custom-property declarations, so the first `}` after the opening `{`
 * closes the block.
 */
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

/** Parse `--name: value;` declarations from a rule body into a map. */
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

// Light_Theme = :root. Dark_Theme = :root overridden by the dark scope (CSS
// cascade), so tokens not re-declared in the dark block (e.g. --secondary,
// --primary) still resolve.
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

// ── Color math ───────────────────────────────────────────────────────────────

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(input: string): RGBA {
  const s = input.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
        a: 1,
      };
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => parseFloat(p.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] };
  }
  throw new Error(`Unsupported color value: "${input}"`);
}

/** Composite a (possibly translucent) source over an opaque backdrop. */
function compositeOver(src: RGBA, backdrop: RGBA): RGBA {
  const a = src.a;
  return {
    r: src.r * a + backdrop.r * (1 - a),
    g: src.g * a + backdrop.g * (1 - a),
    b: src.b * a + backdrop.b * (1 - a),
    a: 1,
  };
}

function relativeLuminance({ r, g, b }: RGBA): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: RGBA, bg: RGBA): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Landing text pairings actually used by the page ──────────────────────────
//
// `min` is the WCAG AA threshold for that pairing: 4.5 for body text, 3 for
// large text and focus indicators.

interface Pairing {
  fg: string; // foreground token
  bg: string; // background base token
  glass: boolean; // composite --glass-bg over the base background first
  min: number;
  kind: 'body' | 'large' | 'focus';
  label: string;
}

const PAIRINGS: Pairing[] = [
  { fg: LANDING_TEXT, bg: LANDING_BG, glass: false, min: 4.5, kind: 'body', label: 'landing-text on landing-bg' },
  { fg: LANDING_TEXT, bg: LANDING_BG, glass: true, min: 4.5, kind: 'body', label: 'landing-text on glass-over-landing-bg' },
  { fg: LANDING_TEXT, bg: LANDING_BG_DEEP, glass: false, min: 4.5, kind: 'body', label: 'landing-text on landing-bg-deep (opaque glass fallback)' },
  { fg: LANDING_TEXT_MUTED, bg: LANDING_BG, glass: false, min: 4.5, kind: 'body', label: 'landing-text-muted on landing-bg' },
  { fg: LANDING_TEXT_MUTED, bg: LANDING_BG, glass: true, min: 4.5, kind: 'body', label: 'landing-text-muted on glass-over-landing-bg' },
  { fg: LANDING_ACCENT, bg: LANDING_BG, glass: false, min: 3, kind: 'large', label: 'landing-accent on landing-bg' },
  { fg: LANDING_ACCENT, bg: LANDING_BG, glass: true, min: 3, kind: 'large', label: 'landing-accent on glass-over-landing-bg' },
  { fg: RING, bg: LANDING_BG, glass: false, min: 3, kind: 'focus', label: 'focus ring on landing-bg' },
];

function measure(mode: ThemeMode, pairing: Pairing): number {
  const base = parseColor(tokenValue(mode, pairing.bg));
  const effectiveBg = pairing.glass
    ? compositeOver(parseColor(tokenValue(mode, GLASS_BG)), base)
    : base;
  const fgRaw = parseColor(tokenValue(mode, pairing.fg));
  const effectiveFg = fgRaw.a < 1 ? compositeOver(fgRaw, effectiveBg) : fgRaw;
  return contrastRatio(effectiveFg, effectiveBg);
}

const MODES: ThemeMode[] = ['dark', 'light'];

describe('Property 2: Text contrast on every background, in every Theme_Mode', () => {
  // For all (mode, pairing), the resolved contrast meets its WCAG AA threshold.
  // Validates Requirements 1.3, 2.4, 9.5, 14.6, 14.8.
  it('every Landing text/background pairing meets its WCAG AA threshold in both modes', () => {
    fc.assert(
      fc.property(fc.constantFrom(...MODES), fc.constantFrom(...PAIRINGS), (mode, pairing) => {
        const ratio = measure(mode, pairing);
        expect(
          ratio,
          `${mode} • ${pairing.label} (${pairing.kind}, need >= ${pairing.min}:1) measured ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(pairing.min);
      }),
      RUNS,
    );
  });

  // Exhaustive deterministic pass that also reports every measured ratio, so a
  // failing pairing is visible as a concrete finding (per task guidance).
  it('reports the measured contrast ratio for every pairing in both modes', () => {
    const report: Array<{ mode: string; pairing: string; kind: string; need: string; measured: string; pass: boolean }> = [];
    for (const mode of MODES) {
      for (const pairing of PAIRINGS) {
        const ratio = measure(mode, pairing);
        report.push({
          mode,
          pairing: pairing.label,
          kind: pairing.kind,
          need: `${pairing.min}:1`,
          measured: `${ratio.toFixed(2)}:1`,
          pass: ratio >= pairing.min,
        });
        expect(ratio).toBeGreaterThanOrEqual(pairing.min);
      }
    }
    // eslint-disable-next-line no-console
    console.table(report);
  });
});
