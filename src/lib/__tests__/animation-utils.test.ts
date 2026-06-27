/**
 * Unit tests for animation utility helpers.
 *
 * Covers calculateStaggerDelay and withReducedMotion.
 * Related: Requirements 7.6, 12.8
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAGGER_STEP,
  calculateStaggerDelay,
  withReducedMotion,
} from '../animation-utils';

describe('animation-utils', () => {
  describe('calculateStaggerDelay', () => {
    it('returns 0 for the first item (index 0)', () => {
      expect(calculateStaggerDelay(0)).toBe(0);
    });

    it('applies the default 50ms (0.05s) per item step', () => {
      expect(calculateStaggerDelay(1)).toBeCloseTo(0.05);
      expect(calculateStaggerDelay(3)).toBeCloseTo(0.15);
      expect(calculateStaggerDelay(10)).toBeCloseTo(0.5);
    });

    it('exposes the default step constant', () => {
      expect(DEFAULT_STAGGER_STEP).toBe(0.05);
    });

    it('supports a custom stagger step', () => {
      expect(calculateStaggerDelay(2, 0.1)).toBeCloseTo(0.2);
    });

    it('clamps negative indices to 0', () => {
      expect(calculateStaggerDelay(-5)).toBe(0);
    });

    it('treats non-finite indices as 0', () => {
      expect(calculateStaggerDelay(Number.NaN)).toBe(0);
      expect(calculateStaggerDelay(Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('falls back to the default step when an invalid step is provided', () => {
      expect(calculateStaggerDelay(2, 0)).toBeCloseTo(0.1);
      expect(calculateStaggerDelay(2, -1)).toBeCloseTo(0.1);
      expect(calculateStaggerDelay(2, Number.NaN)).toBeCloseTo(0.1);
    });

    it('produces monotonically increasing delays for increasing indices', () => {
      let previous = -1;
      for (let i = 0; i < 20; i++) {
        const delay = calculateStaggerDelay(i);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeGreaterThanOrEqual(previous);
        previous = delay;
      }
    });
  });

  describe('withReducedMotion', () => {
    it('returns the original transition unchanged when motion is allowed', () => {
      const transition = { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] };
      expect(withReducedMotion(transition, false)).toBe(transition);
    });

    it('collapses duration and delay to 0 when reduced motion is preferred', () => {
      const result = withReducedMotion({ duration: 0.4, delay: 0.2 }, true);
      expect(result.duration).toBe(0);
      expect(result.delay).toBe(0);
    });

    it('disables repeating loops when reduced motion is preferred', () => {
      const result = withReducedMotion({ duration: 2, repeat: Infinity }, true);
      expect(result.repeat).toBe(0);
    });

    it('preserves unrelated transition properties when reduced motion is preferred', () => {
      const result = withReducedMotion(
        { duration: 0.4, ease: [0.2, 0.8, 0.2, 1], type: 'tween' },
        true,
      );
      expect(result.ease).toEqual([0.2, 0.8, 0.2, 1]);
      expect(result.type).toBe('tween');
    });

    it('handles an empty transition config', () => {
      const result = withReducedMotion({}, true);
      expect(result.duration).toBe(0);
      expect(result.delay).toBe(0);
    });
  });
});
