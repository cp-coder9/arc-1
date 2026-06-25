// Feature: website-ui-redesign, Property 4
//
// Property 4: Quick_Nav routing — Validates Requirements 5.3
//
// For every Quick_Nav item and any activation input among {pointer click,
// Enter key, Space key}, activating that item navigates to exactly that item's
// configured route — never any other item's route. QuickNav is presentational:
// it reports the activated item's route through `onNavigate(route)`, and the
// LandingPage owns the actual navigation (Req 5.3). So "navigation targets
// exactly that item's route" reduces to: for any (item, input), `onNavigate`
// is called once, with that item's `route`, and with no other item's route.
//
// The test generates an item index (0..3, covering all four items) and an
// activation input ('click' | 'enter' | 'space'), renders QuickNav with a spy
// `onNavigate`, finds the target button by its label, activates it with the
// chosen input, and asserts the spy was called exactly once with the item's
// own route and with none of the sibling routes. ≥100 runs.

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { QuickNav, QUICK_NAV_ITEMS } from '../QuickNav';

type ActivationInput = 'click' | 'enter' | 'space';

const inputArb: fc.Arbitrary<ActivationInput> = fc.constantFrom(
  'click',
  'enter',
  'space',
);

// Index into the exactly-four QUICK_NAV_ITEMS tuple (Req 5.1) — covers every
// item across runs.
const itemIndexArb: fc.Arbitrary<number> = fc.integer({
  min: 0,
  max: QUICK_NAV_ITEMS.length - 1,
});

const RUNS = { numRuns: 100 } as const;

describe('Property 4: Quick_Nav routing', () => {
  afterEach(() => {
    cleanup();
  });

  it('activating any item by click/Enter/Space navigates to exactly that item\'s route (Req 5.3)', async () => {
    await fc.assert(
      fc.asyncProperty(itemIndexArb, inputArb, async (index, input) => {
        const item = QUICK_NAV_ITEMS[index];
        const onNavigate = vi.fn();
        // `delay: null` removes user-event's inter-event waits so 100 runs stay
        // well within the test budget without changing activation semantics.
        const user = userEvent.setup({ delay: null });

        render(<QuickNav onNavigate={onNavigate} />);

        try {
          // Locate the target button by its visible label / accessible name.
          const button = screen.getByRole('button', {
            name: new RegExp(`^${item.label}$`, 'i'),
          });

          // Activate via the chosen input. Native <button> semantics mean
          // Enter and Space both fire a click while focused (Req 5.3).
          if (input === 'click') {
            await user.click(button);
          } else {
            button.focus();
            await user.keyboard(input === 'enter' ? '{Enter}' : ' ');
          }

          // Navigation targets exactly this item's route...
          expect(onNavigate).toHaveBeenCalledTimes(1);
          expect(onNavigate).toHaveBeenCalledWith(item.route);

          // ...and never any other item's route.
          for (const other of QUICK_NAV_ITEMS) {
            if (other.route !== item.route) {
              expect(onNavigate).not.toHaveBeenCalledWith(other.route);
            }
          }
        } finally {
          cleanup();
        }
      }),
      RUNS,
    );
  }, 30_000);
});
