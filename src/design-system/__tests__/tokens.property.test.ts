// Feature: website-ui-redesign, Property 1: Token integrity
//
// Property-based test for the Design System token-integrity invariant.
//
// Property 1 (design.md): For all Theme_Tokens referenced by Landing_Page
// markup, each resolves to exactly one canonical definition in `src/index.css`
// (one declaration per scope, no duplicate within a scope); every pre-existing
// token name still resolves (proving zero renames/removals); and no inline hex
// color literal appears anywhere in the Landing markup.
//
// Validates: Requirements 1.5, 10.1, 10.4
//
// Sub-assertions:
//   (a) Each token referenced by the Landing markup (via the `tokens.ts`
//       constants or a literal `var(--x)`) is declared exactly once per scope in
//       `src/index.css` and resolves in at least one scope (:root, the
//       [data-theme="dark"]/.dark scope, or @theme inline). Req 1.5, 10.1.
//   (b) Every pre-existing (legacy) token name is still declared in :root,
//       proving no renames/removals (Req 10.4).
//   (c) No inline hex color literal (/#[0-9a-fA-F]{3,6}\b/) appears in any
//       Landing markup component file (Req 1.5).
//
// The canonical token values are parsed straight from `src/index.css` (the
// source of truth) and the referenced-token set is derived from the actual
// markup sources, so the test cannot drift from the code it guards.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import * as Tokens from '../tokens';

const RUNS = { numRuns: 100 } as const;

// ── Sources of truth ─────────────────────────────────────────────────────────

const CSS_PATH = resolve(process.cwd(), 'src/index.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

/**
 * The Landing_Page markup component files plus the Design System primitives the
 * Landing markup composes. These are the files whose markup must reference color
 * exclusively by Theme_Token (no inline hex) — `tokens.ts` (with its documented
 * hex fallbacks) is intentionally excluded because it is module logic, not
 * markup.
 */
const MARKUP_FILES = [
  'src/features/landing/TopBar.tsx',
  'src/features/landing/Hero.tsx',
  'src/features/landing/QuickNav.tsx',
  'src/features/landing/OSRevealCard.tsx',
  'src/features/landing/LandingPage.tsx',
  'src/features/landing/background/AmbientBlobs.tsx',
  'src/features/landing/background/GridBackground.tsx',
  'src/features/landing/background/NetworkNodes.tsx',
  'src/features/landing/background/Scrim.tsx',
  'src/features/landing/flock/AgentField.tsx',
  'src/design-system/GlassSurface.tsx',
  'src/design-system/BirdMark.tsx',
  'src/design-system/theme/ThemeToggle.tsx',
] as const;

const MARKUP_SOURCE = new Map<string, string>(
  MARKUP_FILES.map((rel) => [rel, readFileSync(resolve(process.cwd(), rel), 'utf8')]),
);

// ── Token-name constant registry (export name -> CSS custom-property name) ────
//
// Every `export const NAME = '--token'` string in tokens.ts. Markup references
// tokens through these constants, so finding a constant identifier in a markup
// source tells us which token that file references.

const CONSTANT_TO_TOKEN: Record<string, string> = {};
for (const [exportName, value] of Object.entries(Tokens)) {
  if (typeof value === 'string' && value.startsWith('--')) {
    CONSTANT_TO_TOKEN[exportName] = value;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The set of Theme_Tokens a markup source references, found two ways:
 *  - a token-name constant identifier appears (whole-word) in the source, or
 *  - a literal `var(--token)` reference appears.
 */
function referencedTokensIn(src: string): Set<string> {
  const tokens = new Set<string>();
  for (const [exportName, tokenName] of Object.entries(CONSTANT_TO_TOKEN)) {
    if (new RegExp(`\\b${escapeRegExp(exportName)}\\b`).test(src)) {
      tokens.add(tokenName);
    }
  }
  for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) {
    tokens.add(m[1]);
  }
  return tokens;
}

/** Union of every Theme_Token referenced across all Landing markup files. */
const REFERENCED_TOKENS = Array.from(
  [...MARKUP_SOURCE.values()].reduce<Set<string>>((acc, src) => {
    for (const t of referencedTokensIn(src)) acc.add(t);
    return acc;
  }, new Set<string>()),
).sort();

// ── index.css scope parsing ──────────────────────────────────────────────────

/** Strip CSS block comments so they never pollute declaration parsing. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extract the declaration body of the first rule whose selector text starts
 * with `selector`. The targeted rules (`:root`, the dark scope, `@theme inline`)
 * contain only flat declarations, so the first `}` after the opening `{` closes
 * the block.
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

const cleaned = stripComments(CSS);

/** The three scopes in which canonical Theme_Tokens are declared. */
const SCOPES: Record<string, string> = {
  ':root': extractBlock(cleaned, ':root {'),
  '[data-theme="dark"], .dark': extractBlock(cleaned, '[data-theme="dark"], .dark {'),
  '@theme inline': extractBlock(cleaned, '@theme inline {'),
};

/**
 * Count canonical declarations of a token within a scope body. A declaration is
 * the exact token name followed by `:`. The negative lookbehind for a name/dash
 * char prevents matching longer names that end in the target (e.g. counting
 * `--primary` must not match `--color-primary` or `--primary-light`).
 */
function declCount(block: string, name: string): number {
  const re = new RegExp(`(?<![-\\w])${escapeRegExp(name)}\\s*:`, 'g');
  return (block.match(re) ?? []).length;
}

/** Total canonical declarations of a token across all scopes. */
function totalDeclCount(name: string): number {
  return Object.values(SCOPES).reduce((sum, block) => sum + declCount(block, name), 0);
}

// ── Pre-existing (legacy) tokens — must still resolve (Req 10.4) ──────────────
//
// The original :root palette names that pre-date the redesign. Asserting each
// is still declared proves the additive redesign renamed/removed none of them.

const PREEXISTING_TOKENS = [
  '--background', '--foreground', '--card', '--card-foreground', '--popover', '--popover-foreground',
  '--primary', '--primary-light', '--primary-dark', '--primary-foreground',
  '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
  '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
  '--border', '--input', '--ring',
  '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5',
  '--radius',
  '--sidebar', '--sidebar-foreground', '--sidebar-primary', '--sidebar-primary-foreground',
  '--sidebar-accent', '--sidebar-accent-foreground', '--sidebar-border', '--sidebar-ring',
] as const;

/** Inline hex color literal, e.g. #fff or #0d2520. */
const HEX_LITERAL = /#[0-9a-fA-F]{3,6}\b/;

// ── Sanity guards on the derived inputs ──────────────────────────────────────

describe('Property 1: Token integrity — derivation guards', () => {
  it('derives a non-empty set of tokens referenced by the Landing markup', () => {
    expect(REFERENCED_TOKENS.length).toBeGreaterThan(0);
  });

  it('loaded every Landing markup file', () => {
    for (const rel of MARKUP_FILES) {
      expect(MARKUP_SOURCE.get(rel), `missing source for ${rel}`).toBeTruthy();
    }
  });
});

describe('Property 1: Token integrity', () => {
  // (a) Each referenced token resolves to exactly one canonical declaration per
  //     scope and is declared in at least one scope. Req 1.5, 10.1.
  it('(a) every token referenced by Landing markup resolves to exactly one canonical declaration per scope', () => {
    fc.assert(
      fc.property(fc.constantFrom(...REFERENCED_TOKENS), (token) => {
        const perScope = Object.entries(SCOPES).map(([scope, block]) => ({
          scope,
          count: declCount(block, token),
        }));

        // No scope declares the token more than once (no duplicate within a scope).
        for (const { scope, count } of perScope) {
          expect(
            count,
            `token "${token}" is declared ${count} times in ${scope} (expected at most 1)`,
          ).toBeLessThanOrEqual(1);
        }

        // The token resolves: it has at least one canonical declaration.
        const total = perScope.reduce((sum, s) => sum + s.count, 0);
        expect(total, `token "${token}" referenced by markup but not declared in src/index.css`).toBeGreaterThanOrEqual(1);
      }),
      RUNS,
    );
  });

  // (b) Every pre-existing token name still resolves in :root. Req 10.4.
  it('(b) every pre-existing token name still resolves (no renames/removals)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PREEXISTING_TOKENS), (token) => {
        expect(
          declCount(SCOPES[':root'], token),
          `pre-existing token "${token}" is no longer declared in :root`,
        ).toBeGreaterThanOrEqual(1);
      }),
      RUNS,
    );
  });

  // (c) No inline hex literal appears in any Landing markup file. Req 1.5.
  it('(c) no inline hex color literal appears in the Landing markup', () => {
    fc.assert(
      fc.property(fc.constantFrom(...MARKUP_FILES), (file) => {
        const src = MARKUP_SOURCE.get(file)!;
        const match = src.match(HEX_LITERAL);
        expect(
          match,
          match ? `inline hex literal "${match[0]}" found in ${file}` : undefined,
        ).toBeNull();
      }),
      RUNS,
    );
  });

  // Deterministic, exhaustive companion pass that reports concrete findings so a
  // violation surfaces as a named token/file rather than a single counterexample.
  it('reports per-token scope declaration counts and per-file hex scan', () => {
    const tokenReport = REFERENCED_TOKENS.map((token) => {
      const counts = Object.fromEntries(
        Object.entries(SCOPES).map(([scope, block]) => [scope, declCount(block, token)]),
      );
      const total = totalDeclCount(token);
      // Invariants asserted exhaustively here too.
      for (const [, count] of Object.entries(counts)) expect(count).toBeLessThanOrEqual(1);
      expect(total).toBeGreaterThanOrEqual(1);
      return { token, ...counts, total };
    });

    const hexReport = MARKUP_FILES.map((file) => {
      const match = MARKUP_SOURCE.get(file)!.match(HEX_LITERAL);
      expect(match, match ? `inline hex literal "${match[0]}" found in ${file}` : undefined).toBeNull();
      return { file, hexLiteral: match ? match[0] : 'none' };
    });

    // eslint-disable-next-line no-console
    console.table(tokenReport);
    // eslint-disable-next-line no-console
    console.table(hexReport);
  });
});
