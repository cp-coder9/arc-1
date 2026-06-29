/**
 * Animation presets for landing page and UI/UX overhaul.
 * 
 * All presets support prefers-reduced-motion accessibility preference.
 * Entrance animations use cubic-bezier(0.2, 0.8, 0.2, 1) easing curve.
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**
 */

import type { TargetAndTransition, Transition } from 'framer-motion';

/**
 * A bundle of Framer Motion props produced by a preset.
 *
 * These objects are NOT Framer Motion `Variants` (a map of named variant
 * states). Instead they are prop bundles meant to be spread onto — or read
 * field-by-field from — a `motion` component: an optional target for each
 * lifecycle prop (`initial`, `animate`, `exit`, `whileHover`) plus a top-level
 * `transition` describing how to animate between them.
 */
export interface MotionPreset {
  initial?: TargetAndTransition;
  animate?: TargetAndTransition;
  exit?: TargetAndTransition;
  whileHover?: TargetAndTransition;
  transition?: Transition;
}

/**
 * Entrance curve used for all entrance animations.
 * Matches the design system's motion language.
 */
const ENTRANCE_EASING: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/**
 * fadeInUp — Fade in while sliding up.
 * 
 * Preconditions:
 *   - prefersReducedMotion is boolean
 * 
 * Postconditions:
 *   - Returns motion preset with initial opacity 0, y 20
 *   - Animates to opacity 1, y 0
 *   - Duration: 0.4s (or 0 if prefersReducedMotion = true)
 *   - Easing: cubic-bezier(0.2, 0.8, 0.2, 1)
 */
export function fadeInUp(prefersReducedMotion: boolean): MotionPreset {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: prefersReducedMotion ? 0 : 0.4,
      ease: ENTRANCE_EASING,
    },
  };
}

/**
 * fadeIn — Fade in (opacity only).
 * 
 * Preconditions:
 *   - prefersReducedMotion is boolean
 * 
 * Postconditions:
 *   - Returns motion preset with initial opacity 0
 *   - Animates to opacity 1
 *   - Duration: 0.3s (or 0 if prefersReducedMotion = true)
 */
export function fadeIn(prefersReducedMotion: boolean): MotionPreset {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: {
      duration: prefersReducedMotion ? 0 : 0.3,
    },
  };
}

/**
 * slideInLeft — Slide in from the left while fading in.
 * 
 * Preconditions:
 *   - prefersReducedMotion is boolean
 * 
 * Postconditions:
 *   - Returns motion preset with initial opacity 0, x -40
 *   - Animates to opacity 1, x 0
 *   - Duration: 0.4s (or 0 if prefersReducedMotion = true)
 *   - Easing: cubic-bezier(0.2, 0.8, 0.2, 1)
 */
export function slideInLeft(prefersReducedMotion: boolean): MotionPreset {
  return {
    initial: { opacity: 0, x: -40 },
    animate: { opacity: 1, x: 0 },
    transition: {
      duration: prefersReducedMotion ? 0 : 0.4,
      ease: ENTRANCE_EASING,
    },
  };
}

/**
 * fadeOutDown — Fade out while sliding down.
 * Used as exit animation (reverse of fadeInUp).
 * 
 * Preconditions:
 *   - prefersReducedMotion is boolean
 * 
 * Postconditions:
 *   - Returns motion preset with exit opacity 0, y 20
 *   - Duration: 0.3s (or 0 if prefersReducedMotion = true)
 */
export function fadeOutDown(prefersReducedMotion: boolean): MotionPreset {
  return {
    exit: { opacity: 0, y: 20 },
    transition: {
      duration: prefersReducedMotion ? 0 : 0.3,
    },
  };
}

/**
 * hoverScale — Scale up on hover with spring physics.
 * Hover animation (not entrance).
 * 
 * Postconditions:
 *   - Returns motion preset with whileHover scale 1.02
 *   - Uses spring physics for natural feel
 *   - No duration check (hover interactions are not animated if prefersReducedMotion)
 */
export function hoverScale(): MotionPreset {
  return {
    whileHover: { scale: 1.02 },
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  };
}

/**
 * pulse — Infinite opacity pulse animation.
 * Used for loading states and skeleton screens.
 * 
 * Preconditions:
 *   - Animation will run continuously until component unmounts
 * 
 * Postconditions:
 *   - Returns motion preset with animate opacity 0.5 → 1 → 0.5
 *   - Infinite loop, duration 2s
 *   - Used in LoadingSkeleton and loading indicators
 */
export function pulse(): MotionPreset {
  return {
    animate: { opacity: [0.5, 1, 0.5] },
    transition: {
      repeat: Infinity,
      duration: 2,
    },
  };
}
