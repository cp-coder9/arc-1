// Feature: website-ui-redesign, Property 5
//
// Property-based tests for the responsive Landing_Page layout.
// Validates Requirements 7.4, 7.5.
//
// Property 5 — "Responsive layout has no horizontal overflow":
//   For all viewport widths in [320, 3840], the rendered Landing_Page content
//   width is <= the viewport width and the Bird_Mark, headline, subline, and
//   Primary_CTA remain present and uncut.
//
// jsdom layout limitation
// -----------------------
// jsdom does NOT implement a real layout/reflow engine: every element reports a
// zero-sized bounding box and `scrollWidth`/`clientWidth` are always 0, so a
// pure pixel measurement of "content width <= viewport width" is not feasible
// here (that fidelity belongs to the Playwright E2E layer). This suite uses the
// pragmatic, jsdom-feasible approach the task prescribes, validating the
// REQUIREMENT INTENT across generated widths:
//
//   (1) Req 7.5 — horizontal scrolling is prevented BY CONSTRUCTION: the
//       Landing_Page root carries the `overflow-x-hidden` class at every width,
//       so the browser cannot produce horizontal scroll regardless of content.
//   (2) Req 7.4 — the Bird_Mark activator, the single <h1> headline, the
//       subline, and the "Enter OS" Primary_CTA are all rendered (present and
//       uncut) at every generated viewport width.

import { render, within } from '@testing-library/react';
import fc from 'fast-check';

import { LandingPage } from '../LandingPage';
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';
import { HERO_COPY } from '../copy';

const RUNS = { numRuns: 100 } as const;

// LandingPage measures its container via `new ResizeObserver(...)`. The shared
// test setup installs a non-constructable arrow-function ResizeObserver mock, so
// install a proper class-based no-op observer for this suite (jsdom has none).
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

/** Requirement 7.4/7.5 viewport bounds, inclusive. */
const MIN_WIDTH = 320;
const MAX_WIDTH = 3840;

/** Accessible name of the interactive Bird_Mark activator (BirdMark.tsx). */
const BIRD_MARK_NAME = /Enter Architex OS/i;
/** Accessible name / label of the "Enter OS" Primary_CTA (TopBar + Hero). */
const ENTER_OS_NAME = /^Enter OS$/i;

const originalInnerWidth = window.innerWidth;

/** Set the jsdom viewport width and notify listeners, as a browser resize would. */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

function renderLandingAt(width: number) {
  setViewportWidth(width);
  return render(
    <ThemeProvider defaultTheme="dark">
      <LandingPage onSignUp={() => {}} onNavigate={() => {}} onSignIn={() => {}} />
    </ThemeProvider>,
  );
}

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: originalInnerWidth,
  });
});

describe('Property 5: Responsive layout has no horizontal overflow', () => {
  // Req 7.5 — the root prevents horizontal scrolling by construction at every
  // viewport width in [320, 3840].
  it('keeps overflow-x hidden on the Landing_Page root at every width', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_WIDTH, max: MAX_WIDTH }),
        (width) => {
          const { container, unmount } = renderLandingAt(width);
          try {
            // The Landing_Page root is the single top-level element rendered by
            // LandingPage (ThemeProvider adds no DOM node).
            const root = container.firstElementChild as HTMLElement | null;
            expect(root).not.toBeNull();
            expect(root!.className).toContain('overflow-x-hidden');
          } finally {
            unmount();
          }
        },
      ),
      RUNS,
    );
  }, 60_000);

  // Req 7.4 — the Bird_Mark, single headline, subline, and Primary_CTA all
  // remain present and uncut (rendered in the DOM) at every viewport width.
  it('renders the Bird_Mark, single headline, subline, and Enter OS CTA at every width', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_WIDTH, max: MAX_WIDTH }),
        (width) => {
          const { container, unmount } = renderLandingAt(width);
          try {
            const scope = within(container);

            // Bird_Mark activator — at least one interactive mark present.
            // (There may be multiple BirdMarks across the page; query robustly.)
            expect(
              scope.getAllByRole('button', { name: BIRD_MARK_NAME }).length,
            ).toBeGreaterThanOrEqual(1);

            // Exactly one level-one heading, containing the Hero headline.
            const h1s = container.querySelectorAll('h1');
            expect(h1s).toHaveLength(1);
            expect(h1s[0].textContent ?? '').toContain(HERO_COPY.headline);

            // Subline text present and uncut.
            expect(
              scope.getAllByText(HERO_COPY.subline).length,
            ).toBeGreaterThanOrEqual(1);

            // Enter OS Primary_CTA — at least one present (TopBar + Hero both
            // expose an "Enter OS" control; query robustly).
            expect(
              scope.getAllByRole('button', { name: ENTER_OS_NAME }).length,
            ).toBeGreaterThanOrEqual(1);
          } finally {
            unmount();
          }
        },
      ),
      RUNS,
    );
  }, 60_000);
});
