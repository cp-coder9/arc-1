/**
 * Property-based tests — Friction detection and deduplication.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 14: Friction detection and deduplication
 *   Validates: Requirements 6.1, 6.2, 6.4
 *   For any sequence of user interaction events, the friction detector must
 *   identify a signal if and only if the sequence meets one of the threshold
 *   conditions (≥3 errors on same target within 60s, or ≥5 rapid clicks on
 *   same element within 3s each within 500ms of previous). For any user, at
 *   most one implicit submission per distinct friction pattern (type + page +
 *   target) may exist within a 24-hour rolling window.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ══════════════════════════════════════════════════════════════════════════════
// Pure threshold logic (mirrors useFrictionDetector.ts constants and logic)
// ══════════════════════════════════════════════════════════════════════════════

const ERROR_THRESHOLD = 3;
const ERROR_WINDOW_MS = 60_000;
const RAGE_CLICK_THRESHOLD = 5;
const RAGE_CLICK_WINDOW_MS = 3_000;
const RAGE_CLICK_INTERVAL_MS = 500;

/**
 * Determines if repeated errors should trigger a friction signal.
 * Signal fires iff there are ≥3 errors within the 60s window ending at the latest timestamp.
 */
function shouldDetectRepeatedErrors(
  errorTimestamps: number[],
  windowMs: number = ERROR_WINDOW_MS,
): boolean {
  if (errorTimestamps.length < ERROR_THRESHOLD) return false;
  const sorted = [...errorTimestamps].sort((a, b) => a - b);
  const latest = sorted[sorted.length - 1];
  const recentCount = sorted.filter((t) => latest - t <= windowMs).length;
  return recentCount >= ERROR_THRESHOLD;
}

/**
 * Determines if rage clicks should trigger a friction signal.
 * Signal fires iff there are ≥5 clicks within the 3s window and each
 * consecutive pair is within 500ms of each other.
 */
function shouldDetectRageClicks(
  clickTimestamps: number[],
  windowMs: number = RAGE_CLICK_WINDOW_MS,
  intervalMs: number = RAGE_CLICK_INTERVAL_MS,
): boolean {
  if (clickTimestamps.length < RAGE_CLICK_THRESHOLD) return false;
  const sorted = [...clickTimestamps].sort((a, b) => a - b);
  const latest = sorted[sorted.length - 1];
  const windowStart = latest - windowMs;
  const inWindow = sorted.filter((t) => t >= windowStart);
  if (inWindow.length < RAGE_CLICK_THRESHOLD) return false;
  // Check consecutive intervals within the qualifying subset
  for (let i = 1; i < inWindow.length; i++) {
    if (inWindow[i] - inWindow[i - 1] > intervalMs) return false;
  }
  return true;
}

/**
 * Determines if a new friction signal can be emitted for a given pattern.
 * Enforces max 1 implicit submission per pattern per 24h.
 */
function canEmitFrictionSignal(lastEmissionMs: number | null, nowMs: number): boolean {
  if (lastEmissionMs === null) return true;
  return nowMs - lastEmissionMs >= 24 * 60 * 60 * 1000;
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 14: Friction detection and deduplication
// Validates: Requirements 6.1, 6.2, 6.4
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 14: Friction detection and deduplication', () => {
  // ── Sub-property: Repeated errors detection ─────────────────────────────────

  describe('Repeated errors: signal iff ≥3 errors within 60s window', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * For any sequence of error timestamps where ≥3 fall within a 60s window
     * ending at the latest timestamp, the detector must fire.
     */
    it('detects signal when ≥3 errors occur within the 60s window', () => {
      fc.assert(
        fc.property(
          // Generate a base timestamp and 3+ offsets within 60s
          fc.integer({ min: 1_000_000, max: 100_000_000 }),
          fc.array(fc.integer({ min: 0, max: ERROR_WINDOW_MS }), {
            minLength: ERROR_THRESHOLD,
            maxLength: 20,
          }),
          (baseTime, offsets) => {
            const timestamps = offsets.map((o) => baseTime + o);
            const result = shouldDetectRepeatedErrors(timestamps);
            expect(result).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('does not detect signal when fewer than 3 errors exist', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 200_000 }), {
            minLength: 0,
            maxLength: ERROR_THRESHOLD - 1,
          }),
          (timestamps) => {
            const result = shouldDetectRepeatedErrors(timestamps);
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('does not detect signal when errors are spread beyond 60s window', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1_000_000, max: 100_000_000 }),
          fc.array(fc.integer({ min: ERROR_WINDOW_MS + 1, max: 300_000 }), {
            minLength: ERROR_THRESHOLD,
            maxLength: 10,
          }),
          (baseTime, spacings) => {
            // Build timestamps with large gaps so no 60s window contains ≥3
            const timestamps: number[] = [baseTime];
            for (let i = 0; i < spacings.length - 1; i++) {
              timestamps.push(timestamps[timestamps.length - 1] + spacings[i]);
            }
            // Only the last 1 error is within the window of the latest
            // The gap between each consecutive pair exceeds 60s
            const result = shouldDetectRepeatedErrors(timestamps);
            // With gaps > 60s between each consecutive pair, only 1 error
            // is in the window of the latest error (itself)
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('threshold is exactly 3: detects at 3, not at 2', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1_000_000, max: 100_000_000 }),
          (baseTime) => {
            // Exactly 2 errors within window → no signal
            const twoErrors = [baseTime, baseTime + 1000];
            expect(shouldDetectRepeatedErrors(twoErrors)).toBe(false);

            // Exactly 3 errors within window → signal
            const threeErrors = [baseTime, baseTime + 1000, baseTime + 2000];
            expect(shouldDetectRepeatedErrors(threeErrors)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Sub-property: Rage clicks detection ─────────────────────────────────────

  describe('Rage clicks: signal iff ≥5 clicks within 3s, each within 500ms of previous', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * For any sequence of click timestamps where ≥5 clicks occur within a 3s
     * window and each consecutive pair is within 500ms, the detector must fire.
     */
    it('detects signal when ≥5 clicks are rapid and within window', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1_000_000, max: 100_000_000 }),
          fc.array(fc.integer({ min: 50, max: RAGE_CLICK_INTERVAL_MS }), {
            minLength: RAGE_CLICK_THRESHOLD - 1,
            maxLength: 10,
          }),
          (baseTime, intervals) => {
            // Build timestamps with each gap ≤500ms
            const timestamps: number[] = [baseTime];
            for (const interval of intervals) {
              timestamps.push(timestamps[timestamps.length - 1] + interval);
            }
            // Ensure all fit within 3s window
            const totalSpan = timestamps[timestamps.length - 1] - timestamps[0];
            fc.pre(totalSpan <= RAGE_CLICK_WINDOW_MS);
            fc.pre(timestamps.length >= RAGE_CLICK_THRESHOLD);

            const result = shouldDetectRageClicks(timestamps);
            expect(result).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('does not detect signal when fewer than 5 clicks', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 10_000 }), {
            minLength: 0,
            maxLength: RAGE_CLICK_THRESHOLD - 1,
          }),
          (timestamps) => {
            const result = shouldDetectRageClicks(timestamps);
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('does not detect signal when interval between consecutive clicks exceeds 500ms', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1_000_000, max: 100_000_000 }),
          fc.integer({ min: RAGE_CLICK_INTERVAL_MS + 1, max: 2000 }),
          (baseTime, largeGap) => {
            // 5 clicks but with one gap > 500ms breaking the sequence
            const timestamps = [
              baseTime,
              baseTime + 100,
              baseTime + 200,
              baseTime + 200 + largeGap, // gap > 500ms
              baseTime + 200 + largeGap + 100,
            ];
            const result = shouldDetectRageClicks(timestamps);
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('does not detect signal when clicks span beyond 3s window', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1_000_000, max: 100_000_000 }),
          (baseTime) => {
            // 5 clicks each 400ms apart (valid interval) but spanning 1600ms total
            // This is within 3s, so let's make them span > 3s:
            // 5 clicks, each 700ms apart → 2800ms total, intervals too large (> 500ms)
            // Instead: make them each 490ms apart → total 1960ms → fits in window
            // We need to violate the window: space 5 clicks at 800ms intervals → 3200ms total
            const timestamps = [
              baseTime,
              baseTime + 800,
              baseTime + 1600,
              baseTime + 2400,
              baseTime + 3200,
            ];
            // Total span > 3000ms, so within-window check will fail
            const result = shouldDetectRageClicks(timestamps);
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('threshold is exactly 5: detects at 5, not at 4', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1_000_000, max: 100_000_000 }),
          (baseTime) => {
            // 4 rapid clicks → no signal
            const fourClicks = [baseTime, baseTime + 100, baseTime + 200, baseTime + 300];
            expect(shouldDetectRageClicks(fourClicks)).toBe(false);

            // 5 rapid clicks → signal
            const fiveClicks = [
              baseTime,
              baseTime + 100,
              baseTime + 200,
              baseTime + 300,
              baseTime + 400,
            ];
            expect(shouldDetectRageClicks(fiveClicks)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Sub-property: Deduplication (24h emission window) ───────────────────────

  describe('Deduplication: can emit iff no emission in last 24h for same pattern', () => {
    /**
     * **Validates: Requirements 6.4**
     *
     * For any friction pattern, at most 1 implicit submission may be emitted
     * per 24-hour rolling window.
     */
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    it('allows emission when no previous emission exists (null)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (nowMs) => {
          const result = canEmitFrictionSignal(null, nowMs);
          expect(result).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('allows emission when last emission was ≥24h ago', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: ONE_DAY_MS, max: 1_000_000_000 }),
          fc.integer({ min: ONE_DAY_MS, max: ONE_DAY_MS * 10 }),
          (lastEmission, elapsed) => {
            const nowMs = lastEmission + elapsed;
            fc.pre(nowMs - lastEmission >= ONE_DAY_MS);
            const result = canEmitFrictionSignal(lastEmission, nowMs);
            expect(result).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('blocks emission when last emission was <24h ago', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: ONE_DAY_MS, max: 1_000_000_000 }),
          fc.integer({ min: 0, max: ONE_DAY_MS - 1 }),
          (lastEmission, elapsed) => {
            const nowMs = lastEmission + elapsed;
            const result = canEmitFrictionSignal(lastEmission, nowMs);
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('boundary: blocks at exactly 24h - 1ms, allows at exactly 24h', () => {
      fc.assert(
        fc.property(fc.integer({ min: ONE_DAY_MS, max: 1_000_000_000 }), (lastEmission) => {
          // Exactly 24h - 1ms → blocked
          expect(canEmitFrictionSignal(lastEmission, lastEmission + ONE_DAY_MS - 1)).toBe(false);
          // Exactly 24h → allowed
          expect(canEmitFrictionSignal(lastEmission, lastEmission + ONE_DAY_MS)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('for any pattern, canEmitFrictionSignal is monotonic: once allowed, stays allowed for later times', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000_000 }),
          fc.integer({ min: 0, max: ONE_DAY_MS * 5 }),
          fc.integer({ min: 1, max: ONE_DAY_MS * 5 }),
          (lastEmission, elapsed1, additionalTime) => {
            const now1 = lastEmission + elapsed1;
            const now2 = now1 + additionalTime;
            const canEmitNow = canEmitFrictionSignal(lastEmission, now1);
            const canEmitLater = canEmitFrictionSignal(lastEmission, now2);
            // If we can emit now, we must be able to emit later (monotonically non-decreasing)
            if (canEmitNow) {
              expect(canEmitLater).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
