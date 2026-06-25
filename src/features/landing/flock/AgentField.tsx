// ─── Agent Field — render + animation ───────────────────────────────────────
// Feature: website-ui-redesign
//
// `AgentField` renders and animates the Agent_Shards (mini Bird_Marks) that give
// the Landing_Page its signature Flock_Activation: a swarm of paper-crane shards
// that explode outward from the hero centre, settle faintly onto the grid, and
// then patrol the Network_Node lattice indefinitely behind the frosted OS_Reveal
// card.
//
// It is a thin presentation layer over the pure geometry in `./geometry.ts`
// (`planFlock`, `pointOnLoop`) and is driven entirely by the `phase` reported by
// `useFlockActivation`. It owns no state-machine logic of its own; instead it
// reports geometry milestones back through `onDispersed` / `onSettled` so the
// hook can advance (the hook also has internal fallback timers, so the sequence
// still completes even if a callback never fires).
//
// Behaviour by phase (Req 12.2–12.6, 12.9):
//   • landing / activating → nothing rendered (the shards have not erupted yet).
//   • dispersing → each shard flies from the hero centre to its divergent
//     `burstTarget` along an outward trajectory (framer-motion). On completion
//     it calls `onDispersed`.
//   • settling → each shard eases onto its loop's start node and fades to
//     ≤ SETTLE_MAX_OPACITY (0.25). On completion it calls `onSettled`.
//   • osReveal → each shard runs an indefinite WAAPI (`element.animate`) patrol
//     loop around its rectangular node loop at uniform speed, with mixed
//     clockwise / counter-clockwise directions (the direction is baked into the
//     loop's corner ordering by `planFlock`). The whole field is slightly
//     blurred so it reads as "behind frosted glass" beneath the OS_Reveal card.
//   • prefers-reduced-motion → the field renders its static settled end-state
//     (shards resting on their loop starts at ≤0.25 opacity) with no flight or
//     patrol motion. `useFlockActivation` jumps straight to `osReveal` in this
//     case, so this component simply skips every animation.
//
// This is a purely decorative layer: `aria-hidden`, no pointer events, and all
// colour comes from Theme_Tokens via the `BirdMark` primitive (no literal hex).

import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import BirdMark from '@/design-system/BirdMark';
import type { ActivationPhase } from './useFlockActivation';
import {
  FLOCK,
  SETTLE_MAX_OPACITY,
  planFlock,
  pointOnLoop,
  type AgentPlan,
  type GridSpec,
} from './geometry';

export interface AgentFieldProps {
  /** Current Flock_Activation phase (from `useFlockActivation`). */
  phase: ActivationPhase;
  /** When true, render the static settled end-state with no motion (Req 12.9). */
  prefersReducedMotion?: boolean;
  /** Viewport/grid geometry the flock is planned against. */
  grid: GridSpec;
  /** Requested Agent_Shard count; clamped into FLOCK bounds by `planFlock`. */
  count?: number;
  /** Deterministic seed so the same field is reproducible across renders. */
  seed?: number;
  /** Hero centre the shards explode from; defaults to the grid centre. */
  heroCenter?: { x: number; y: number };
  /** Geometry callback: shards reached their burst targets (→ settling). */
  onDispersed?: () => void;
  /** Geometry callback: shards settled and dimmed (→ osReveal). */
  onSettled?: () => void;
  className?: string;
}

/** Outward-flight duration in seconds (visual; the hook advances on completion). */
const DISPERSE_DURATION_S = 1.2;
/** Settle-onto-loop duration in seconds. */
const SETTLE_DURATION_S = 0.6;
/** Opacity of an Agent_Shard while in flight (clearly visible). */
const FLIGHT_OPACITY = 0.9;
/** Slight blur applied to the settled/patrolling field so it reads as "behind glass". */
const FIELD_BLUR_PX = 2;

/** Default flock size (within FLOCK bounds) when the caller doesn't specify. */
const DEFAULT_COUNT = 42;
const DEFAULT_SEED = 1;

/**
 * Deterministic settled opacity for a shard, always ≤ SETTLE_MAX_OPACITY (0.25)
 * so the field reads as a faint texture beneath the OS_Reveal glass (Req 12.4).
 */
function settledOpacity(id: number): number {
  const r = Math.abs(Math.sin((id + 1) * 45.123)) % 1;
  // 0.15 .. 0.25 — varied for life, never exceeding the 0.25 ceiling.
  return 0.15 + r * (SETTLE_MAX_OPACITY - 0.15);
}

/** Small deterministic per-shard flight delay so the burst feels organic. */
function flightDelay(id: number): number {
  const r = Math.abs(Math.sin((id + 1) * 12.793)) % 1;
  return r * 0.15;
}

/**
 * Builds WAAPI keyframes + duration for one shard's patrol loop. Keyframes sit
 * on the loop's corner nodes with `offset` proportional to cumulative arc length
 * so linear easing produces uniform speed (Req 12.5). The corner ordering (set
 * by `planFlock` from `clockwise`) determines travel direction, so sampling the
 * loop in order reproduces the mixed clockwise / counter-clockwise field.
 */
function buildPatrol(plan: AgentPlan): { keyframes: Keyframe[]; durationMs: number } | null {
  const { loop } = plan;
  if (loop.length < 2) return null;

  const corners = [...loop, loop[0]]; // close the loop back to the start node
  const cumulative: number[] = [0];
  let perimeter = 0;
  for (let i = 1; i < corners.length; i += 1) {
    const dx = corners[i].x - corners[i - 1].x;
    const dy = corners[i].y - corners[i - 1].y;
    perimeter += Math.abs(dx) + Math.abs(dy); // axis-aligned segments
    cumulative.push(perimeter);
  }
  if (perimeter <= 0) return null;

  const keyframes: Keyframe[] = corners.map((corner, i) => ({
    transform: `translate(${corner.x}px, ${corner.y}px)`,
    offset: cumulative[i] / perimeter,
  }));

  const speed = plan.speedPxPerSec > 0 ? plan.speedPxPerSec : FLOCK.speedPxPerSec;
  return { keyframes, durationMs: (perimeter / speed) * 1000 };
}

/**
 * Agent_Field — renders the Agent_Shards and animates them through the
 * Flock_Activation phases.
 */
export function AgentField({
  phase,
  prefersReducedMotion = false,
  grid,
  count = DEFAULT_COUNT,
  seed = DEFAULT_SEED,
  heroCenter,
  onDispersed,
  onSettled,
  className,
}: AgentFieldProps) {
  // Deterministic flock plan for this grid + seed (Req 12.2, 12.5).
  const plans = useMemo(
    () => planFlock(grid, count, seed),
    [grid, count, seed],
  );

  const center = heroCenter ?? { x: grid.width / 2, y: grid.height / 2 };

  // Refs to each patrolling shard element + its live WAAPI handle (osReveal).
  const elRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Guards so each geometry callback fires at most once per phase.
  const firedRef = useRef<{ dispersed: boolean; settled: boolean }>({
    dispersed: false,
    settled: false,
  });

  // Reset the once-per-phase callback guards whenever the phase changes.
  useEffect(() => {
    if (phase === 'dispersing') firedRef.current.dispersed = false;
    if (phase === 'settling') firedRef.current.settled = false;
  }, [phase]);

  // Indefinite WAAPI patrol while the OS_Reveal card is shown (Req 12.5, 12.6).
  // Skipped under reduced motion — the shards stay static at their loop starts.
  useEffect(() => {
    if (phase !== 'osReveal' || prefersReducedMotion) return undefined;

    const animations: Animation[] = [];
    plans.forEach((plan, i) => {
      const el = elRefs.current[i];
      if (!el || typeof el.animate !== 'function') return;
      const patrol = buildPatrol(plan);
      if (!patrol) return;
      const anim = el.animate(patrol.keyframes, {
        duration: patrol.durationMs,
        iterations: Infinity,
        easing: 'linear', // uniform speed (Req 12.5)
      });
      animations.push(anim);
    });

    // Clean up every patrol animation on unmount or phase change.
    return () => {
      animations.forEach((anim) => anim.cancel());
    };
  }, [phase, prefersReducedMotion, plans]);

  // Nothing to show until the shards erupt.
  if (phase !== 'dispersing' && phase !== 'settling' && phase !== 'osReveal') {
    return null;
  }

  const isFlightPhase = phase === 'dispersing' || phase === 'settling';

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        // Visible-but-blurred beneath the OS_Reveal glass once settled (Req 12.6).
        filter: phase === 'osReveal' ? `blur(${FIELD_BLUR_PX}px)` : undefined,
        transition: 'filter 500ms ease',
      }}
    >
      {plans.map((plan, i) => {
        const start = pointOnLoop(plan.loop, 0);
        const half = plan.sizePx / 2;
        const baseStyle = {
          position: 'absolute' as const,
          top: 0,
          left: 0,
          width: plan.sizePx,
          height: plan.sizePx,
          marginLeft: -half,
          marginTop: -half,
          willChange: 'transform, opacity' as const,
        };

        const shard = <BirdMark size={plan.sizePx} decorative blend />;

        if (isFlightPhase) {
          // framer-motion drives the explode (dispersing) and settle (settling)
          // transitions on the same element so they chain seamlessly.
          const target =
            phase === 'dispersing'
              ? { x: plan.burstTarget.x, y: plan.burstTarget.y, opacity: FLIGHT_OPACITY }
              : { x: start.x, y: start.y, opacity: settledOpacity(plan.id) };

          const transition =
            phase === 'dispersing'
              ? { duration: DISPERSE_DURATION_S, ease: 'easeOut' as const, delay: flightDelay(plan.id) }
              : { duration: SETTLE_DURATION_S, ease: 'easeInOut' as const };

          const handleComplete = () => {
            if (phase === 'dispersing' && !firedRef.current.dispersed) {
              firedRef.current.dispersed = true;
              onDispersed?.();
            } else if (phase === 'settling' && !firedRef.current.settled) {
              firedRef.current.settled = true;
              onSettled?.();
            }
          };

          return (
            <motion.div
              key={plan.id}
              style={baseStyle}
              initial={{ x: center.x, y: center.y, opacity: 0 }}
              animate={target}
              transition={transition}
              onAnimationComplete={handleComplete}
            >
              {shard}
            </motion.div>
          );
        }

        // osReveal: plain element parked on its loop start; the WAAPI patrol
        // effect drives the indefinite loop. Under reduced motion it stays put,
        // giving the static settled end-state (Req 12.9).
        return (
          <div
            key={plan.id}
            ref={(el) => {
              elRefs.current[i] = el;
            }}
            style={{
              ...baseStyle,
              opacity: settledOpacity(plan.id),
              transform: `translate(${start.x}px, ${start.y}px)`,
            }}
          >
            {shard}
          </div>
        );
      })}
    </div>
  );
}

export default AgentField;
