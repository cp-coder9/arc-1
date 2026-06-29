// Feature: website-ui-redesign, Property 9
//
// Property 9: Accessible name present — Validates Requirements 9.4, 14.9
//
// Req 9.4: "THE System SHALL provide an accessible name that conveys the
//   control's purpose for the Sign_Up_Action, the Primary_CTA, and each
//   Quick_Nav item."
// Req 9.9: the Bird_Mark activator carries an accessible name indicating it
//   enters the Architex OS.
// Req 14.9: the Theme_Toggle exposes a non-empty accessible name conveying that
//   it switches the color theme.
//
// The property: for the full set of required Landing_Page controls —
// Sign_Up_Action, Primary_CTA, each Quick_Nav item, the interactive Bird_Mark
// activator, and the Theme_Toggle — each renders as a button whose COMPUTED
// accessible name is non-empty and conveys its purpose (matches the expected,
// human-meaningful name). We generate which required control to check across
// ≥100 runs and, for every matching instance on the page, assert the accessible
// name computed by the platform accessible-name algorithm
// (`dom-accessibility-api`, the same engine Testing Library's `name` option
// uses) is a non-empty, purpose-conveying string.

import { render, cleanup, type RenderResult } from '@testing-library/react';
import { computeAccessibleName } from 'dom-accessibility-api';
import fc from 'fast-check';

import { LandingPage } from '../LandingPage';
import { QUICK_NAV_ITEMS } from '../QuickNav';
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';

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

// ── The required controls and their expected accessible names ──────────────
// Each entry pairs the control's stable id (for readable counterexamples) with
// the exact, purpose-conveying accessible name it must expose. Built from the
// canonical QUICK_NAV_ITEMS so the four Quick_Nav labels stay in lock-step with
// the source of truth (Req 5.1/5.2).
interface RequiredControl {
  id: string;
  /** The exact accessible name the control must expose (Req 9.4/9.9/14.9). */
  expectedName: string;
}

const REQUIRED_CONTROLS: readonly RequiredControl[] = [
  // Sign_Up_Action (Req 3.4, 9.4).
  { id: 'sign-up', expectedName: 'Sign up' },
  // Primary_CTA "Enter OS" — present in both the Top_Bar and the Hero (Req 4.5/9.4).
  { id: 'primary-cta', expectedName: 'Enter OS' },
  // Each Quick_Nav item (Req 5.1/9.4): People, Projects, Approvals, Payments.
  ...QUICK_NAV_ITEMS.map((item) => ({
    id: `quick-nav-${item.id}`,
    expectedName: item.label,
  })),
  // The interactive Bird_Mark activator (Req 9.9).
  { id: 'bird-mark', expectedName: 'Enter Architex OS' },
  // The Theme_Toggle (Req 14.9).
  { id: 'theme-toggle', expectedName: 'Switch color theme' },
];

const controlArb: fc.Arbitrary<RequiredControl> = fc.constantFrom(
  ...REQUIRED_CONTROLS,
);

function renderLanding(): RenderResult {
  return render(
    <ThemeProvider defaultTheme="dark">
      <LandingPage onSignUp={() => {}} onNavigate={() => {}} onSignIn={() => {}} />
    </ThemeProvider>,
  );
}

/**
 * Find every control with the `button` role (native `<button>` OR an element
 * with `role="button"`, e.g. the interactive Bird_Mark activator) whose
 * COMPUTED accessible name exactly equals `expectedName`. Using the platform
 * accessible-name algorithm directly (rather than Testing Library's `name`
 * matcher) lets us assert the same value we then verify is non-empty and
 * purpose-conveying.
 */
function findButtonsByAccessibleName(
  container: HTMLElement,
  expectedName: string,
): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ).filter((el) => computeAccessibleName(el) === expectedName);
}

afterEach(() => {
  cleanup();
});

describe('Property 9: Accessible name present', () => {
  it('every required control exposes a non-empty, purpose-conveying accessible name (Req 9.4, 9.9, 14.9)', () => {
    fc.assert(
      fc.property(controlArb, (control) => {
        const { container } = renderLanding();
        try {
          const matches = findButtonsByAccessibleName(
            container,
            control.expectedName,
          );

          // The required control must be present at least once.
          expect(matches.length).toBeGreaterThanOrEqual(1);

          // Every matching instance has a non-empty accessible name that
          // conveys its purpose (equals the expected, human-meaningful name).
          for (const el of matches) {
            const name = computeAccessibleName(el);
            expect(name).toBeTruthy();
            expect(name.trim().length).toBeGreaterThan(0);
            expect(name).toBe(control.expectedName);
          }
        } finally {
          cleanup();
        }
      }),
      RUNS,
    );
  }, 60_000);

  it('all required controls are simultaneously present with their accessible names', () => {
    const { container } = renderLanding();
    for (const control of REQUIRED_CONTROLS) {
      const matches = findButtonsByAccessibleName(container, control.expectedName);
      expect(
        matches.length,
        `expected control "${control.id}" with accessible name "${control.expectedName}" to be present`,
      ).toBeGreaterThanOrEqual(1);
      for (const el of matches) {
        expect(computeAccessibleName(el).trim().length).toBeGreaterThan(0);
      }
    }
  });
});
