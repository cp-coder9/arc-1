// Feature: website-ui-redesign, Property 15
//
// Property 15: Activation round-trip restores the landing — Validates Requirements 12.10
//
// For any initial Landing_Page state, beginning Flock_Activation and then
// invoking the return-to-landing affordance (`restoreLanding`) restores the
// Bird_Mark, Hero_Section copy, and Quick_Nav to their exact pre-activation
// state. The `useFlockActivation` hook is the single source of truth for that
// state: its `phase` gates which surfaces render (landing surfaces are visible
// only while `phase === 'landing'`) and `actionError` is the only residual
// signal an aborted activation can leave behind. So the round-trip reduces to
// proving that, no matter how the sequence was driven (reduced motion or not;
// advanced via fallback timers or via the geometry `onDispersed`/`onSettled`
// callbacks; even aborted by the watchdog), `restoreLanding()` always returns
// `phase` to 'landing' and `actionError` to null — the exact pre-activation
// snapshot.

import { act, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import {
  useFlockActivation,
  type FlockTimingConfig,
} from '@/features/landing/flock/useFlockActivation';

// A single drive step applied after activation. Steps push the state machine
// forward either by advancing the internal fallback timers or by firing the
// geometry milestones the AgentField would normally report.
type DriveStep =
  | { kind: 'advance'; ms: number }
  | { kind: 'dispersed' }
  | { kind: 'settled' };

const stepArb: fc.Arbitrary<DriveStep> = fc.oneof(
  // Bounded timer advances: span the whole sequence (0..4000ms) so runs land
  // in every phase, while staying small enough to keep the test fast.
  fc.record({ kind: fc.constant('advance' as const), ms: fc.integer({ min: 0, max: 4000 }) }),
  fc.constant({ kind: 'dispersed' as const }),
  fc.constant({ kind: 'settled' as const }),
);

interface Drive {
  reducedMotion: boolean;
  /** When true, use a timing config whose watchdog fires before the sequence
   *  can complete, exercising the aborted-activation path (actionError set). */
  triggerWatchdog: boolean;
  steps: DriveStep[];
}

const driveArb: fc.Arbitrary<Drive> = fc
  .record({
    reducedMotion: fc.boolean(),
    triggerWatchdog: fc.boolean(),
    steps: fc.array(stepArb, { maxLength: 6 }),
  })
  // Reduced motion jumps straight to osReveal and never arms the watchdog, so
  // only exercise the watchdog abort path when motion is allowed.
  .map((d) => ({ ...d, reducedMotion: d.triggerWatchdog ? false : d.reducedMotion }));

// Timing that forces the 5000ms-class watchdog to fire mid-sequence: the
// activating step is tiny (we reach `dispersing` almost immediately) but the
// dispersing/settling fallbacks are far longer than the watchdog window.
const WATCHDOG_TIMING: FlockTimingConfig = {
  activatingMs: 10,
  dispersingMs: 2000,
  settlingMs: 2000,
  watchdogMs: 40,
};

describe('Property 15: Activation round-trip restores the landing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('restoreLanding() always returns to the exact pre-activation Landing state (Req 12.10)', () => {
    fc.assert(
      fc.property(driveArb, (drive) => {
        const { result, unmount } = renderHook(() =>
          useFlockActivation({
            prefersReducedMotion: drive.reducedMotion,
            timing: drive.triggerWatchdog ? WATCHDOG_TIMING : undefined,
          }),
        );

        try {
          // --- pristine pre-activation snapshot (Bird_Mark / Hero / Quick_Nav
          // are all gated on this exact state) ---
          const initial = {
            phase: result.current.phase,
            actionError: result.current.actionError,
          };
          expect(initial).toEqual({ phase: 'landing', actionError: null });

          // --- begin Flock_Activation ---
          act(() => {
            result.current.activate();
          });

          // --- drive the sequence through arbitrary forward progress ---
          for (const step of drive.steps) {
            act(() => {
              if (step.kind === 'advance') {
                vi.advanceTimersByTime(step.ms);
              } else if (step.kind === 'dispersed') {
                result.current.onDispersed();
              } else {
                result.current.onSettled();
              }
            });
          }

          // --- invoke the return-to-landing affordance ---
          act(() => {
            result.current.restoreLanding();
          });

          // --- exact round-trip to the pre-activation state (Req 12.10) ---
          expect(result.current.phase).toBe('landing');
          expect(result.current.actionError).toBeNull();
          expect({
            phase: result.current.phase,
            actionError: result.current.actionError,
          }).toEqual(initial);
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});
