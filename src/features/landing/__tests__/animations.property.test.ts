// Feature: ui-ux-overhaul-landing-aesthetic, Property 4
//
// Property 4: Animations respect prefers-reduced-motion setting
// (design.md Property 11: Animation Duration Respects Reduced Motion)
//
// **Validates: Requirements 7.1, 7.2, 7.8**
//
// For every animation preset that accepts a `prefersReducedMotion` flag
// (fadeInUp, fadeIn, slideInLeft, fadeOutDown), when prefers-reduced-motion is
// true the System SHALL set the animation transition duration to 0 so all
// motion is skipped. When prefers-reduced-motion is false, the preset SHALL
// supply a positive (non-zero) duration so the animation plays.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  fadeInUp,
  fadeIn,
  slideInLeft,
  fadeOutDown,
} from '@/features/landing/animations';
import type { Variants } from 'framer-motion';

const RUNS = { numRuns: 100 } as const;

/**
 * Presets that accept a prefersReducedMotion flag and expose a
 * transition.duration. Each returns a Framer Motion Variants object whose
 * `transition.duration` must collapse to 0 under reduced motion.
 */
const REDUCED_MOTION_PRESETS: ReadonlyArray<{
  name: string;
  preset: (prefersReducedMotion: boolean) => Variants;
}> = [
  { name: 'fadeInUp', preset: fadeInUp },
  { name: 'fadeIn', preset: fadeIn },
  { name: 'slideInLeft', preset: slideInLeft },
  { name: 'fadeOutDown', preset: fadeOutDown },
];

function transitionDuration(variant: Variants): unknown {
  // All presets place the transition config at the top level of the variant.
  const transition = (variant as { transition?: { duration?: unknown } })
    .transition;
  return transition?.duration;
}

describe('Property 4: Animations respect prefers-reduced-motion setting', () => {
  it('sets duration to 0 for every preset when prefers-reduced-motion is true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REDUCED_MOTION_PRESETS),
        ({ preset }) => {
          const variant = preset(true);
          expect(transitionDuration(variant)).toBe(0);
        },
      ),
      RUNS,
    );
  });

  it('supplies a positive duration for every preset when prefers-reduced-motion is false', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REDUCED_MOTION_PRESETS),
        ({ preset }) => {
          const duration = transitionDuration(preset(false));
          expect(typeof duration).toBe('number');
          expect(duration as number).toBeGreaterThan(0);
        },
      ),
      RUNS,
    );
  });

  it('duration is 0 if and only if prefers-reduced-motion is true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REDUCED_MOTION_PRESETS),
        fc.boolean(),
        ({ preset }, prefersReducedMotion) => {
          const duration = transitionDuration(preset(prefersReducedMotion));
          if (prefersReducedMotion) {
            expect(duration).toBe(0);
          } else {
            expect(duration as number).toBeGreaterThan(0);
          }
        },
      ),
      RUNS,
    );
  });
});
