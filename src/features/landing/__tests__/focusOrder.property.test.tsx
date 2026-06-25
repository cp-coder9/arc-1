// Feature: website-ui-redesign, Property 11
//
// Property-based tests for Landing_Page keyboard focus order.
// Validates Requirements 9.7.
//
// Property 11 — "Focus order follows reading order":
//   For all keyboard traversals, focus visits controls grouped
//   Top_Bar → Hero_Section → Quick_Nav. Once focus leaves a group it never
//   returns to an earlier group — i.e. the sequence of group indices observed
//   while tabbing through the page is NON-DECREASING (TopBar=0 ≤ Hero=1 ≤
//   QuickNav=2).
//
// Approach
// --------
// LandingPage renders its content column in DOM order TopBar → Hero (<main>) →
// Quick_Nav (<nav>), and uses no positive tabIndex, so the browser focus order
// equals DOM order. We tab forward from the top a generated number of steps,
// record the order in which controls receive focus, and classify each focused
// control by DOM containment (which of the TopBar <header>, Hero <main>, or
// Quick_Nav <nav> contains it). DOM containment disambiguates the two distinct
// "Enter OS" controls (one in the Top_Bar, one in the Hero) more robustly than
// accessible-name matching.
//
// jsdom note: LandingPage measures its container via `new ResizeObserver(...)`.
// The shared setup installs a non-constructable mock, so this suite installs a
// class-based no-op ResizeObserver. @testing-library/user-event drives Tab.

import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { LandingPage } from '../LandingPage';
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';

const RUNS = { numRuns: 100 } as const;

// Class-based no-op ResizeObserver (jsdom has none; the shared mock is a
// non-constructable arrow function).
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
  document.body.innerHTML = '';
});

/** Reading-order group indices (Req 9.7): TopBar=0 ≤ Hero=1 ≤ QuickNav=2. */
const GROUP_TOP_BAR = 0;
const GROUP_HERO = 1;
const GROUP_QUICK_NAV = 2;

/**
 * Classify a focused element by DOM containment. Returns the group index of the
 * section container that contains it, or `null` when the element belongs to
 * none of the three Landing_Page sections.
 */
function classify(
  el: Element,
  header: HTMLElement,
  main: HTMLElement,
  nav: HTMLElement,
): number | null {
  if (header.contains(el)) return GROUP_TOP_BAR;
  if (main.contains(el)) return GROUP_HERO;
  if (nav.contains(el)) return GROUP_QUICK_NAV;
  return null;
}

function renderLanding() {
  return render(
    <ThemeProvider defaultTheme="dark">
      <LandingPage onSignUp={() => {}} onNavigate={() => {}} onSignIn={() => {}} />
    </ThemeProvider>,
  );
}

describe('Property 11: Focus order follows reading order', () => {
  // The total number of focusable Landing controls is fixed (TopBar: 3, Hero: 2,
  // Quick_Nav: 4 = 9). We generate a traversal length and tab that many steps,
  // breaking early if focus wraps (returns to an already-visited control or to
  // <body>), then assert the recorded group sequence is non-decreasing.
  //
  // The page is rendered ONCE and reused across runs (focus is reset to <body>
  // before each traversal) so the 100 iterations stay well within budget.
  it('produces a non-decreasing group sequence while tabbing forward', async () => {
    const user = userEvent.setup({ delay: null });
    const { container, unmount } = renderLanding();
    try {
      const scope = within(container);
      const header = scope.getByRole('banner') as HTMLElement; // <header>
      const main = container.querySelector('main') as HTMLElement;
      const nav = scope.getByRole('navigation') as HTMLElement; // <nav>
      expect(header).not.toBeNull();
      expect(main).not.toBeNull();
      expect(nav).not.toBeNull();

      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (numSteps) => {
          // Reset focus to the top of the document so each traversal starts
          // fresh from before the first control.
          (document.activeElement as HTMLElement | null)?.blur();
          document.body.focus();

          const groups: number[] = [];
          const seen = new Set<Element>();

          for (let i = 0; i < numSteps; i++) {
            await user.tab();
            const active = document.activeElement;
            if (!active || active === document.body) break; // wrapped / left page
            if (seen.has(active)) break; // completed a full cycle
            seen.add(active);

            const g = classify(active, header, main, nav);
            if (g !== null) groups.push(g);
          }

          // The observed sequence of group indices must be non-decreasing:
          // once focus leaves TopBar it never returns, then once it leaves Hero
          // it never returns (Req 9.7).
          for (let i = 1; i < groups.length; i++) {
            expect(groups[i]).toBeGreaterThanOrEqual(groups[i - 1]);
          }
        }),
        RUNS,
      );
    } finally {
      unmount();
    }
  }, 30000);
});
