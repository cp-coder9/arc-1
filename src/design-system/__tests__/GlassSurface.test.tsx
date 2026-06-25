/**
 * Unit tests for the GlassSurface primitive and the canonical `.glass` material.
 *
 * Feature: website-ui-redesign (Task 2.2)
 * Validates: Requirements 2.1, 2.5
 *
 * Because jsdom does not compute real CSS from stylesheets (and Vitest runs with
 * `css: false`), this suite asserts at two complementary levels:
 *
 *  1. Component level — render `GlassSurface` and assert it carries the canonical
 *     `.glass` class and the correct variant radius class, renders a polymorphic
 *     `as` element, and forwards arbitrary props/children/ref onto that element.
 *  2. Stylesheet level — read `src/index.css` as text and assert the `.glass`
 *     rule declares exactly the four named Glass_Surface layers (Req 2.1):
 *       - backdrop blur            (`backdrop-filter: blur(var(--glass-blur)) ...`)
 *       - layered translucency     (`background: var(--glass-bg)`)
 *       - light-toned border       (`border: 1px solid var(--glass-border)`)
 *       - outer glow box-shadow    (`box-shadow: ... var(--glass-glow) ...`)
 *     and that the `@supports not (backdrop-filter ...)` block applies an opaque
 *     fallback background (`var(--landing-bg-deep)`) so the surface stays visible
 *     and legible when backdrop-filter is unsupported (Req 2.5).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { GlassSurface } from '../GlassSurface';

/**
 * The canonical stylesheet text, read once from `src/index.css`.
 * Vitest runs from the workspace root, so resolve the path from `process.cwd()`
 * (jsdom does not expose a `file:` `import.meta.url`).
 */
const CSS_PATH = path.resolve(process.cwd(), 'src', 'index.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

/**
 * Extract the body of the first `.glass { ... }` rule (the canonical definition,
 * NOT the `@supports` override). We locate the `.glass {` that is immediately
 * preceded by something other than the `@supports` selector by scanning for the
 * first occurrence and capturing up to its matching close brace.
 */
function firstGlassRuleBody(css: string): string {
  const idx = css.indexOf('.glass {');
  expect(idx).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('GlassSurface — component', () => {
  it('renders a div by default carrying the canonical `.glass` class', () => {
    render(<GlassSurface data-testid="surface">content</GlassSurface>);
    const el = screen.getByTestId('surface');
    expect(el.tagName).toBe('DIV');
    expect(el).toHaveClass('glass');
  });

  it('applies the card radius for the default/`card` variant', () => {
    render(
      <GlassSurface data-testid="card" variant="card">
        card
      </GlassSurface>,
    );
    const el = screen.getByTestId('card');
    expect(el).toHaveClass('glass');
    expect(el).toHaveClass('rounded-3xl');
    expect(el).not.toHaveClass('rounded-full');
  });

  it('applies the fully-rounded radius for the `pill` variant', () => {
    render(
      <GlassSurface data-testid="pill" variant="pill">
        pill
      </GlassSurface>,
    );
    const el = screen.getByTestId('pill');
    expect(el).toHaveClass('glass');
    expect(el).toHaveClass('rounded-full');
    expect(el).not.toHaveClass('rounded-3xl');
  });

  it('renders a polymorphic `as` element (e.g. button)', () => {
    render(
      <GlassSurface as="button" data-testid="btn">
        Enter OS
      </GlassSurface>,
    );
    const el = screen.getByTestId('btn');
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveClass('glass');
  });

  it('forwards arbitrary props, children, and merges className', () => {
    render(
      <GlassSurface data-testid="surface" className="extra" aria-label="panel">
        <span>child</span>
      </GlassSurface>,
    );
    const el = screen.getByTestId('surface');
    // Forwarded props
    expect(el).toHaveAttribute('aria-label', 'panel');
    // Merged className keeps both the utility and the caller class
    expect(el).toHaveClass('glass');
    expect(el).toHaveClass('extra');
    // Children render
    expect(el).toContainHTML('<span>child</span>');
  });

  it('forwards its ref to the rendered element', () => {
    const ref = createRef<HTMLElement>();
    render(
      <GlassSurface ref={ref} as="section" data-testid="sec">
        s
      </GlassSurface>,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('SECTION');
    expect(ref.current).toHaveClass('glass');
  });
});

describe('.glass material — four named layers (Req 2.1)', () => {
  const body = firstGlassRuleBody(CSS);

  it('declares the backdrop blur layer (layer 1)', () => {
    expect(body).toMatch(/backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
    // The -webkit- prefixed variant is also present for Safari support.
    expect(CSS).toMatch(/-webkit-backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
  });

  it('declares the layered background translucency layer (layer 2)', () => {
    expect(body).toMatch(/background:\s*var\(--glass-bg\)/);
  });

  it('declares the light-toned border layer (layer 3)', () => {
    expect(body).toMatch(/border:\s*1px\s+solid\s+var\(--glass-border\)/);
  });

  it('declares the outer glow box-shadow layer (layer 4)', () => {
    // The box-shadow includes an outer glow driven by the --glass-glow token.
    expect(body).toMatch(/box-shadow:[\s\S]*var\(--glass-glow\)/);
  });

  it('derives all four layers from --glass-* tokens (no literal colors for them)', () => {
    expect(body).toContain('var(--glass-blur)');
    expect(body).toContain('var(--glass-bg)');
    expect(body).toContain('var(--glass-border)');
    expect(body).toContain('var(--glass-glow)');
  });
});

describe('.glass material — opaque fallback (Req 2.5)', () => {
  it('defines an `@supports not (backdrop-filter ...)` block', () => {
    expect(CSS).toMatch(
      /@supports\s+not\s*\(\s*\(?backdrop-filter:\s*blur\(1px\)\)?/,
    );
  });

  it('applies an opaque deep-teal background in the fallback so content stays legible', () => {
    // Capture the @supports block body and assert it overrides .glass background
    // with the opaque --landing-bg-deep token (no transparency → preserves contrast).
    const supportsIdx = CSS.indexOf('@supports not');
    expect(supportsIdx).toBeGreaterThanOrEqual(0);
    const fallbackBlock = CSS.slice(supportsIdx, supportsIdx + 400);
    expect(fallbackBlock).toContain('.glass');
    expect(fallbackBlock).toMatch(/background:\s*var\(--landing-bg-deep\)/);
  });
});
