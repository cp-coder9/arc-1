// Feature: website-ui-redesign (Task 15.1)
//
// Example / unit tests for counts, labels, timings, and error branches.
//
// This suite consolidates the concrete, by-example acceptance checks that
// complement the property-based tests, giving each listed requirement a direct,
// fast assertion against the REAL implementation:
//
//   - Glass four-layer composition ............................ Req 2.1
//   - `@supports` opaque fallback ............................. Req 2.5
//   - Exactly four Quick_Nav items + labels ................... Req 5.1
//   - Single <h1> containing the Hero headline ............... Req 9.6
//   - CTA / activation timing bounds .......... Req 3.5, 4.6, 8.1, 12.8
//   - Bird_Mark asset-fallback branch ........................ Req 6.4
//   - Undefined-token development warning .................... Req 10.5
//   - Elemental separation of Sign_In_Page / Workspaces ..... Req 10.6, 10.7
//
// Several assertions read source text via `fs` (the canonical `.glass` CSS and
// the design-system import graph) because those facts live in stylesheets /
// module structure rather than rendered DOM. jsdom does not compute CSS from
// stylesheets, so the material-fidelity checks assert the authored rule text.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Hero } from '../Hero';
import { QuickNav, QUICK_NAV_ITEMS } from '../QuickNav';
import { HERO_COPY, clampCopy, HEADLINE_LIMIT } from '../copy';
import {
  useFlockActivation,
  MIN_SEQUENCE_MS,
  MAX_SEQUENCE_MS,
  DEFAULT_TIMING,
} from '../flock/useFlockActivation';
import { BirdMark } from '@/design-system/BirdMark';
import {
  resolveToken,
  getTokenFallback,
  DEFAULT_TOKEN_FALLBACK,
} from '@/design-system/tokens';

// ─── Shared source text ──────────────────────────────────────────────────────
// Vitest runs from the workspace root, so resolve authored files from cwd.
const ROOT = process.cwd();
const CSS = readFileSync(path.resolve(ROOT, 'src', 'index.css'), 'utf8');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * Extract the body of the canonical `.glass { ... }` rule (the first occurrence,
 * NOT the `@supports` override) by capturing up to its matching close brace.
 */
function firstGlassRuleBody(css: string): string {
  const idx = css.indexOf('.glass {');
  expect(idx).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

// ─── Glass four-layer composition (Req 2.1) ──────────────────────────────────
describe('Glass four-layer composition (Req 2.1)', () => {
  const body = firstGlassRuleBody(CSS);

  it('declares all four named Glass_Surface layers, each from a --glass-* token', () => {
    // layer 1 — backdrop blur
    expect(body).toMatch(/backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
    // layer 2 — layered background translucency
    expect(body).toMatch(/background:\s*var\(--glass-bg\)/);
    // layer 3 — light-toned border
    expect(body).toMatch(/border:\s*1px\s+solid\s+var\(--glass-border\)/);
    // layer 4 — outer glow box-shadow
    expect(body).toMatch(/box-shadow:[\s\S]*var\(--glass-glow\)/);
  });

  it('uses no literal hex color for any of the four layers (token-driven)', () => {
    // The canonical rule body must reference tokens, never a baked hex value, so
    // the surface re-skins on a Theme_Mode flip.
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(body).toContain('var(--glass-blur)');
    expect(body).toContain('var(--glass-bg)');
    expect(body).toContain('var(--glass-border)');
    expect(body).toContain('var(--glass-glow)');
  });
});

// ─── @supports opaque fallback (Req 2.5) ─────────────────────────────────────
describe('Glass opaque fallback when backdrop-filter is unsupported (Req 2.5)', () => {
  it('defines an `@supports not (backdrop-filter ...)` block that opaquely backs .glass', () => {
    const supportsIdx = CSS.indexOf('@supports not');
    expect(supportsIdx).toBeGreaterThanOrEqual(0);

    const fallbackBlock = CSS.slice(supportsIdx, supportsIdx + 400);
    // Targets the same .glass surface…
    expect(fallbackBlock).toContain('.glass');
    // …and swaps to the opaque deep-teal token (preserves >=4.5:1 contrast, no
    // content loss) rather than a translucent value.
    expect(fallbackBlock).toMatch(/background:\s*var\(--landing-bg-deep\)/);
  });
});

// ─── Exactly four Quick_Nav items (Req 5.1) ──────────────────────────────────
describe('Quick_Nav has exactly four items (Req 5.1)', () => {
  it('declares exactly four items labeled People, Projects, Approvals, Payments', () => {
    expect(QUICK_NAV_ITEMS).toHaveLength(4);
    expect(QUICK_NAV_ITEMS.map((i) => i.label)).toEqual([
      'People',
      'Projects',
      'Approvals',
      'Payments',
    ]);
  });

  it('renders exactly four navigation buttons', () => {
    render(<QuickNav onNavigate={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});

// ─── Single <h1> containing the Hero headline (Req 9.6) ──────────────────────
describe('Hero renders a single level-one heading containing the headline (Req 9.6)', () => {
  it('has exactly one <h1> and it contains the (clamped) Hero headline', () => {
    const { container } = render(
      <Hero onActivate={() => {}} prefersReducedMotion />,
    );

    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);

    const expectedHeadline = clampCopy(HERO_COPY.headline, HEADLINE_LIMIT);
    expect(headings[0]).toHaveTextContent(expectedHeadline);
  });
});

// ─── CTA / activation timing bounds (Req 3.5, 4.6, 8.1, 12.8) ────────────────
describe('Activation timing bounds (Req 12.8)', () => {
  it('exposes the canonical 1500–3500 ms sequence window constants', () => {
    expect(MIN_SEQUENCE_MS).toBe(1500);
    expect(MAX_SEQUENCE_MS).toBe(3500);
  });

  it('keeps the default visible sequence sum within the 1500–3500 ms window', () => {
    const total =
      DEFAULT_TIMING.activatingMs +
      DEFAULT_TIMING.dispersingMs +
      DEFAULT_TIMING.settlingMs;
    expect(total).toBeGreaterThanOrEqual(MIN_SEQUENCE_MS);
    expect(total).toBeLessThanOrEqual(MAX_SEQUENCE_MS);
  });

  it('arms the activation watchdog at 5000 ms (Req 3.6, 4.7 failure bound)', () => {
    expect(DEFAULT_TIMING.watchdogMs).toBe(5000);
  });
});

describe('Activation begins promptly (Req 3.5, 4.6)', () => {
  it('activate() moves the phase off "landing" synchronously', () => {
    vi.useFakeTimers();
    try {
      const { result, unmount } = renderHook(() => useFlockActivation());
      expect(result.current.phase).toBe('landing');

      act(() => {
        result.current.activate();
      });

      // The state transition begins immediately (well within the 1000 ms bound),
      // long before any sequence timer fires.
      expect(result.current.phase).toBe('activating');
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('jumps straight to osReveal synchronously under reduced motion (Req 12.9)', () => {
    const { result, unmount } = renderHook(() =>
      useFlockActivation({ prefersReducedMotion: true }),
    );

    act(() => {
      result.current.activate();
    });

    expect(result.current.phase).toBe('osReveal');
    unmount();
  });
});

describe('Hero entrance duration is within 200–1000 ms (Req 8.1)', () => {
  it('uses a framer-motion entrance transition inside the documented window', () => {
    const heroSrc = readFileSync(
      path.resolve(ROOT, 'src', 'features', 'landing', 'Hero.tsx'),
      'utf8',
    );

    // The entrance transition lives on the `animate: { opacity: 1, y: 0 }` block.
    const match = heroSrc.match(
      /animate:\s*\{\s*opacity:\s*1,\s*y:\s*0\s*\},\s*transition:\s*\{\s*duration:\s*([0-9.]+)/,
    );
    expect(match).not.toBeNull();

    const seconds = Number(match![1]);
    const ms = seconds * 1000;
    expect(ms).toBeGreaterThanOrEqual(200);
    expect(ms).toBeLessThanOrEqual(1000);
  });
});

// ─── Bird_Mark asset-fallback branch (Req 6.4) ───────────────────────────────
describe('Bird_Mark falls back to the Wordmark on asset load error (Req 6.4)', () => {
  it('swaps to "ARCHITEX" and retains the "Architex" accessible name', () => {
    render(<BirdMark size="hero" />);

    const img = screen.getByRole('img', { name: 'Architex' });
    expect(img.tagName).toBe('IMG');

    // Simulate the PNG failing to load.
    fireEvent.error(img);

    // The PNG <img> is replaced by the Wordmark text…
    const fallback = screen.getByRole('img', { name: 'Architex' });
    expect(fallback.tagName).not.toBe('IMG');
    expect(fallback).toHaveTextContent('ARCHITEX');
    // …and the brand identity stays announced to assistive tech (Req 6.5).
    expect(fallback).toHaveAttribute('aria-label', 'Architex');
  });
});

// ─── Undefined-token development warning (Req 10.5) ──────────────────────────
describe('Undefined Theme_Token surfaces a development warning (Req 10.5)', () => {
  it('warns and returns the documented fallback for an unresolved token', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = resolveToken('--nope');

    // Returns the documented generic fallback rather than an empty string.
    expect(resolved).toBe(getTokenFallback('--nope'));
    expect(resolved).toBe(DEFAULT_TOKEN_FALLBACK);

    // A development-time warning fired and names the unresolved token.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('--nope');
  });
});

// ─── Elemental separation of Sign_In_Page / Workspaces (Req 10.6, 10.7) ──────
//
// The expressive flock + moving grid must live ONLY under src/features/landing/.
// The shared design-system primitives (GlassSurface, BirdMark, tokens, theme)
// — which the elemental Sign_In_Page and Workspaces reuse — must NOT depend on
// the landing feature. We prove this STRUCTURALLY: no design-system source file
// imports from the landing feature, and the flock/background modules are located
// under features/landing (not in the shared layer).
describe('Elemental separation: design-system never imports the landing feature (Req 10.6, 10.7)', () => {
  const DS_DIR = path.resolve(ROOT, 'src', 'design-system');
  const LANDING_DIR = path.resolve(ROOT, 'src', 'features', 'landing');

  /** Recursively collect .ts/.tsx source files, skipping test directories. */
  function collectSources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') return [];
        return collectSources(full);
      }
      return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)
        ? [full]
        : [];
    });
  }

  it('no design-system module imports from @/features/landing or a relative landing path', () => {
    const sources = collectSources(DS_DIR);
    // Guard: ensure we actually scanned the primitives.
    expect(sources.some((f) => f.endsWith('GlassSurface.tsx'))).toBe(true);
    expect(sources.some((f) => f.endsWith('BirdMark.tsx'))).toBe(true);

    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      // Match any import/re-export/dynamic-import that references the landing feature.
      if (
        /from\s+['"]@\/features\/landing/.test(text) ||
        /from\s+['"][./]+features\/landing/.test(text) ||
        /import\(\s*['"]@\/features\/landing/.test(text) ||
        /import\(\s*['"][./]+features\/landing/.test(text)
      ) {
        offenders.push(path.relative(ROOT, file).replaceAll(path.sep, '/'));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('locates the flock and moving-grid modules under features/landing (not the shared layer)', () => {
    const landingSources = collectSources(LANDING_DIR).map((f) =>
      path.relative(LANDING_DIR, f).replaceAll(path.sep, '/'),
    );

    // The animation engine + geometry live in the landing feature only.
    expect(landingSources).toContain('flock/useFlockActivation.ts');
    expect(landingSources).toContain('flock/geometry.ts');
    expect(landingSources).toContain('flock/AgentField.tsx');
    // The moving grid / network background also belongs to the landing feature.
    expect(landingSources).toContain('background/GridBackground.tsx');
    expect(landingSources).toContain('background/NetworkNodes.tsx');

    // And none of these expressive modules exist in the shared design-system.
    const dsSources = collectSources(DS_DIR).map((f) =>
      path.relative(DS_DIR, f).replaceAll(path.sep, '/'),
    );
    expect(dsSources.some((f) => /flock|geometry|AgentField|GridBackground|NetworkNodes/.test(f))).toBe(
      false,
    );
  });
});
