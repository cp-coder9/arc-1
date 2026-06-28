/**
 * Hero — the centered primary content region of the Landing_Page.
 *
 * Feature: website-ui-redesign (Task 11.2)
 *
 * Composition (top → bottom), centered both axes:
 *  - The Bird_Mark rendered at the dominant `hero` size, wrapped by the
 *    `OrbitRing` (a thin 1–3px circular ring). The Bird_Mark is the focal
 *    element with the largest visual footprint and is horizontally centered
 *    within a 2px tolerance (Req 4.1, 4.2).
 *  - A single `<h1>` headline in the heading font Theme_Token / Space Grotesk —
 *    the page's only level-one heading (Req 4.3, 9.6).
 *  - A subline in the sans font Theme_Token / Inter (Req 4.4).
 *  - Exactly one Primary_CTA labeled "Enter OS" that calls `onActivate`
 *    (Req 4.5, 4.6). Activating the Bird_Mark is wired to the SAME `onActivate`
 *    handler, so the mark is an identical alternate activator (Req 4.8).
 *
 * Copy is fed through `clampCopy` so an over-limit headline/subline is truncated
 * to its character limit (Req 11.1, 11.4).
 *
 * Motion: the section animates its entrance with framer-motion, completing
 * within 200–1000 ms (Req 8.1). The Primary_CTA applies a hover emphasis
 * transition within 100–300 ms (Req 8.4, 8.5); the Bird_Mark applies its own
 * subtle hover scale within the same window (Req 8.6, handled by `BirdMark`).
 * When `prefersReducedMotion` is set, the section renders in its final resting
 * state immediately with no entrance animation (Req 8.3, handled here so the
 * page-level reduced-motion contract holds).
 *
 * Color/typography derive entirely from Theme_Tokens — no inline hex literals
 * (Req 1.5).
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BirdMark } from '@/design-system/BirdMark';
import {
  HERO_COPY,
  clampCopy,
  HEADLINE_LIMIT,
  SUBLINE_LIMIT,
} from './copy';
import {
  FONT_HEADING,
  FONT_SANS,
  GLASS_BORDER,
  GLASS_GLOW,
  LANDING_ACCENT,
  LANDING_TEXT,
  LANDING_TEXT_MUTED,
  SECONDARY_FOREGROUND,
  tokenVar,
} from '@/design-system/tokens';

/**
 * Hero Bird_Mark fallback footprint in px — used before the viewport is measured
 * and in non-DOM/test environments. In the browser the mark scales with the
 * Orbit_Ring (see `useOrbitSize`).
 */
const HERO_BIRD_PX = 280;

/** Orbit_Ring stroke width in px — must be between 1 and 3 (Req 4.2). */
const ORBIT_STROKE_PX = 2;

/** Fraction of the Orbit_Ring diameter the Bird_Mark fills (mockup: 86%). */
const BIRD_RATIO = 0.86;

/** Largest Orbit_Ring diameter in px (mockup: `min(58vw, 540px)`). */
const ORBIT_MAX_PX = 540;
/** Orbit diameter as a fraction of the viewport width (mockup: 58vw). */
const ORBIT_VW_RATIO = 0.58;

export interface HeroProps {
  /**
   * Begins the Flock_Activation sequence. Invoked by both the Primary_CTA and
   * the interactive Bird_Mark so the two activators behave identically
   * (Req 4.6, 4.8).
   */
  onActivate: () => void;
  /**
   * When true, render the Hero in its final resting state with no entrance
   * animation (Req 8.3). Thread this from framer-motion's `useReducedMotion()`
   * at the LandingPage level.
   */
  prefersReducedMotion?: boolean;
}

export interface OrbitRingProps {
  /** Ring diameter in px (optional; the ring fills its orbit box by default). */
  diameter?: number;
  /** Ring stroke width in px — kept within the 1–3px range (Req 4.2). */
  strokeWidth?: number;
}

/**
 * Orbit_Ring — a thin circular ring surrounding the hero Bird_Mark (Req 4.2).
 *
 * Implemented as a bordered, perfectly circular element that fills its orbit
 * box. Its border color comes from the `--glass-border` Theme_Token (light
 * mint-toned highlight) and a soft outer + inner glow from `--glass-glow`, so it
 * re-skins on a Theme_Mode flip and adds no literal colors. The ring is
 * decorative and hidden from assistive tech.
 */
export function OrbitRing({ strokeWidth = ORBIT_STROKE_PX }: OrbitRingProps) {
  // Clamp the stroke into the required 1–3px range so the ring is always a
  // valid Orbit_Ring regardless of caller input (Req 4.2).
  const stroke = Math.min(3, Math.max(1, strokeWidth));
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        // Inset slightly so the ring sits just inside the orbit box (mockup feel).
        top: '6%',
        left: '6%',
        width: '88%',
        height: '88%',
        borderRadius: '50%',
        borderStyle: 'solid',
        borderWidth: stroke,
        borderColor: tokenVar(GLASS_BORDER),
        boxShadow: `0 0 70px ${tokenVar(GLASS_GLOW)}, inset 0 0 90px ${tokenVar(GLASS_GLOW)}`,
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * Resolves the responsive Orbit_Ring diameter from the viewport width
 * (`min(58vw, 540px)`, mirroring the mockup) and rebuilds it on resize. Falls
 * back to a fixed size in non-DOM/test environments so the Hero renders sanely
 * without a layout engine.
 */
function useOrbitSize(): number {
  const initial =
    typeof window !== 'undefined' && window.innerWidth > 0
      ? Math.round(Math.min(window.innerWidth * ORBIT_VW_RATIO, ORBIT_MAX_PX))
      : Math.round(HERO_BIRD_PX / BIRD_RATIO);
  const [orbitPx, setOrbitPx] = useState(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const update = () =>
      setOrbitPx(
        Math.round(Math.min(window.innerWidth * ORBIT_VW_RATIO, ORBIT_MAX_PX)),
      );
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return orbitPx;
}

export function Hero({ onActivate, prefersReducedMotion = false }: HeroProps) {
  // Feed the static copy through the clamp so over-limit copy is truncated to
  // its character limit and within-limit copy passes through unchanged
  // (Req 11.1, 11.4).
  const headline = clampCopy(HERO_COPY.headline, HEADLINE_LIMIT);
  const subline = clampCopy(HERO_COPY.subline, SUBLINE_LIMIT);

  // Responsive orbit + bird sizing mirroring the mockup (`min(58vw, 540px)`,
  // bird 86% of the orbit), rebuilt on resize.
  const orbitPx = useOrbitSize();
  const birdPx = Math.round(orbitPx * BIRD_RATIO);

  // Entrance animation props — framer-motion entrance completing within
  // 200–1000 ms (Req 8.1). Under reduced motion the section is rendered in its
  // final resting state with no entrance (Req 8.3).
  const entrance = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.6, ease: 'easeOut' as const },
      };

  return (
    <motion.section
      {...entrance}
      className="relative flex flex-col items-center text-center px-6"
      style={{ color: tokenVar(LANDING_TEXT) }}
    >
      {/* Bird_Mark + Orbit_Ring. The wrapper is centered horizontally; the ring
          fills the orbit box behind the interactive mark (Req 4.1, 4.2). */}
      <div
        className="relative mx-auto flex items-center justify-center"
        style={{ width: orbitPx, height: orbitPx, maxWidth: '90vw' }}
      >
        <OrbitRing />
        <BirdMark
          size={birdPx}
          interactive
          onActivate={onActivate}
          blend
        />
      </div>

      {/* Single level-one heading containing the Hero headline (Req 4.3, 9.6).
          Fluid type per the mockup: clamp(26px, 4.2vw, 46px). */}
      <h1
        className="mt-8 max-w-3xl font-heading font-bold leading-tight"
        style={{
          fontFamily: tokenVar(FONT_HEADING),
          color: tokenVar(LANDING_TEXT),
          fontSize: 'clamp(26px, 4.2vw, 46px)',
          letterSpacing: '-0.01em',
        }}
      >
        {headline}
      </h1>

      {/* Subline in the sans font Theme_Token / Inter (Req 4.4). */}
      <p
        className="mt-4 max-w-xl"
        style={{
          fontFamily: tokenVar(FONT_SANS),
          color: tokenVar(LANDING_TEXT_MUTED),
          fontSize: 'clamp(13px, 1.4vw, 17px)',
        }}
      >
        {subline}
      </p>

      {/* Exactly one Primary_CTA labeled "Enter OS" (Req 4.5) → onActivate
          (Req 4.6). Mint gradient pill (mockup); hover emphasis transition
          completes within 100–300 ms (Req 8.4, 8.5); 0.2s = 200ms sits in range. */}
      <motion.button
        type="button"
        onClick={onActivate}
        whileHover={prefersReducedMotion ? undefined : { scale: 1.04, y: -2 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="mt-7 inline-flex items-center justify-center rounded-full px-10 py-4 text-base font-semibold font-heading select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        style={{
          fontFamily: tokenVar(FONT_HEADING),
          // Mint gradient (lighter top → canonical mint) derived from tokens via
          // color-mix so no literal hex enters the markup (Req 1.5).
          backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${tokenVar(
            LANDING_ACCENT,
          )} 70%, white), ${tokenVar(LANDING_ACCENT)})`,
          color: tokenVar(SECONDARY_FOREGROUND),
          boxShadow: `0 14px 36px ${tokenVar(GLASS_GLOW)}, inset 0 1px 0 rgba(255,255,255,0.6)`,
          // Token-driven focus ring color for keyboard users.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ['--tw-ring-color' as any]: tokenVar(LANDING_ACCENT),
        }}
      >
        Enter OS
      </motion.button>
    </motion.section>
  );
}

export default Hero;
