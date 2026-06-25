// Feature: website-ui-redesign, Property 6
//
// Property 6: Reduced motion yields a static final state
//   — Validates Requirements 8.3, 12.9, 13.6
//
// With reduced motion preferred, every animated element of the Landing_Page
// renders in its final resting state — no entrance, loop, parallax, dispersal,
// or patrol — and activation transitions DIRECTLY to OS_Reveal with no
// intermediate animation phase.
//
// This file proves the property at two levels:
//
//   (a) The activation state machine (the strong, universal claim, 100 runs).
//       `useFlockActivation({ prefersReducedMotion: true })` must, for ANY way
//       of driving it (arbitrary timing overrides, arbitrary timer advances,
//       arbitrary geometry milestone callbacks), jump straight from `landing`
//       to `osReveal` on `activate()` and NEVER be observed in an intermediate
//       animation phase (`activating` / `dispersing` / `settling`). It also
//       must never report `isAnimating` (Req 12.9). Run under fake timers so we
//       can advance time and confirm no deferred phase transition exists.
//
//   (b) The reduced-motion render branch of every prefersReducedMotion-aware
//       component (NetworkNodes, AmbientBlobs, Scrim, Hero, AgentField). For
//       arbitrary props, rendering with prefersReducedMotion=true exercises the
//       static branch: it renders the final resting state (elements present, no
//       throw) and toggling the preference back does not throw. Asserting the
//       literal absence of animation in jsdom is unreliable, so these are
//       robust presence / static-branch checks; the hook property (a) carries
//       the strong guarantee.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import fc from 'fast-check';

import {
  useFlockActivation,
  type ActivationPhase,
  type FlockTimingConfig,
} from '@/features/landing/flock/useFlockActivation';
import { NetworkNodes } from '@/features/landing/background/NetworkNodes';
import { AmbientBlobs } from '@/features/landing/background/AmbientBlobs';
import { Scrim } from '@/features/landing/background/Scrim';
import { Hero } from '@/features/landing/Hero';
import { AgentField } from '@/features/landing/flock/AgentField';
import type { GridSpec } from '@/features/landing/flock/geometry';
import { HERO_COPY } from '@/features/landing/copy';

// The animation phases that must NEVER be observed under reduced motion: the
// machine skips straight past them to `osReveal` (Req 12.9).
const INTERMEDIATE_PHASES: ActivationPhase[] = ['activating', 'dispersing', 'settling'];

// ---------------------------------------------------------------------------
// (a) Hook property — reduced motion transitions directly to OS_Reveal
// ---------------------------------------------------------------------------

// A single forward-drive step applied after activation, mirroring how the real
// AgentField would advance the machine (timer fallbacks or geometry callbacks).
type DriveStep =
  | { kind: 'advance'; ms: number }
  | { kind: 'dispersed' }
  | { kind: 'settled' };

const stepArb: fc.Arbitrary<DriveStep> = fc.oneof(
  fc.record({ kind: fc.constant('advance' as const), ms: fc.integer({ min: 0, max: 6000 }) }),
  fc.constant({ kind: 'dispersed' as const }),
  fc.constant({ kind: 'settled' as const }),
);

// Optional timing overrides — under reduced motion these are irrelevant, so we
// generate them to prove the machine ignores them entirely.
const timingArb: fc.Arbitrary<FlockTimingConfig | undefined> = fc.option(
  fc.record({
    activatingMs: fc.integer({ min: 0, max: 500 }),
    dispersingMs: fc.integer({ min: 0, max: 3000 }),
    settlingMs: fc.integer({ min: 0, max: 3000 }),
    watchdogMs: fc.integer({ min: 10, max: 6000 }),
  }),
  { nil: undefined },
);

interface Drive {
  timing: FlockTimingConfig | undefined;
  steps: DriveStep[];
}

const driveArb: fc.Arbitrary<Drive> = fc.record({
  timing: timingArb,
  steps: fc.array(stepArb, { maxLength: 6 }),
});

describe('Property 6: reduced motion yields a static final state', () => {
  describe('(a) activation transitions directly to OS_Reveal (Req 12.9)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('activate() jumps straight to osReveal and is never observed mid-animation', () => {
      fc.assert(
        fc.property(driveArb, (drive) => {
          const { result, unmount } = renderHook(() =>
            useFlockActivation({ prefersReducedMotion: true, timing: drive.timing }),
          );

          try {
            // Pristine pre-activation state.
            expect(result.current.phase).toBe('landing');
            expect(result.current.isAnimating).toBe(false);

            // Begin Flock_Activation under reduced motion.
            act(() => {
              result.current.activate();
            });

            // Reduced motion skips dispersal/patrol and reveals the OS sign-in
            // directly — synchronously, with no intermediate phase (Req 12.9).
            expect(result.current.phase).toBe('osReveal');
            expect(result.current.isAnimating).toBe(false);
            expect(INTERMEDIATE_PHASES).not.toContain(result.current.phase);

            // Drive the machine with arbitrary forward progress. Because no
            // dispersal/patrol timers were ever armed, NOTHING can pull it into
            // an animation phase: it must stay parked on osReveal.
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

              expect(result.current.phase).toBe('osReveal');
              expect(result.current.isAnimating).toBe(false);
              expect(INTERMEDIATE_PHASES).not.toContain(result.current.phase);
            }

            // Flush any remaining timers; the end state is unchanged and no
            // watchdog error was raised (reduced motion never arms it).
            act(() => {
              vi.runOnlyPendingTimers();
            });
            expect(result.current.phase).toBe('osReveal');
            expect(result.current.actionError).toBeNull();
          } finally {
            unmount();
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // (b) Component static-branch render checks
  // -------------------------------------------------------------------------

  describe('(b) animated components render their static final state (Req 8.3, 13.6)', () => {
    // Some components observe their box via ResizeObserver inside a layout
    // effect. The shared setup mock isn't constructable in this context, so
    // install a minimal class-based stub for the duration of these renders.
    let originalResizeObserver: typeof globalThis.ResizeObserver;

    beforeEach(() => {
      originalResizeObserver = globalThis.ResizeObserver;
      class StubResizeObserver {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      globalThis.ResizeObserver =
        StubResizeObserver as unknown as typeof globalThis.ResizeObserver;
    });

    afterEach(() => {
      cleanup();
      globalThis.ResizeObserver = originalResizeObserver;
    });

    it('NetworkNodes renders its static field for any dimmed state without animating', () => {
      fc.assert(
        fc.property(fc.boolean(), (dimmed) => {
          const { container } = render(
            <NetworkNodes dimmed={dimmed} prefersReducedMotion />,
          );
          // The decorative node field container is present (final resting layer).
          const field = container.querySelector('[aria-hidden="true"]');
          expect(field).not.toBeNull();
          // Re-rendering with the preference toggled off must not throw.
          expect(() =>
            render(<NetworkNodes dimmed={dimmed} prefersReducedMotion={false} />),
          ).not.toThrow();
          cleanup();
        }),
        { numRuns: 100 },
      );
    });

    it('AmbientBlobs renders all resting blobs statically with no drift', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const { container } = render(<AmbientBlobs prefersReducedMotion />);
          const field = container.firstElementChild as HTMLElement | null;
          expect(field).not.toBeNull();
          // All three diffuse-light blobs are present in their resting position.
          expect(field!.children.length).toBe(3);
          cleanup();
        }),
        { numRuns: 25 },
      );
    });

    it('Scrim renders its static darkening for any active/intensity without a transition', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (active, intensity) => {
            const { container } = render(
              <Scrim active={active} intensity={intensity} prefersReducedMotion />,
            );
            const el = container.firstElementChild as HTMLElement | null;
            expect(el).not.toBeNull();
            // Static branch applies the target darkness directly via inline opacity.
            const opacity = Number(el!.style.opacity);
            const expected = active ? intensity : 0;
            expect(opacity).toBeCloseTo(expected, 5);
            cleanup();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Hero renders the final resting hero (single h1 headline + one Enter OS CTA)', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          render(<Hero onActivate={() => {}} prefersReducedMotion />);
          // Exactly one level-one heading containing the Hero headline.
          const headings = screen.getAllByRole('heading', { level: 1 });
          expect(headings).toHaveLength(1);
          expect(headings[0]).toHaveTextContent(HERO_COPY.headline);
          // Exactly one Primary_CTA labelled "Enter OS" (the Bird_Mark activator
          // carries a different name, so the exact match isolates the CTA).
          expect(screen.getByRole('button', { name: /^Enter OS$/ })).toBeInTheDocument();
          cleanup();
        }),
        { numRuns: 25 },
      );
    });

    it('AgentField renders the static settled Agent_Field at osReveal with no patrol', () => {
      // A concrete on-screen grid so planFlock produces a real settled field.
      const gridArb: fc.Arbitrary<GridSpec> = fc.record({
        stepPx: fc.integer({ min: 24, max: 60 }),
        width: fc.integer({ min: 600, max: 1600 }),
        height: fc.integer({ min: 600, max: 1200 }),
      });

      fc.assert(
        fc.property(gridArb, (grid) => {
          const { container } = render(
            <AgentField
              phase="osReveal"
              prefersReducedMotion
              grid={grid}
              heroCenter={{ x: grid.width / 2, y: grid.height / 2 }}
            />,
          );
          // The decorative Agent_Field layer renders (shards parked on their
          // loop starts); under reduced motion no WAAPI patrol is started.
          const field = container.querySelector('[aria-hidden="true"]');
          expect(field).not.toBeNull();
          expect(field!.children.length).toBeGreaterThan(0);
          cleanup();
        }),
        { numRuns: 25 },
      );
    });
  });
});
