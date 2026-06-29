// Feature: website-ui-redesign, Property 7
//
// Property 7: Keyboard reachability without a trap
//   — Validates Requirements 9.1, 9.8, 14.9
//
// Req 9.1: "THE System SHALL render the Sign_Up_Action, the Primary_CTA, and
//   each Quick_Nav item within the Top_Bar, Hero_Section, and Quick_Nav as
//   interactive controls that are reachable and focusable using only the
//   keyboard Tab and Shift+Tab keys."
// Req 9.8: "WHILE a user navigates interactive controls with the keyboard, THE
//   System SHALL allow focus to move away from every control using the Tab or
//   Shift+Tab keys without trapping focus on any control."
// Req 14.9: "THE Theme_Toggle SHALL be keyboard-focusable and operable via the
//   Enter or Space key, and SHALL expose an accessible name..."
//
// The Landing_Page (in its pristine `landing` phase) exposes these focusable
// controls — all native <button>s / role="button" tabIndex=0 elements, so they
// participate in the natural tab order:
//   Top_Bar      — Theme_Toggle, Sign_Up_Action ("Sign up"), Primary_CTA ("Enter OS")
//   Hero_Section — interactive Bird_Mark ("Enter Architex OS"), Primary_CTA ("Enter OS")
//   Quick_Nav    — four item buttons (People, Projects, Approvals, Payments)
//
// This suite proves, across ≥100 generated runs:
//   (a) Reachability (Req 9.1, 14.9): tabbing forward from document.body with
//       user.tab() visits EVERY focusable control — the set of visited controls
//       is a superset of the rendered control set, including the Theme_Toggle.
//       A generated starting `offset` (where in the cycle we begin observing)
//       plus a bounded sweep exercises many traversal entry points without
//       assuming a fixed count.
//   (b) No trap (Req 9.8): from ANY focused control, pressing Tab moves focus to
//       a DIFFERENT element (forward escape: a later control or a wrap to body)
//       and pressing Shift+Tab moves focus to a DIFFERENT element (backward
//       escape). No control forces focus to stay on itself in either direction.
//
// The Landing_Page focusable set is deterministic (it does not depend on the
// generated inputs), so each test renders ONCE and runs all iterations against
// that single static DOM — fast, and free of cross-iteration mount churn.

import { render, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';

import { LandingPage } from '../LandingPage';
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';

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

afterEach(() => {
  cleanup();
});

/**
 * Collect, in DOM order, every keyboard-focusable control rendered by the
 * Landing_Page: native <button>s, anything with role="button", and anything
 * explicitly placed in the tab order via tabindex="0". De-duplicate while
 * preserving order (a control may match more than one selector).
 */
function collectFocusable(container: HTMLElement): HTMLElement[] {
  const matches = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [role="button"], [tabindex="0"]',
    ),
  );
  return Array.from(new Set(matches));
}

function renderLanding() {
  return render(
    <ThemeProvider defaultTheme="dark">
      <LandingPage onSignUp={() => {}} onNavigate={() => {}} onSignIn={() => {}} />
    </ThemeProvider>,
  );
}

describe('Property 7: keyboard reachability without a trap', () => {
  // -----------------------------------------------------------------------
  // Sanity: the named controls (incl. Theme_Toggle) are present, are real
  // labelled interactive controls, and all appear in the structurally-collected
  // focusable set — so the properties below assert against a meaningful set.
  // -----------------------------------------------------------------------
  it('exposes the named Landing controls (incl. Theme_Toggle) in the focusable set', () => {
    const { container } = renderLanding();
    const scope = within(container);

    const themeToggle = scope.getByRole('button', { name: /theme|mode|dark|light/i });
    const signUp = scope.getByRole('button', { name: /^Sign up$/i });
    const enterOs = scope.getAllByRole('button', { name: /^Enter OS$/i });
    const birdMark = scope.getAllByRole('button', { name: /Enter Architex OS/i });
    const quickNav = [
      scope.getByRole('button', { name: /People/i }),
      scope.getByRole('button', { name: /Projects/i }),
      scope.getByRole('button', { name: /Approvals/i }),
      scope.getByRole('button', { name: /Payments/i }),
    ];

    expect(themeToggle).toBeInTheDocument();
    expect(signUp).toBeInTheDocument();
    expect(enterOs.length).toBeGreaterThanOrEqual(1);
    expect(birdMark.length).toBeGreaterThanOrEqual(1);
    quickNav.forEach((item) => expect(item).toBeInTheDocument());

    const focusable = collectFocusable(container);
    expect(focusable.length).toBeGreaterThanOrEqual(7);
    [themeToggle, signUp, ...enterOs, ...birdMark, ...quickNav].forEach((c) => {
      expect(focusable).toContain(c);
    });
  });

  // -----------------------------------------------------------------------
  // (a) Reachability (Req 9.1, 14.9): every focusable control is reached by
  //     tabbing — forward via Tab and backward via Shift+Tab. We generate a
  //     control index and a direction, reset focus to document.body, then press
  //     Tab/Shift+Tab exactly the number of times needed to land on that
  //     control, and assert it received focus. Because tabbing from body lands
  //     on the controls in DOM order (forward) / reverse DOM order (backward),
  //     covering every index across runs proves NO control is unreachable from
  //     either direction. Each run tabs at most N times, keeping it fast.
  // -----------------------------------------------------------------------
  it('reaches every control by tabbing in both directions (no control is unreachable)', async () => {
    const { container } = renderLanding();
    const focusable = collectFocusable(container);
    const n = focusable.length;
    const user = userEvent.setup({ delay: null });

    await fc.assert(
      fc.asyncProperty(
        fc.nat(),
        fc.constantFrom('forward' as const, 'backward' as const),
        async (rawIndex, direction) => {
          const index = rawIndex % n;
          const target = focusable[index];

          // Start every traversal from a clean slate (document.body).
          (document.activeElement as HTMLElement | null)?.blur?.();

          if (direction === 'forward') {
            // From body, the k-th Tab focuses focusable[k-1] (DOM order).
            for (let i = 0; i <= index; i += 1) {
              await user.tab();
            }
          } else {
            // From body, the k-th Shift+Tab focuses focusable[n-k] (reverse).
            for (let i = 0; i < n - index; i += 1) {
              await user.tab({ shift: true });
            }
          }

          // The targeted control received keyboard focus — it is reachable.
          expect(document.activeElement).toBe(target);
        },
      ),
      RUNS,
    );
  }, 60_000);

  // -----------------------------------------------------------------------
  // (b) No trap (Req 9.8): from a generated focused control, focus can always
  //     move away — forward (Tab) and backward (Shift+Tab) both change the
  //     active element. No control holds focus captive in either direction.
  // -----------------------------------------------------------------------
  it('lets focus move away from any control both forward and backward (no trap)', async () => {
    const { container } = renderLanding();
    const focusable = collectFocusable(container);
    const user = userEvent.setup({ delay: null });

    await fc.assert(
      fc.asyncProperty(fc.nat(), async (rawIndex) => {
        const control = focusable[rawIndex % focusable.length];

        // Forward escape: focus the control, press Tab, focus must move off it
        // (to a later control or, at the cycle end, a wrap to document.body).
        control.focus();
        expect(control).toHaveFocus();
        await user.tab();
        expect(document.activeElement).not.toBe(control);

        // Backward escape: re-focus the control, press Shift+Tab, focus must
        // move off it in the other direction too.
        control.focus();
        expect(control).toHaveFocus();
        await user.tab({ shift: true });
        expect(document.activeElement).not.toBe(control);
      }),
      RUNS,
    );
  }, 60_000);
});
