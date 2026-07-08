/**
 * useSessionTimer — Session countdown and elapsed time tracking hook
 *
 * Tracks elapsed time and remaining time within the Booking_Window,
 * updates every 1 second, and surfaces warning states:
 * - showCountdownWarning: true when within the grace period before window end
 * - showExpiryNotification: true when ≤60 seconds remain before hard expiry
 * - isInGracePeriod: true when now >= windowEnd (inside the grace buffer)
 * - isExpired: true when now >= windowEnd + gracePeriodSeconds
 *
 * The hard expiry point is (windowEnd + gracePeriodSeconds), matching
 * sessionTimerService.ts on the server side.
 *
 * Requirements: 6.10, 9.1
 */

import { useEffect, useRef, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface UseSessionTimerParams {
  /** Booking window start — Unix timestamp in milliseconds */
  windowStart: number;
  /** Booking window end — Unix timestamp in milliseconds */
  windowEnd: number;
  /** Grace period in seconds (0–900, i.e. 0–15 minutes) */
  gracePeriodSeconds: number;
}

export interface UseSessionTimerResult {
  /** Elapsed seconds since windowStart (clamped to ≥0) */
  elapsedSeconds: number;
  /** Remaining seconds until hard expiry (windowEnd + gracePeriodSeconds), clamped to ≥0 */
  remainingSeconds: number;
  /** True when now >= windowEnd (the consumer is inside the grace period) */
  isInGracePeriod: boolean;
  /** True when now >= windowEnd + gracePeriodSeconds (session has expired) */
  isExpired: boolean;
  /**
   * True when the countdown warning overlay should be shown.
   * Triggers at (windowEnd - gracePeriodSeconds) — i.e. when the
   * remaining "comfortable" booking time has run out and only the
   * grace buffer remains.
   */
  showCountdownWarning: boolean;
  /**
   * True when ≤60 seconds remain until hard expiry (windowEnd + gracePeriodSeconds).
   * Used to show the session-ending notification per requirement 6.10.
   */
  showExpiryNotification: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const TICK_INTERVAL_MS = 1_000;
const EXPIRY_NOTIFICATION_THRESHOLD_SECONDS = 60;

// ─── Helper ─────────────────────────────────────────────────────────────────────

function computeState(
  windowStart: number,
  windowEnd: number,
  gracePeriodSeconds: number,
  nowMs: number,
): UseSessionTimerResult {
  const nowSeconds = nowMs / 1_000;
  const startSeconds = windowStart / 1_000;
  const endSeconds = windowEnd / 1_000;
  const hardExpirySeconds = endSeconds + gracePeriodSeconds;

  // Elapsed since booking window started (never negative)
  const elapsedSeconds = Math.max(0, Math.floor(nowSeconds - startSeconds));

  // Remaining until hard expiry (never negative)
  const remainingSeconds = Math.max(0, Math.ceil(hardExpirySeconds - nowSeconds));

  // In grace period: now is past the booking window end but before hard expiry
  const isInGracePeriod = nowSeconds >= endSeconds && nowSeconds < hardExpirySeconds;

  // Expired: now is at or past the hard expiry point
  const isExpired = nowSeconds >= hardExpirySeconds;

  // Countdown warning: now >= (windowEnd - gracePeriodSeconds)
  // This is the moment the grace period "shadow" begins — same as when
  // requiremeng 9.1 says the non-blocking countdown overlay should appear.
  const countdownWarningStart = endSeconds - gracePeriodSeconds;
  const showCountdownWarning = nowSeconds >= countdownWarningStart && !isExpired;

  // Expiry notification: ≤60 seconds remaining before hard expiry
  const showExpiryNotification =
    remainingSeconds <= EXPIRY_NOTIFICATION_THRESHOLD_SECONDS && !isExpired;

  return {
    elapsedSeconds,
    remainingSeconds,
    isInGracePeriod,
    isExpired,
    showCountdownWarning,
    showExpiryNotification,
  };
}

// ─── Hook Implementation ────────────────────────────────────────────────────────

export function useSessionTimer({
  windowStart,
  windowEnd,
  gracePeriodSeconds,
}: UseSessionTimerParams): UseSessionTimerResult {
  const [state, setState] = useState<UseSessionTimerResult>(() =>
    computeState(windowStart, windowEnd, gracePeriodSeconds, Date.now()),
  );

  // Keep params in refs so the interval callback always sees the latest values
  // without needing to be re-created on every prop change.
  const windowStartRef = useRef(windowStart);
  const windowEndRef = useRef(windowEnd);
  const gracePeriodRef = useRef(gracePeriodSeconds);

  useEffect(() => {
    windowStartRef.current = windowStart;
    windowEndRef.current = windowEnd;
    gracePeriodRef.current = gracePeriodSeconds;
  }, [windowStart, windowEnd, gracePeriodSeconds]);

  // Re-compute synchronously when params change
  useEffect(() => {
    setState(computeState(windowStart, windowEnd, gracePeriodSeconds, Date.now()));
  }, [windowStart, windowEnd, gracePeriodSeconds]);

  useEffect(() => {
    // Start the 1-second tick
    const intervalId = setInterval(() => {
      const next = computeState(
        windowStartRef.current,
        windowEndRef.current,
        gracePeriodRef.current,
        Date.now(),
      );
      setState(next);

      // Stop ticking once the session has expired — no further updates needed
      if (next.isExpired) {
        clearInterval(intervalId);
      }
    }, TICK_INTERVAL_MS);

    // Cleanup on unmount or when params change
    return () => {
      clearInterval(intervalId);
    };
  }, [windowStart, windowEnd, gracePeriodSeconds]);

  return state;
}

export default useSessionTimer;
