// ─── Flock Activation State Machine + Watchdog ──────────────────────────────
// Feature: website-ui-redesign
//
// `useFlockActivation` owns the Landing_Page -> OS_Reveal finite state machine
// that drives the signature Flock_Activation sequence (design "State Machine —
// Landing → OS_Reveal"). It is intentionally DOM-free: the AgentField component
// (task 9.2) renders/animates the Agent_Shards and reports geometry milestones
// back through the `onDispersed` / `onSettled` advance callbacks, while this
// hook tracks the authoritative `phase`, guarantees the sequence completes
// within the 1500–3500 ms window, arms the 5000 ms activation watchdog, and
// exposes `restoreLanding()` to return to the pristine Landing_Page.
//
// Phases (Req 12.1, 12.2, 12.4, 12.8):
//   landing → activating → dispersing → settling → osReveal
//
// Behaviour:
//   • activate() begins the sequence (Req 12.1). Under reduced motion it jumps
//     straight to `osReveal` with no dispersal/patrol (Req 12.9).
//   • Forward progress is geometry-driven via onDispersed/onSettled, with
//     internal timers as a self-contained fallback so the hook advances on its
//     own when no animation callbacks fire. Whichever happens first wins.
//   • A 5000 ms watchdog (Req 3.6, 4.7) sets `actionError` and resets the phase
//     to `landing` if the sequence fails to reach `osReveal` in time.
//   • restoreLanding() resets to `landing`, restoring the Bird_Mark, Hero copy
//     and Quick_Nav to their pre-activation state (Req 12.10).
//
// All timers are tracked in refs and cleared on unmount, and every state write
// is guarded by a mounted ref so a late timer can never update an unmounted
// component.

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Public types (mirrors design.md Data Models → Landing State)
// ---------------------------------------------------------------------------

export type ActivationPhase =
  | 'landing'
  | 'activating'
  | 'dispersing'
  | 'settling'
  | 'osReveal';

/** Tunable durations for the activation sequence (all in milliseconds). */
export interface FlockTimingConfig {
  /** `activating` → `dispersing`: brief setup before the explosion. */
  activatingMs?: number;
  /** `dispersing` → `settling`: outward dispersal flight (Req 12.2). */
  dispersingMs?: number;
  /** `settling` → `osReveal`: shards ease onto loops and dim (Req 12.4). */
  settlingMs?: number;
  /** Activation watchdog window; failure resets to `landing` (Req 3.6, 4.7). */
  watchdogMs?: number;
}

export interface UseFlockActivationOptions {
  /** When true, activate() jumps straight to `osReveal` (Req 12.9). */
  prefersReducedMotion?: boolean;
  /** Optional overrides for the sequence/watchdog timings. */
  timing?: FlockTimingConfig;
}

export interface FlockActivation {
  /** Current state-machine phase. */
  phase: ActivationPhase;
  /** Non-null when activation failed to start/complete in time (Req 3.6, 4.7). */
  actionError: string | null;
  /** True while the sequence is mid-flight (activating/dispersing/settling). */
  isAnimating: boolean;
  /** Begins the Flock_Activation sequence (Req 12.1, 12.9). */
  activate: () => void;
  /** Returns to the pristine Landing_Page state (Req 12.10). */
  restoreLanding: () => void;
  /** Geometry callback: Agent_Shards reached their burst targets → settling. */
  onDispersed: () => void;
  /** Geometry callback: Agent_Shards settled/dimmed → osReveal. */
  onSettled: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum total activation time, activation → OS_Reveal (Req 12.8). */
export const MIN_SEQUENCE_MS = 1500;
/** Maximum total activation time, activation → OS_Reveal (Req 12.8). */
export const MAX_SEQUENCE_MS = 3500;

/**
 * Default phase durations. The sum (150 + 1450 + 700 = 2300 ms) sits comfortably
 * inside the 1500–3500 ms window mandated by Req 12.8.
 */
export const DEFAULT_TIMING: Required<FlockTimingConfig> = {
  activatingMs: 150,
  dispersingMs: 1450,
  settlingMs: 700,
  watchdogMs: 5000,
};

/** User-facing error shown when activation fails to complete (Req 3.6, 4.7). */
export const ACTIVATION_ERROR_MESSAGE =
  'We could not start the experience. Please try again.';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * State machine + watchdog for the Landing_Page Flock_Activation sequence.
 *
 * @param options.prefersReducedMotion When true, `activate()` transitions
 *   directly to `osReveal` with no dispersal or patrol motion (Req 12.9).
 * @param options.timing Optional duration overrides; defaults keep the total
 *   sequence within the 1500–3500 ms window (Req 12.8).
 */
export function useFlockActivation(
  options: UseFlockActivationOptions = {},
): FlockActivation {
  const { prefersReducedMotion = false, timing } = options;

  const resolvedTiming: Required<FlockTimingConfig> = {
    ...DEFAULT_TIMING,
    ...timing,
  };

  // Dev-time guard: warn if a custom configuration would push the visible
  // sequence outside the Req 12.8 window. Does not change behaviour.
  if (process.env.NODE_ENV !== 'production') {
    const total =
      resolvedTiming.activatingMs +
      resolvedTiming.dispersingMs +
      resolvedTiming.settlingMs;
    if (total < MIN_SEQUENCE_MS || total > MAX_SEQUENCE_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[useFlockActivation] Configured sequence duration ${total}ms is outside ` +
          `the ${MIN_SEQUENCE_MS}-${MAX_SEQUENCE_MS}ms window required by Req 12.8.`,
      );
    }
  }

  const [phase, setPhaseState] = useState<ActivationPhase>('landing');
  const [actionError, setActionError] = useState<string | null>(null);

  // Synchronous mirror of `phase` so callbacks/timers can guard transitions
  // without waiting for a re-render.
  const phaseRef = useRef<ActivationPhase>('landing');
  // Latest reduced-motion preference, read inside stable callbacks.
  const reducedMotionRef = useRef(prefersReducedMotion);
  // Pending sequence-step timer and the activation watchdog timer.
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against state writes after unmount.
  const mountedRef = useRef(true);
  // Latest timings, read inside stable callbacks.
  const timingRef = useRef(resolvedTiming);

  reducedMotionRef.current = prefersReducedMotion;
  timingRef.current = resolvedTiming;

  // ---- timer helpers ------------------------------------------------------

  const clearStepTimer = useCallback(() => {
    if (stepTimerRef.current !== null) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogTimerRef.current !== null) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearStepTimer();
    clearWatchdog();
  }, [clearStepTimer, clearWatchdog]);

  const setPhase = useCallback((next: ActivationPhase) => {
    phaseRef.current = next;
    if (mountedRef.current) {
      setPhaseState(next);
    }
  }, []);

  // ---- forward transitions ------------------------------------------------
  // Each transition is guarded by the expected current phase so geometry
  // callbacks and the fallback timer never double-advance. Whichever fires
  // first cancels the pending step timer and schedules the next step.

  const enterOsReveal = useCallback(() => {
    if (phaseRef.current !== 'settling') return;
    clearStepTimer();
    clearWatchdog(); // success: disarm the watchdog (Req 3.6, 4.7)
    setPhase('osReveal');
  }, [clearStepTimer, clearWatchdog, setPhase]);

  const enterSettling = useCallback(() => {
    if (phaseRef.current !== 'dispersing') return;
    clearStepTimer();
    setPhase('settling');
    stepTimerRef.current = setTimeout(enterOsReveal, timingRef.current.settlingMs);
  }, [clearStepTimer, setPhase, enterOsReveal]);

  const enterDispersing = useCallback(() => {
    if (phaseRef.current !== 'activating') return;
    clearStepTimer();
    setPhase('dispersing');
    stepTimerRef.current = setTimeout(enterSettling, timingRef.current.dispersingMs);
  }, [clearStepTimer, setPhase, enterSettling]);

  // ---- watchdog -----------------------------------------------------------

  const onWatchdogExpired = useCallback(() => {
    // Sequence failed to reach osReveal in time: abandon it, surface the error,
    // and keep the user on the Landing_Page (Req 3.6, 4.7).
    if (phaseRef.current === 'osReveal' || phaseRef.current === 'landing') return;
    clearStepTimer();
    watchdogTimerRef.current = null;
    setPhase('landing');
    if (mountedRef.current) {
      setActionError(ACTIVATION_ERROR_MESSAGE);
    }
  }, [clearStepTimer, setPhase]);

  // ---- public API ---------------------------------------------------------

  const activate = useCallback(() => {
    // Only meaningful from the pristine Landing_Page; ignore re-entrant calls.
    if (phaseRef.current !== 'landing') return;

    clearAllTimers();
    if (mountedRef.current) {
      setActionError(null);
    }

    // Reduced motion: skip dispersal/patrol, reveal the OS sign-in directly
    // (Req 12.9). This is an instantaneous success — no watchdog needed.
    if (reducedMotionRef.current) {
      setPhase('osReveal');
      return;
    }

    // Begin the sequence and arm the watchdog (Req 12.1, 3.6, 4.7).
    setPhase('activating');
    watchdogTimerRef.current = setTimeout(
      onWatchdogExpired,
      timingRef.current.watchdogMs,
    );
    stepTimerRef.current = setTimeout(
      enterDispersing,
      timingRef.current.activatingMs,
    );
  }, [clearAllTimers, setPhase, onWatchdogExpired, enterDispersing]);

  const restoreLanding = useCallback(() => {
    // Return to the pristine Landing_Page, restoring Bird_Mark, Hero copy and
    // Quick_Nav (Req 12.10).
    clearAllTimers();
    setPhase('landing');
    if (mountedRef.current) {
      setActionError(null);
    }
  }, [clearAllTimers, setPhase]);

  // Geometry-driven advance callbacks invoked by AgentField (task 9.2).
  const onDispersed = useCallback(() => {
    enterSettling();
  }, [enterSettling]);

  const onSettled = useCallback(() => {
    enterOsReveal();
  }, [enterOsReveal]);

  // ---- lifecycle ----------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (stepTimerRef.current !== null) clearTimeout(stepTimerRef.current);
      if (watchdogTimerRef.current !== null) clearTimeout(watchdogTimerRef.current);
      stepTimerRef.current = null;
      watchdogTimerRef.current = null;
    };
  }, []);

  return {
    phase,
    actionError,
    isAnimating:
      phase === 'activating' || phase === 'dispersing' || phase === 'settling',
    activate,
    restoreLanding,
    onDispersed,
    onSettled,
  };
}

export default useFlockActivation;
