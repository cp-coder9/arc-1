// Feature: website-ui-redesign, Property 3
//
// Property 3: Bird_Mark activation equals Primary_CTA — Validates Requirements 4.8
//
// Req 4.8: "WHEN a user activates the Bird_Mark by pointer click, or by pressing
// the Enter or Space key while the Bird_Mark is focused, THE System SHALL begin
// the Flock_Activation sequence identical to activating the Primary_CTA."
//
// The Hero renders TWO activators wired to the SAME `onActivate` handler:
//   - the interactive Bird_Mark (role="button", accessible name "Enter Architex OS")
//   - the Primary_CTA button labeled "Enter OS"
//
// We model the "Flock_Activation state transition" as the invocation of that
// shared `onActivate` handler (LandingPage drives the phase machine off this
// single callback — see useFlockActivation). The property therefore asserts:
// for any activation input (pointer click / Enter / Space) against either
// activator, the resulting effect — the recorded `onActivate` call(s) — is
// IDENTICAL to the effect of clicking the Primary_CTA. Across ≥100 runs.

import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { Hero } from '../Hero';

// The three activation inputs Req 4.8 enumerates.
type ActivationInput = 'click' | 'enter' | 'space';
// The two activators that must behave identically.
type Activator = 'birdMark' | 'primaryCta';

const inputArb: fc.Arbitrary<ActivationInput> = fc.constantFrom(
  'click',
  'enter',
  'space',
);
const activatorArb: fc.Arbitrary<Activator> = fc.constantFrom(
  'birdMark',
  'primaryCta',
);

// Locate an activator by its accessible name. The Bird_Mark activator exposes
// "Enter Architex OS" (Req 9.9); the Primary_CTA is labeled exactly "Enter OS".
function getActivator(activator: Activator): HTMLElement {
  return activator === 'birdMark'
    ? screen.getByRole('button', { name: 'Enter Architex OS' })
    : screen.getByRole('button', { name: 'Enter OS' });
}

// Apply one activation input to an element and return the resulting state
// transition, modeled as the number of times the shared `onActivate` handler
// fired. Each invocation == one "begin Flock_Activation" transition; the handler
// is the single source of the transition in LandingPage (useFlockActivation's
// `activate`, which ignores any argument the activator forwards), so the count
// is the faithful, activator-agnostic measure of the transition.
async function activateAndCount(
  activator: Activator,
  input: ActivationInput,
): Promise<number> {
  const onActivate = vi.fn();
  // delay: null keeps 100+ user-event interactions fast and deterministic.
  const user = userEvent.setup({ delay: null });
  // Reduced motion keeps the Hero in its static final state — irrelevant to the
  // activation wiring but avoids any entrance-animation timing in the harness.
  render(<Hero onActivate={onActivate} prefersReducedMotion />);

  const el = getActivator(activator);

  if (input === 'click') {
    await user.click(el);
  } else {
    el.focus();
    expect(el).toHaveFocus();
    await user.keyboard(input === 'enter' ? '{Enter}' : ' ');
  }

  const transitions = onActivate.mock.calls.length;
  cleanup();
  return transitions;
}

describe('Property 3: Bird_Mark activation equals Primary_CTA', () => {
  it('any input on either activator produces the same state transition as the Primary_CTA (Req 4.8)', async () => {
    await fc.assert(
      fc.asyncProperty(activatorArb, inputArb, async (activator, input) => {
        // Transition from the generated (activator, input) combination.
        const actual = await activateAndCount(activator, input);

        // Reference transition: activating the Primary_CTA via pointer click —
        // the canonical "activate the Primary_CTA" Req 4.8 compares against.
        const reference = await activateAndCount('primaryCta', 'click');

        // The state transition is identical regardless of which activator +
        // input was used: each begins exactly one Flock_Activation sequence.
        expect(actual).toBe(reference);
        expect(actual).toBe(1);
      }),
      { numRuns: 100 },
    );
  }, 60_000);
});
