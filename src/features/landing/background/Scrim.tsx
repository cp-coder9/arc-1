/**
 * Scrim — z1 background overlay.
 *
 * Feature: website-ui-redesign
 *
 * A full-bleed overlay that darkens the background during and after the
 * Flock_Activation sequence. As the Hero copy, Quick_Nav, and grid texture
 * dissolve to reduce on-screen complexity (Req 12.3), the Scrim deepens so the
 * OS_Reveal Glass_Surface card reads with strong contrast against a calmed,
 * darkened field.
 *
 * Per the design z-order table this is layer 1 (alongside the Grid), sitting
 * above the AmbientBlobs (z0) and below the Network_Nodes (z2), Agent_Field
 * (z3), and all UI.
 *
 * The darkening blends a token-derived deep-teal floor with a black wash: the
 * deep teal keeps the darkening on-brand while the black guarantees the field
 * gets genuinely darker for contrast. Because the deep-teal layer derives from
 * `--landing-bg-deep`, the Scrim re-skins with the Theme_Mode (Req 10.1).
 */

import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { LANDING_BG_DEEP, tokenVar } from '@/design-system/tokens';

export interface ScrimProps {
  /**
   * Whether the Scrim is darkening the background. False on the initial
   * Landing_Page; true during/after Flock_Activation (Req 12.3).
   */
  active?: boolean;
  /**
   * Maximum darkening opacity applied when `active` is true, in the range
   * [0, 1]. Defaults to 0.55. Values outside the range are clamped.
   */
  intensity?: number;
  /**
   * When true, skip the fade transition and apply the target darkness
   * immediately (Req 8.3 — no animation under reduced motion).
   */
  prefersReducedMotion?: boolean;
  /** Optional extra class names for the full-bleed container. */
  className?: string;
}

const DEFAULT_INTENSITY = 0.55;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function Scrim({
  active = false,
  intensity = DEFAULT_INTENSITY,
  prefersReducedMotion = false,
  className,
}: ScrimProps) {
  const targetOpacity = active ? clamp01(intensity) : 0;

  const baseStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    // z1 — same layer as the Grid, beneath the Network_Nodes.
    zIndex: 1,
    // Token-derived deep-teal floor layered under a black wash so the
    // darkening stays on-brand yet genuinely deepens the field.
    background: `linear-gradient(${tokenVar(LANDING_BG_DEEP)}, ${tokenVar(
      LANDING_BG_DEEP,
    )}), rgba(0, 0, 0, 0.6)`,
  };

  if (prefersReducedMotion) {
    // Static state — apply the target darkness with no transition (Req 8.3).
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{ ...baseStyle, opacity: targetOpacity }}
      />
    );
  }

  return (
    <motion.div
      aria-hidden="true"
      className={className}
      style={baseStyle}
      initial={false}
      animate={{ opacity: targetOpacity }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    />
  );
}

export default Scrim;
