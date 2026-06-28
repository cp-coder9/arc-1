// ─── Network Nodes ───────────────────────────────────────────────────────────
// Feature: website-ui-redesign
//
// The twinkling circular dots positioned at the intersections (junctions) of
// the Grid_Background lines, distributed across the Viewport (Req 13.2). The
// junctions are aligned to the pure flock geometry via `buildNodeLattice`, which
// places a node every `NODE_STEP_MULTIPLE` (2) grid steps — exactly the grid
// junctions the Agent_Field later patrols between.
//
// Behavior:
//  - Each node twinkles with a continuous opacity-pulse loop whose cycle lasts
//    between 2 and 8 seconds, repeating indefinitely (Req 8.2). The per-node
//    duration/phase is deterministic (seeded by index) so it stays stable across
//    re-renders.
//  - After Flock_Activation the nodes dim to a lower opacity than on the initial
//    Landing_Page (Req 13.4) — driven by the `dimmed` prop.
//  - Under reduced motion the nodes render static (no twinkle) at a fixed
//    resting opacity (Req 13.6).
//
// This is a purely decorative layer: `aria-hidden`, no pointer events, all color
// from Theme_Tokens (no literal hex in markup).

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { buildNodeLattice } from '@/features/landing/flock/geometry';
import { GLASS_GLOW, GRID_STEP, LANDING_ACCENT, tokenVar } from '@/design-system/tokens';

export interface NetworkNodesProps {
  /**
   * When true, the whole node field dims to recede behind the OS_Reveal card
   * after Flock_Activation (Req 13.4). Defaults to false.
   */
  dimmed?: boolean;
  /**
   * When true, render the nodes static with no twinkle (Req 13.6). Typically
   * threaded from framer-motion's `useReducedMotion()` by the LandingPage.
   */
  prefersReducedMotion?: boolean;
  className?: string;
}

/** Diameter of a single Network_Node dot in px. */
const NODE_SIZE_PX = 3;
/** Twinkle cycle bounds in seconds (Req 8.2). */
const TWINKLE_MIN_S = 2;
const TWINKLE_MAX_S = 8;
/** Opacity envelope of the twinkle pulse. */
const TWINKLE_LOW = 0.15;
const TWINKLE_HIGH = 0.85;
/** Static resting opacity used under reduced motion. */
const STATIC_OPACITY = 0.5;
/** Field opacity on the initial Landing_Page vs. dimmed after activation (Req 13.4). */
const FIELD_OPACITY = 0.55;
const FIELD_OPACITY_DIMMED = 0.3;
/** Fallback grid step (px) when the `--grid-step` probe resolves to 0. */
const DEFAULT_STEP_PX = 54;

/**
 * Deterministic pseudo-random value in [0, 1) seeded by a node index and salt.
 * Keeps each node's twinkle timing stable across renders without a stateful RNG.
 */
function seeded(index: number, salt: number): number {
  const x = Math.sin((index + 1) * salt) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Renders the Network_Nodes layer.
 *
 * Measures its own box and the resolved `--grid-step` pixel size, then places a
 * twinkling dot at every grid junction returned by `buildNodeLattice`.
 */
export function NetworkNodes({
  dimmed = false,
  prefersReducedMotion = false,
  className,
}: NetworkNodesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [stepPx, setStepPx] = useState(0);

  // Measure the container and the resolved grid-step (the `--grid-step` token is
  // a clamp() expression, so we resolve it to px via a hidden probe element).
  // Re-measure on window resize so the lattice rebuilds to match the viewport
  // (like the mockup's resize handler).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const measure = () => {
      // Measure the full-bleed container directly. In a real browser this
      // always has a size; we deliberately do NOT substitute the window here so
      // a zero-sized container (e.g. test/SSR) yields an empty lattice rather
      // than a phantom one.
      setSize({ width: el.clientWidth, height: el.clientHeight });
      const probe = probeRef.current;
      const probed = probe ? probe.getBoundingClientRect().width : 0;
      setStepPx(probed > 0 ? probed : DEFAULT_STEP_PX);
    };

    measure();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', measure);
    }
    return () => {
      ro?.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', measure);
      }
    };
  }, []);

  // Junctions every 2 grid steps across the measured viewport (Req 13.2).
  const nodes = useMemo(() => {
    if (stepPx <= 0 || size.width <= 0 || size.height <= 0) return [];
    return buildNodeLattice({ stepPx, width: size.width, height: size.height });
  }, [stepPx, size.width, size.height]);

  const dotColor = tokenVar(LANDING_ACCENT);
  const glow = tokenVar(GLASS_GLOW);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        opacity: dimmed ? FIELD_OPACITY_DIMMED : FIELD_OPACITY,
        transition: 'opacity 600ms ease',
      }}
    >
      {/* Hidden probe resolves the `--grid-step` clamp() to a px width. */}
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

      {nodes.map((node, i) => {
        const baseStyle = {
          position: 'absolute' as const,
          left: node.x,
          top: node.y,
          width: NODE_SIZE_PX,
          height: NODE_SIZE_PX,
          marginLeft: -NODE_SIZE_PX / 2,
          marginTop: -NODE_SIZE_PX / 2,
          borderRadius: '9999px',
          backgroundColor: dotColor,
          boxShadow: `0 0 6px ${glow}`,
        };

        if (prefersReducedMotion) {
          // Static final resting state — no twinkle (Req 13.6).
          return <span key={i} style={{ ...baseStyle, opacity: STATIC_OPACITY }} />;
        }

        const duration = TWINKLE_MIN_S + seeded(i, 12.9898) * (TWINKLE_MAX_S - TWINKLE_MIN_S);
        const delay = seeded(i, 78.233) * duration;

        return (
          <motion.span
            key={i}
            style={baseStyle}
            initial={{ opacity: TWINKLE_LOW }}
            animate={{ opacity: [TWINKLE_LOW, TWINKLE_HIGH, TWINKLE_LOW] }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        );
      })}
    </div>
  );
}

export default NetworkNodes;
