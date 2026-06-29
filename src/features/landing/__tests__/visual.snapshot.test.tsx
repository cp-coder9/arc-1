// Feature: website-ui-redesign
//
// Snapshot / "visual" tests for Landing_Page layout and material fidelity.
// Validates Requirements 6.2, 7.2, 7.3 (aligned to the two `mockups/` references:
// `mockups/landing-flock-mockup.html` and `mockups/design-system-preview.html`).
//
// jsdom limitation
// ----------------
// jsdom has NO real layout/visual rendering engine: every element reports a
// zero-sized bounding box, no CSS from stylesheets is computed (Vitest runs with
// `css: false`), and there is no compositor for blur/translucency. True
// pixel-level / visual fidelity (actual glass blur, real responsive reflow,
// crisp-PNG rasterisation) therefore belongs to the Playwright E2E layer.
//
// What we CAN assert here, deterministically, is the DOM contract that the
// visual design rests on:
//   (a) a stable DOM STRUCTURE for the whole Landing_Page (toMatchSnapshot) in
//       both Theme_Modes, captured with reduced motion so framer-motion adds no
//       animation noise and the snapshot is reproducible on re-run;
//   (b) responsive STACKING ORDER (Req 7.2 / 7.3) — by construction the three
//       sections render in reading order Top_Bar (<header>) → Hero (<main>) →
//       Quick_Nav (<nav>) inside a flex column, with the root clipping
//       horizontal overflow; pixels can't be measured in jsdom, so we assert the
//       structural order + the flex-column / overflow-x-hidden layout classes;
//   (c) material fidelity proxies — the GlassSurface `.glass` class for the card
//       and pill variants, and Bird_Mark PNG "crispness" (Req 6.2): an <img>
//       with a 1x/2x `srcSet` and explicit `width`/`height` for both the Top_Bar
//       and hero rendered sizes.

import { cleanup, render, within } from '@testing-library/react';

import { LandingPage } from '../LandingPage';
import { GlassSurface } from '@/design-system/GlassSurface';
import { BirdMark } from '@/design-system/BirdMark';
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';
import type { ThemeMode } from '@/design-system/theme/ThemeContext';
import { HERO_COPY } from '../copy';

// LandingPage measures its container via `new ResizeObserver(...)`. The shared
// test setup installs a non-constructable arrow-function ResizeObserver mock, so
// install a proper class-based no-op observer for this suite (jsdom has none).
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Force `prefers-reduced-motion: reduce` so framer-motion's `useReducedMotion()`
// returns true and the page renders its static final state — no entrance,
// twinkle, parallax, or flight transitions — keeping the DOM snapshot stable and
// reproducible across runs. All other media queries keep the default (no match).
function installReducedMotionMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: /prefers-reduced-motion\s*:\s*reduce/i.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: NoopResizeObserver,
  });
});

beforeEach(() => {
  installReducedMotionMatchMedia();
});

afterEach(() => {
  cleanup();
});

function renderLanding(theme: ThemeMode) {
  return render(
    <ThemeProvider defaultTheme={theme}>
      <LandingPage onSignUp={() => {}} onNavigate={() => {}} onSignIn={() => {}} />
    </ThemeProvider>,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// (a) DOM structure snapshots — dark + light Theme_Mode
// ───────────────────────────────────────────────────────────────────────────
describe('Landing_Page DOM structure snapshot (reduced motion)', () => {
  it('matches the stable structure in Dark_Theme', () => {
    const { container } = renderLanding('dark');
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();

    // Structural anchors that the snapshot guards against regression.
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('header')).not.toBeNull(); // Top_Bar
    expect(container.querySelector('main')).not.toBeNull(); // Hero region
    expect(container.querySelector('nav')).not.toBeNull(); // Quick_Nav

    expect(root).toMatchSnapshot();
  });

  it('matches the stable structure in Light_Theme', () => {
    const { container } = renderLanding('light');
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();

    // The same code path renders under both modes; only token-derived styles
    // differ (resolved on the document root), so the DOM structure is identical.
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('header')).not.toBeNull();
    expect(container.querySelector('main')).not.toBeNull();
    expect(container.querySelector('nav')).not.toBeNull();

    expect(root).toMatchSnapshot();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (b) Responsive stacking order (Req 7.2 / 7.3)
// ───────────────────────────────────────────────────────────────────────────
describe('Responsive stacking order (Req 7.2, 7.3)', () => {
  it('stacks Top_Bar → Hero → Quick_Nav in reading/DOM order', () => {
    const { container } = renderLanding('dark');

    const header = container.querySelector('header'); // Top_Bar
    const main = container.querySelector('main'); // Hero
    const nav = container.querySelector('nav'); // Quick_Nav
    expect(header).not.toBeNull();
    expect(main).not.toBeNull();
    expect(nav).not.toBeNull();

    // DOCUMENT_POSITION_FOLLOWING (4) means the argument node comes AFTER the
    // reference node in document order — i.e. header before main before nav.
    expect(
      header!.compareDocumentPosition(main!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      main!.compareDocumentPosition(nav!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('lays the content out as a flex column and clips horizontal overflow', () => {
    const { container } = renderLanding('dark');

    // Root prevents horizontal scrolling by construction at every width (7.2/7.3
    // never produce horizontal overflow / clipping → enforced via the root).
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('overflow-x-hidden');

    // The single content column that holds Top_Bar → Hero → Quick_Nav is a
    // vertical flex column, so the three sections stack top-to-bottom (Req 7.2).
    const header = container.querySelector('header')!;
    const columns = Array.from(container.querySelectorAll('div')).filter((el) =>
      el.className.includes('flex-col'),
    );
    expect(columns.length).toBeGreaterThanOrEqual(1);
    // The flex column is an ancestor of the Top_Bar header.
    const stacksHeader = columns.some((col) => col.contains(header));
    expect(stacksHeader).toBe(true);
  });

  it('renders the Bird_Mark, headline, subline, and Quick_Nav items uncut (Req 7.3)', () => {
    const { container } = renderLanding('dark');
    const scope = within(container);

    // Bird_Mark activator present (Hero) — present and uncut.
    expect(
      scope.getAllByRole('button', { name: /Enter Architex OS/i }).length,
    ).toBeGreaterThanOrEqual(1);
    // Single headline + subline present.
    const h1 = container.querySelector('h1');
    expect(h1?.textContent ?? '').toContain(HERO_COPY.headline);
    expect(scope.getAllByText(HERO_COPY.subline).length).toBeGreaterThanOrEqual(1);
    // All four Quick_Nav labels present without truncation.
    for (const label of ['People', 'Projects', 'Approvals', 'Payments']) {
      expect(scope.getByText(label)).toBeInTheDocument();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (c) Glass appearance + Bird_Mark PNG crispness (Req 6.2)
// ───────────────────────────────────────────────────────────────────────────
describe('Glass_Surface appearance', () => {
  it('renders the `.glass` material for the card variant', () => {
    const { container } = render(
      <GlassSurface variant="card" data-testid="card">
        card
      </GlassSurface>,
    );
    const el = container.querySelector('[data-testid="card"]') as HTMLElement;
    expect(el).toHaveClass('glass');
    expect(el).toHaveClass('rounded-3xl');
    // Snapshot the class composition so the glass material stays stable.
    expect(el.className).toMatchSnapshot('glass-card-className');
  });

  it('renders the `.glass` material for the pill variant', () => {
    const { container } = render(
      <GlassSurface variant="pill" as="button" data-testid="pill">
        Enter OS
      </GlassSurface>,
    );
    const el = container.querySelector('[data-testid="pill"]') as HTMLElement;
    expect(el).toHaveClass('glass');
    expect(el).toHaveClass('rounded-full');
    expect(el.className).toMatchSnapshot('glass-pill-className');
  });
});

describe('Bird_Mark PNG crispness across rendered sizes (Req 6.2)', () => {
  // Crispness across sizes is a real-browser raster concern; in jsdom we assert
  // the proxy contract that delivers it: a high-DPI `srcSet` (1x/2x) plus an
  // explicit intrinsic `width`/`height` for each rendered size, so the browser
  // can downscale the high-resolution PNG without blur from Top_Bar to hero.
  function imgFor(size: 'topbar' | 'hero') {
    const { container } = render(<BirdMark size={size} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    return img as HTMLImageElement;
  }

  it('renders an <img> with a 1x/2x srcSet and explicit size at the Top_Bar size', () => {
    const img = imgFor('topbar');
    const srcSet = img.getAttribute('srcset') ?? '';
    expect(srcSet).toMatch(/1x/);
    expect(srcSet).toMatch(/2x/);
    expect(img.getAttribute('width')).toBe('40');
    expect(img.getAttribute('height')).toBe('40');
  });

  it('renders an <img> with a 1x/2x srcSet and explicit size at the hero size', () => {
    const img = imgFor('hero');
    const srcSet = img.getAttribute('srcset') ?? '';
    expect(srcSet).toMatch(/1x/);
    expect(srcSet).toMatch(/2x/);
    expect(img.getAttribute('width')).toBe('280');
    expect(img.getAttribute('height')).toBe('280');
  });
});
