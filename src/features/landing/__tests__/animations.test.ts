/**
 * Unit tests for landing animation presets.
 *
 * Asserts the specific initial/animate values and reduced-motion duration
 * behaviour for each entrance preset. Complements the generic reduced-motion
 * property test (animations.property.test.ts) and the stagger-delay unit tests
 * (src/lib/__tests__/animation-utils.test.ts).
 *
 * Related: Requirements 7.3, 7.4, 7.5, 7.6
 */
import { describe, expect, it } from 'vitest';
import {
  fadeIn,
  fadeInUp,
  fadeOutDown,
  hoverScale,
  pulse,
  slideInLeft,
} from '../animations';

const ENTRANCE_EASING = [0.2, 0.8, 0.2, 1];

describe('animation presets', () => {
  describe('fadeInUp', () => {
    it('animates opacity 0 → 1 and y 20 → 0', () => {
      const variant = fadeInUp(false);
      expect(variant.initial).toEqual({ opacity: 0, y: 20 });
      expect(variant.animate).toEqual({ opacity: 1, y: 0 });
    });

    it('uses the entrance easing curve and 0.4s duration when motion is allowed', () => {
      const { transition } = fadeInUp(false) as {
        transition: { duration: number; ease: number[] };
      };
      expect(transition.duration).toBe(0.4);
      expect(transition.ease).toEqual(ENTRANCE_EASING);
    });

    it('collapses duration to 0 when prefers-reduced-motion is true', () => {
      const { transition } = fadeInUp(true) as {
        transition: { duration: number };
      };
      expect(transition.duration).toBe(0);
    });
  });

  describe('fadeIn', () => {
    it('animates opacity 0 → 1 (opacity only, no transform)', () => {
      const variant = fadeIn(false);
      expect(variant.initial).toEqual({ opacity: 0 });
      expect(variant.animate).toEqual({ opacity: 1 });
    });

    it('uses a 0.3s duration when motion is allowed', () => {
      const { transition } = fadeIn(false) as {
        transition: { duration: number };
      };
      expect(transition.duration).toBe(0.3);
    });

    it('collapses duration to 0 when prefers-reduced-motion is true', () => {
      const { transition } = fadeIn(true) as {
        transition: { duration: number };
      };
      expect(transition.duration).toBe(0);
    });
  });

  describe('slideInLeft', () => {
    it('animates opacity 0 → 1 and x -40 → 0', () => {
      const variant = slideInLeft(false);
      expect(variant.initial).toEqual({ opacity: 0, x: -40 });
      expect(variant.animate).toEqual({ opacity: 1, x: 0 });
    });

    it('uses the entrance easing curve and 0.4s duration when motion is allowed', () => {
      const { transition } = slideInLeft(false) as {
        transition: { duration: number; ease: number[] };
      };
      expect(transition.duration).toBe(0.4);
      expect(transition.ease).toEqual(ENTRANCE_EASING);
    });

    it('collapses duration to 0 when prefers-reduced-motion is true', () => {
      const { transition } = slideInLeft(true) as {
        transition: { duration: number };
      };
      expect(transition.duration).toBe(0);
    });
  });

  describe('fadeOutDown', () => {
    it('exits to opacity 0, y 20', () => {
      const variant = fadeOutDown(false);
      expect(variant.exit).toEqual({ opacity: 0, y: 20 });
    });

    it('collapses duration to 0 when prefers-reduced-motion is true', () => {
      const { transition } = fadeOutDown(true) as {
        transition: { duration: number };
      };
      expect(transition.duration).toBe(0);
    });
  });

  describe('hoverScale', () => {
    it('scales to 1.02 on hover using spring physics', () => {
      const variant = hoverScale() as {
        whileHover: { scale: number };
        transition: { type: string };
      };
      expect(variant.whileHover).toEqual({ scale: 1.02 });
      expect(variant.transition.type).toBe('spring');
    });
  });

  describe('pulse', () => {
    it('loops opacity 0.5 → 1 → 0.5 infinitely', () => {
      const variant = pulse() as {
        animate: { opacity: number[] };
        transition: { repeat: number };
      };
      expect(variant.animate.opacity).toEqual([0.5, 1, 0.5]);
      expect(variant.transition.repeat).toBe(Infinity);
    });
  });
});
