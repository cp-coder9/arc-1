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

/** Hero Bird_Mark footprint in px — the dominant element (Req 4.1). */
const HERO_BIRD_PX = 280;

/**
 * The Orbit_Ring diameter in px. Sized larger than the Bird_Mark so the ring
 * encircles the mark with breathing room while the mark keeps the largest
 * *filled* footprint (the ring is a thin stroke, not a filled area).
 */
const ORBIT_DIAMETER_PX = 360;

/** Orbit_Ring stroke width in px — must be between 1 and 3 (Req 4.2). */
const ORBIT_STROKE_PX = 2;

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
  /** Ring diameter in px. */
  diameter: number;
  /** Ring stroke width in px — kept within the 1–3px range (Req 4.2). */
  strokeWidth?: number;
}

/**
 * Orbit_Ring — a thin circular ring surrounding the hero Bird_Mark (Req 4.2).
 *
 * Implemented as a bordered, perfectly circular element. Its border color comes
 * from the `--glass-border` Theme_Token (light mint-toned highlight) and a soft
 * outer glow from `--glass-glow`, so it re-skins on a Theme_Mode flip and adds
 * no literal colors. The ring is decorative and hidden from assistive tech.
 */
export function OrbitRing({ diameter, strokeWidth = ORBIT_STROKE_PX }: OrbitRingProps) {
  // Clamp the stroke into the required 1–3px range so the ring is always a
  // valid Orbit_Ring regardless of caller input (Req 4.2).
  const stroke = Math.min(3, Math.max(1, strokeWidth));
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: diameter,
        height: diameter,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        borderStyle: 'solid',
        borderWidth: stroke,
        borderColor: tokenVar(GLASS_BORDER),
        boxShadow: `0 0 40px ${tokenVar(GLASS_GLOW)}`,
        pointerEvents: 'none',
      }}
    />
  );
}

export function Hero({ onActivate, prefersReducedMotion = false }: HeroProps) {
  // Feed the static copy through the clamp so over-limit copy is truncated to
  // its character limit and within-limit copy passes through unchanged
  // (Req 11.1, 11.4).
  const headline = clampCopy(HERO_COPY.headline, HEADLINE_LIMIT);
  const subline = clampCopy(HERO_COPY.subline, SUBLINE_LIMIT);

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
          is absolutely centered behind the interactive mark (Req 4.1, 4.2). */}
      <div
        className="relative mx-auto flex items-center justify-center"
        style={{ width: ORBIT_DIAMETER_PX, height: ORBIT_DIAMETER_PX }}
      >
        <OrbitRing diameter={ORBIT_DIAMETER_PX} />
        <BirdMark
          size={HERO_BIRD_PX}
          interactive
          onActivate={onActivate}
          blend
        />
      </div>

      {/* Single level-one heading containing the Hero headline (Req 4.3, 9.6). */}
      <h1
        className="mt-10 max-w-3xl font-heading font-bold leading-tight text-4xl sm:text-5xl lg:text-6xl"
        style={{
          fontFamily: tokenVar(FONT_HEADING),
          color: tokenVar(LANDING_TEXT),
        }}
      >
        {headline}
      </h1>

      {/* Subline in the sans font Theme_Token / Inter (Req 4.4). */}
      <p
        className="mt-5 max-w-xl text-lg sm:text-xl"
        style={{
          fontFamily: tokenVar(FONT_SANS),
          color: tokenVar(LANDING_TEXT_MUTED),
        }}
      >
        {subline}
      </p>

      {/* Exactly one Primary_CTA labeled "Enter OS" (Req 4.5) → onActivate
          (Req 4.6). Hover emphasis transition completes within 100–300 ms
          (Req 8.4, 8.5); 0.2s = 200ms sits in range. */}
      <motion.button
        type="button"
        onClick={onActivate}
        whileHover={prefersReducedMotion ? undefined : { scale: 1.04 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="mt-9 inline-flex items-center justify-center rounded-full px-9 py-4 text-base font-semibold font-heading select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        style={{
          fontFamily: tokenVar(FONT_HEADING),
          backgroundColor: tokenVar(LANDING_ACCENT),
          color: tokenVar(SECONDARY_FOREGROUND),
          boxShadow: `0 10px 30px ${tokenVar(GLASS_GLOW)}`,
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
