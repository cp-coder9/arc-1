// Feature: website-ui-redesign, Property 8
//
// Property 8: Keyboard activation — Validates Requirements 9.2, 14.9
//
// Req 9.2: "WHEN an interactive control in the Top_Bar, Hero_Section, or
// Quick_Nav has keyboard focus and the user presses the Enter key or, for button
// controls, the Space key, THE System SHALL invoke that control's activation
// behavior."
// Req 14.9: the Theme_Toggle is keyboard-operable via Enter/Space.
//
// The Landing_Page's interactive button controls are:
//   - Top_Bar:  Theme_Toggle (toggles the Theme_Mode), Sign_Up_Action
//               (onSignUp), Primary_CTA "Enter OS" (onActivate).
//   - Hero:     the interactive Bird_Mark (role="button", onActivate) and the
//               Primary_CTA "Enter OS" (onActivate).
//   - Quick_Nav: the four items People / Projects / Approvals / Payments, each
//               invoking onNavigate(route).
//
// Every one of these is implemented as a native <button> (so Enter AND Space
// fire activation for free) except the Bird_Mark, which is a role="button" with
// an explicit Enter/Space onKeyDown handler. The property therefore asserts:
// for ALL interactive button controls and for BOTH activation keys
// (Enter, Space), focusing the control and pressing the key invokes that
// control's activation behavior — the spy fires (or, for the Theme_Toggle, the
// active Theme_Mode flips). Across ≥100 runs.

import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import { TopBar } from '../TopBar';
import { Hero } from '../Hero';
import { QuickNav, QUICK_NAV_ITEMS } from '../QuickNav';
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';

// The two activation keys Req 9.2 enumerates for button controls.
type ActivationKey = 'enter' | 'space';

const keyArb: fc.Arbitrary<ActivationKey> = fc.constantFrom('enter', 'space');

// Every interactive button control on the Landing_Page, identified by a stable
// id. The Quick_Nav ids are derived from the canonical four-item config so the
// set stays in lockstep with the component.
type ControlId =
  | 'topbar-theme'
  | 'topbar-signup'
  | 'topbar-cta'
  | 'hero-birdmark'
  | 'hero-cta'
  | `quicknav-${string}`;

const CONTROL_IDS: ControlId[] = [
  'topbar-theme',
  'topbar-signup',
  'topbar-cta',
  'hero-birdmark',
  'hero-cta',
  ...QUICK_NAV_ITEMS.map((item) => `quicknav-${item.id}` as ControlId),
];

const controlArb: fc.Arbitrary<ControlId> = fc.constantFrom(...CONTROL_IDS);

const root = () => document.documentElement;

/** Press the chosen activation key on the focused element. */
async function pressKey(
  user: ReturnType<typeof userEvent.setup>,
  key: ActivationKey,
): Promise<void> {
  await user.keyboard(key === 'enter' ? '{Enter}' : ' ');
}

/**
 * Render the component that owns `control`, focus that control, press `key`, and
 * return whether the control's activation behavior was invoked.
 *
 * Activation is observed via the control's own effect:
 *   - spy controls (Sign_Up_Action, Primary_CTAs, Bird_Mark, Quick_Nav items)
 *     record a call on their callback;
 *   - the Theme_Toggle has no callback — its activation flips the active
 *     Theme_Mode, observed as the document root's `data-theme` changing.
 */
async function activateViaKey(
  control: ControlId,
  key: ActivationKey,
): Promise<boolean> {
  // delay: null keeps 100+ user-event interactions fast and deterministic.
  const user = userEvent.setup({ delay: null });

  let activated = false;

  if (control === 'topbar-theme') {
    // Reset the root so the provider deterministically starts in Dark_Theme.
    root().removeAttribute('data-theme');
    root().classList.remove('dark');
    render(
      <ThemeProvider defaultTheme="dark">
        <TopBar onActivate={vi.fn()} onSignUp={vi.fn()} />
      </ThemeProvider>,
    );
    const before = root().getAttribute('data-theme');
    const el = screen.getByRole('button', { name: 'Switch color theme' });
    el.focus();
    expect(el).toHaveFocus();
    await pressKey(user, key);
    // Activation = the Theme_Mode flipped on the document root.
    activated = root().getAttribute('data-theme') !== before;
  } else if (control === 'topbar-signup' || control === 'topbar-cta') {
    const onActivate = vi.fn();
    const onSignUp = vi.fn();
    render(
      <ThemeProvider defaultTheme="dark">
        <TopBar onActivate={onActivate} onSignUp={onSignUp} />
      </ThemeProvider>,
    );
    const name = control === 'topbar-signup' ? 'Sign up' : 'Enter OS';
    const spy = control === 'topbar-signup' ? onSignUp : onActivate;
    const el = screen.getByRole('button', { name });
    el.focus();
    expect(el).toHaveFocus();
    await pressKey(user, key);
    activated = spy.mock.calls.length === 1;
  } else if (control === 'hero-birdmark' || control === 'hero-cta') {
    const onActivate = vi.fn();
    // Reduced motion keeps the Hero in its static final state — irrelevant to
    // the activation wiring but avoids entrance-animation timing in the harness.
    render(<Hero onActivate={onActivate} prefersReducedMotion />);
    const name = control === 'hero-birdmark' ? 'Enter Architex OS' : 'Enter OS';
    const el = screen.getByRole('button', { name });
    el.focus();
    expect(el).toHaveFocus();
    await pressKey(user, key);
    activated = onActivate.mock.calls.length === 1;
  } else {
    // Quick_Nav item: the id encodes the item suffix.
    const itemId = control.slice('quicknav-'.length);
    const item = QUICK_NAV_ITEMS.find((i) => i.id === itemId)!;
    const onNavigate = vi.fn();
    render(<QuickNav onNavigate={onNavigate} />);
    const el = screen.getByRole('button', { name: item.label });
    el.focus();
    expect(el).toHaveFocus();
    await pressKey(user, key);
    // Activation routes to exactly that item's configured route.
    activated =
      onNavigate.mock.calls.length === 1 &&
      onNavigate.mock.calls[0][0] === item.route;
  }

  cleanup();
  return activated;
}

describe('Property 8: Keyboard activation', () => {
  it('Enter and Space invoke activation for every interactive button control (Req 9.2, 14.9)', async () => {
    await fc.assert(
      fc.asyncProperty(controlArb, keyArb, async (control, key) => {
        const activated = await activateViaKey(control, key);
        expect(activated).toBe(true);
      }),
      { numRuns: 100 },
    );
  }, 60_000);
});
