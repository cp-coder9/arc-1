/**
 * AmbientBlobs — z0 background layer (Liquid Glass).
 *
 * Feature: website-ui-redesign
 *
 * Soft, oversized color blobs that drift slowly behind everything else on the
 * Landing_Page. They are the colored light the frosted Glass_Surface refracts
 * (the "Liquid Glass" effect): because content behind the glass is blurred (not
 * occluded), these drifting hues bleed through the OS_Reveal card and the Top_Bar
 * pill, giving the glass its living, tinted quality.
 *
 * Per the design z-order table this is layer 0 — the deepest layer, sitting
 * beneath the Grid, Scrim, Network_Nodes, Agent_Field, and all UI.
 *
 * Colors derive entirely from Theme_Tokens (no literal hex), so the blobs
 * re-skin automatically when the Theme_Mode flips (Req 10.1, 10.2).
 *
 * Reduced motion (Req 8.3): when `prefersReducedMotion` is true the blobs render
 * in a fixed resting position with no drift animation.
 */

import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import {
  GLASS_GLOW,
  LANDING_ACCENT,
  PRIMARY_LIGHT,
  tokenVar,
} from '@/design-system/tokens';

export interface AmbientBlobsProps {
  /**
   * When true, render the blobs statically in their resting position with no
   * drift animation (Req 8.3). Thread this from framer-motion's
   * `useReducedMotion()` at the LandingPage level.
   */
  prefersReducedMotion?: boolean;
  /** Optional extra class names for the full-bleed container. */
  className?: string;
}

/**
 * A single drifting blob description. Positions/sizes are in viewport units so
 * the field scales with the screen; `color` is a token-derived CSS color.
 */
interface BlobSpec {
  /** Token-derived color for the radial gradient core. */
  color: string;
  /** Resting position (CSS `left`/`top`). */
  left: string;
  top: string;
  /** Diameter of the blob. */
  size: string;
  /** Drift offsets (x, y) the blob eases between, in px. */
  drift: { x: number[]; y: number[]; scale: number[] };
  /** Seconds for one full drift cycle. */
  duration: number;
}

const BLOBS: BlobSpec[] = [
  {
    color: tokenVar(GLASS_GLOW),
    left: '-8%',
    top: '-10%',
    size: '60vmax',
    drift: { x: [0, 80, -40, 0], y: [0, 60, 120, 0], scale: [1, 1.08, 0.96, 1] },
    duration: 26,
  },
  {
    color: tokenVar(PRIMARY_LIGHT),
    left: '55%',
    top: '10%',
    size: '48vmax',
    drift: { x: [0, -70, 50, 0], y: [0, 50, -30, 0], scale: [1, 0.94, 1.1, 1] },
    duration: 32,
  },
  {
    color: tokenVar(LANDING_ACCENT),
    left: '20%',
    top: '55%',
    size: '52vmax',
    drift: { x: [0, 60, -60, 0], y: [0, -50, 40, 0], scale: [1, 1.06, 0.92, 1] },
    duration: 38,
  },
];

export function AmbientBlobs({
  prefersReducedMotion = false,
  className,
}: AmbientBlobsProps) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        // The blobs are diffuse light; keep the whole field soft.
        filter: 'blur(80px)',
        // z0 — deepest layer.
        zIndex: 0,
      }}
    >
      {BLOBS.map((blob, index) => {
        const baseStyle: CSSProperties = {
          position: 'absolute',
          left: blob.left,
          top: blob.top,
          width: blob.size,
          height: blob.size,
          borderRadius: '50%',
          // Radial fade from the token color core to transparent edges.
          background: `radial-gradient(circle at center, ${blob.color} 0%, transparent 70%)`,
          // Blend the colored light additively over the deep-teal backdrop.
          mixBlendMode: 'screen',
          opacity: 0.55,
          willChange: prefersReducedMotion ? undefined : 'transform',
        };

        if (prefersReducedMotion) {
          // Static resting state — no drift (Req 8.3).
          return <div key={index} style={baseStyle} />;
        }

        return (
          <motion.div
            key={index}
            style={baseStyle}
            animate={{
              x: blob.drift.x,
              y: blob.drift.y,
              scale: blob.drift.scale,
            }}
            transition={{
              duration: blob.duration,
              repeat: Infinity,
              repeatType: 'loop',
              ease: 'easeInOut',
            }}
          />
        );
      })}
    </div>
  );
}

export default AmbientBlobs;
