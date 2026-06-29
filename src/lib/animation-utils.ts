/**
 * Animation utility helpers for the UI/UX glass design system.
 *
 * Provides shared helpers used by animated wrapper components
 * (GlassCardAnimated, StatCardAnimated, TableRowAnimated) to apply
 * consistent staggered entrance timing and to honour the user's
 * prefers-reduced-motion preference.
 *
 * **Validates: Requirements 7.6, 12.8**
 */

import type { Transition } from 'framer-motion';

/**
 * Default per-item stagger step in seconds (50ms per item).
 * Matches the design system's cascading entrance timing.
 */
export const DEFAULT_STAGGER_STEP = 0.05;

/**
 * calculateStaggerDelay — Compute the entrance delay (in seconds) for the
 * item at a given index in a cascading/staggered sequence.
 *
 * Used so a grid or list of items animates in sequentially rather than all
 * at once (Stagger_Animation), e.g. StatCardAnimated / TableRowAnimated.
 *
 * Preconditions:
 *   - index is a number; negative or non-finite indices are treated as 0
 *   - step is a non-negative number (defaults to DEFAULT_STAGGER_STEP)
 *
 * Postconditions:
 *   - Returns index * step for valid, non-negative indices
 *   - Returns 0 for index <= 0 or non-finite index
 *   - Result is always a finite, non-negative number
 *
 * @param index Zero-based position of the item in the sequence
 * @param step  Optional per-item delay in seconds (default 0.05 = 50ms)
 * @returns Delay in seconds before this item's entrance animation begins
 */
export function calculateStaggerDelay(
  index: number,
  step: number = DEFAULT_STAGGER_STEP,
): number {
  if (!Number.isFinite(index) || index <= 0) {
    return 0;
  }

  const safeStep = Number.isFinite(step) && step > 0 ? step : DEFAULT_STAGGER_STEP;

  return index * safeStep;
}

/**
 * withReducedMotion — Wrap a Framer Motion transition config so that it
 * collapses to an instant (duration: 0, delay: 0) transition when the user
 * prefers reduced motion.
 *
 * This centralises the prefers-reduced-motion handling so individual
 * components don't each have to branch on the preference. When reduced motion
 * is NOT preferred, the original transition is returned unchanged.
 *
 * Preconditions:
 *   - transition is a valid Framer Motion Transition object (may be empty)
 *   - prefersReducedMotion is a boolean
 *
 * Postconditions:
 *   - When prefersReducedMotion = true: returns a transition with duration 0,
 *     delay 0, and no repeating loop (repeat 0), so the element renders in its
 *     final resting state immediately (Requirement 7.2)
 *   - When prefersReducedMotion = false: returns the provided transition unchanged
 *
 * @param transition           The transition config to wrap
 * @param prefersReducedMotion Whether the user prefers reduced motion
 * @returns A transition config respecting the reduced-motion preference
 */
export function withReducedMotion(
  transition: Transition,
  prefersReducedMotion: boolean,
): Transition {
  if (!prefersReducedMotion) {
    return transition;
  }

  return {
    ...transition,
    duration: 0,
    delay: 0,
    repeat: 0,
  };
}
