/**
 * Landing Feature — `LandingPage` composition.
 *
 * Feature: website-ui-redesign (Task 12.1)
 *
 * The full Landing_Page: it stacks every background layer, the Hero/Quick_Nav
 * content, the Top_Bar, and the OS_Reveal card in the documented z-order and
 * wires them to the `useFlockActivation` state machine so the signature
 * Flock_Activation → OS_Reveal sequence plays out.
 *
 * Rendering layers (design "Rendering Layers (z-order)"):
 *   z0  AmbientBlobs   — drifting color the glass refracts (sets its own z).
 *   z1  GridBackground — checkered grid; dims after activation (Req 13.1, 13.3).
 *   z1  Scrim          — darkens the field during/after activation (sets own z).
 *   z2  NetworkNodes   — twinkling junction dots; dim after activation (13.2, 13.4).
 *   z3  AgentField     — Agent_Shards in flight then patrolling (Req 12.2, 12.5).
 *   z4  Hero/QuickNav  — dissolve during activation (Req 12.3).
 *   z6  TopBar         — wordmark + actions.
 *   z7  OSRevealCard   — frosted sign-in card above the Agent_Field (12.6, 12.7).
 *
 * Behavior:
 *   - `phase` from `useFlockActivation` drives the whole page: while the
 *     sequence runs (activating/dispersing/settling) and after it (osReveal) the
 *     Hero copy + Quick_Nav dissolve (Req 12.3), the grid + nodes dim
 *     (Req 13.3, 13.4), and the Scrim darkens. The OS_Reveal card appears at
 *     `osReveal`, with the Agent_Field visible-but-blurred behind it (Req 12.6).
 *   - A "Back to landing" affordance is shown on OS_Reveal and calls
 *     `restoreLanding()` to return to the pristine Landing_Page (Req 12.10).
 *   - `Enter OS` (Top_Bar + Hero Primary_CTA) and the interactive Bird_Mark all
 *     call `activate()`; `actionError` is surfaced through the Top_Bar (Req 3.6).
 *
 * Reduced motion (Req 8.3, 12.9): `prefersReducedMotion` (from framer-motion's
 * `useReducedMotion()`) is threaded to every animated child, which then renders
 * its static final state; `useFlockActivation` jumps straight to `osReveal`.
 *
 * Responsive (Req 7.1–7.5): the content is a single centered column ordered
 * Top_Bar → Hero → Quick_Nav, so 320–767px stacks cleanly, 768–1023px never
 * overlaps/clips, and ≥1024px centers the Hero. The root is `overflow-x-hidden`
 * with `max-w` content constraints so there is no horizontal scroll across
 * 320–3840px. Focus order follows DOM order Top_Bar → Hero → Quick_Nav (Req 9.7).
 *
 * Color derives entirely from Theme_Tokens (no inline hex literals, Req 1.5).
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { TopBar } from './TopBar';
import { Hero } from './Hero';
import { QuickNav } from './QuickNav';
import { OSRevealCard } from './OSRevealCard';
import { AmbientBlobs } from './background/AmbientBlobs';
import { GridBackground } from './background/GridBackground';
import { Scrim } from './background/Scrim';
import { NetworkNodes } from './background/NetworkNodes';
import { AgentField } from './flock/AgentField';
import { useFlockActivation } from './flock/useFlockActivation';
import { cn } from '@/lib/utils';
import {
  GLASS_BORDER,
  GRID_STEP,
  LANDING_BG,
  LANDING_TEXT,
  RING,
  tokenVar,
} from '@/design-system/tokens';

export interface LandingPageProps {
  /**
   * Navigate to the signup page (Sign_Up_Action, Req 3.4). `App.tsx` (Task 13.1)
   * supplies the real route; defaults to a no-op so the page renders standalone.
   */
  onSignUp?: () => void;
  /**
   * Navigate to a Quick_Nav destination route (Req 5.3). `App.tsx` supplies the
   * real router; defaults to a no-op.
   */
  onNavigate?: (route: string) => void;
  /**
   * Submit the OS_Reveal sign-in form (Req 12.7). `App.tsx` supplies the real
   * auth handler; defaults to a no-op.
   */
  onSignIn?: () => void;
  className?: string;
}

const noop = () => {};

/** Accessible / visible label for the restore-landing affordance (Req 12.10). */
const RESTORE_LABEL = 'Back to landing';

/** Content column max width so the layout never sprawls at large viewports. */
const CONTENT_MAX_WIDTH = 'max-w-6xl';

interface Measurement {
  width: number;
  height: number;
  stepPx: number;
  heroCenter: { x: number; y: number };
}

const EMPTY_MEASUREMENT: Measurement = {
  width: 0,
  height: 0,
  stepPx: 0,
  heroCenter: { x: 0, y: 0 },
};

/**
 * LandingPage — composes the full Landing_Page and drives Flock_Activation.
 */
export function LandingPage({
  onSignUp = noop,
  onNavigate = noop,
  onSignIn = noop,
  className,
}: LandingPageProps) {
  // framer-motion reports the user's reduced-motion preference; thread it to
  // every animated child and into the activation hook (Req 8.3, 12.9).
  const prefersReducedMotion = useReducedMotion() ?? false;

  const {
    phase,
    actionError,
    activate,
    restoreLanding,
    onDispersed,
    onSettled,
  } = useFlockActivation({ prefersReducedMotion });

  // ── Geometry measurement ───────────────────────────────────────────────
  // AgentField needs a concrete grid { stepPx, width, height } and a hero
  // centre to explode from. We measure the page container + resolve the
  // `--grid-step` clamp() to px via a hidden probe (same approach as
  // NetworkNodes), re-measuring on resize so the flock matches the viewport.
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [measurement, setMeasurement] = useState<Measurement>(EMPTY_MEASUREMENT);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      const stepPx = probeRef.current
        ? probeRef.current.getBoundingClientRect().width
        : 0;

      // Hero centre relative to the container; fall back to the container centre.
      let heroCenter = { x: width / 2, y: height / 2 };
      if (heroRef.current) {
        const containerRect = el.getBoundingClientRect();
        const heroRect = heroRef.current.getBoundingClientRect();
        heroCenter = {
          x: heroRect.left - containerRect.left + heroRect.width / 2,
          y: heroRect.top - containerRect.top + heroRect.height / 2,
        };
      }

      setMeasurement({ width, height, stepPx, heroCenter });
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, []);

  // ── Phase-derived presentation ─────────────────────────────────────────
  const isLanding = phase === 'landing';
  const isReveal = phase === 'osReveal';
  // Grid + nodes dim and the Scrim darkens whenever we have left the pristine
  // Landing_Page (Req 13.3, 13.4, 12.3).
  const dimmed = !isLanding;

  // Hero copy + Quick_Nav dissolve once activation begins (Req 12.3); they are
  // also made non-interactive so focus cannot land on a faded control.
  const dissolveTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.5, ease: 'easeInOut' as const };
  const contentMotion = {
    animate: { opacity: isLanding ? 1 : 0 },
    transition: dissolveTransition,
    style: {
      pointerEvents: (isLanding ? 'auto' : 'none') as 'auto' | 'none',
    },
  };

  const handleSignIn = useCallback(() => {
    onSignIn();
  }, [onSignIn]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative min-h-screen w-full overflow-x-hidden',
        className,
      )}
      style={{
        backgroundColor: tokenVar(LANDING_BG),
        color: tokenVar(LANDING_TEXT),
      }}
    >
      {/* Hidden probe resolves the `--grid-step` clamp() to a px width so the
          flock geometry matches the rendered grid. */}
      <span
        ref={probeRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: tokenVar(GRID_STEP),
          height: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />

      {/* ── Background layers (z0–z3) ──────────────────────────────────── */}
      <AmbientBlobs prefersReducedMotion={prefersReducedMotion} />
      <GridBackground dimmed={dimmed} className="z-[1]" />
      <Scrim active={dimmed} prefersReducedMotion={prefersReducedMotion} />
      <NetworkNodes
        dimmed={dimmed}
        prefersReducedMotion={prefersReducedMotion}
        className="z-[2]"
      />
      <AgentField
        phase={phase}
        prefersReducedMotion={prefersReducedMotion}
        grid={{
          stepPx: measurement.stepPx,
          width: measurement.width,
          height: measurement.height,
        }}
        heroCenter={measurement.heroCenter}
        onDispersed={onDispersed}
        onSettled={onSettled}
        className="z-[3]"
      />

      {/* ── Content column (z4+): Top_Bar → Hero → Quick_Nav ───────────── */}
      <div className="relative z-[4] flex min-h-screen flex-col">
        {/* Top_Bar (z6) — above Hero/Quick_Nav in the stacking order. */}
        <div className="relative z-[6] w-full">
          <div className={cn('mx-auto w-full', CONTENT_MAX_WIDTH)}>
            <TopBar
              onActivate={activate}
              onSignUp={onSignUp}
              actionError={actionError}
            />
          </div>
        </div>

        {/* Hero — centered both axes on desktop; dissolves on activation. */}
        <motion.main
          className={cn(
            'mx-auto flex w-full flex-1 items-center justify-center',
            'px-4 py-10',
            CONTENT_MAX_WIDTH,
          )}
          animate={contentMotion.animate}
          transition={contentMotion.transition}
          style={contentMotion.style}
          aria-hidden={!isLanding}
        >
          <div ref={heroRef} className="w-full">
            <Hero
              onActivate={activate}
              prefersReducedMotion={prefersReducedMotion}
            />
          </div>
        </motion.main>

        {/* Quick_Nav — bottom row; dissolves on activation alongside the Hero. */}
        <motion.div
          className={cn('mx-auto w-full px-4 pb-10', CONTENT_MAX_WIDTH)}
          animate={contentMotion.animate}
          transition={contentMotion.transition}
          style={contentMotion.style}
          aria-hidden={!isLanding}
        >
          <QuickNav onNavigate={onNavigate} />
        </motion.div>
      </div>

      {/* ── OS_Reveal overlay (z7) ─────────────────────────────────────── */}
      {isReveal ? (
        <div
          className="absolute inset-0 z-[7] flex flex-col items-center justify-center px-4 py-10"
        >
          {/* Restore-landing affordance — keyboard-operable button (Req 12.10). */}
          <div className={cn('mb-6 w-full max-w-sm')}>
            <button
              type="button"
              onClick={restoreLanding}
              aria-label={RESTORE_LABEL}
              className={cn(
                'inline-flex min-h-11 items-center justify-center rounded-full',
                'border px-4 font-sans text-sm font-medium',
                'cursor-pointer select-none transition-colors duration-200 ease-out',
                'outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
              )}
              style={{
                color: tokenVar(LANDING_TEXT),
                borderColor: tokenVar(GLASS_BORDER),
                ['--tw-ring-color' as string]: tokenVar(RING),
              }}
            >
              {RESTORE_LABEL}
            </button>
          </div>

          <OSRevealCard onSignIn={handleSignIn} />
        </div>
      ) : null}
    </div>
  );
}

export default LandingPage;
