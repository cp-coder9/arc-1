/**
 * WingmanBird — Origami bird SVG component with framer-motion animations.
 *
 * Animation states: idle, thinking, working, success, waiting.
 * Context-aware: reviewing drawings, preparing reports, checking compliance,
 * searching project info, generating brief.
 *
 * Subtle, elegant, fast animations — no cartoon styling.
 * Reinforces the origami identity.
 *
 * @requirements Wingman brand identity — design spec
 */

import { motion, type Variants } from 'framer-motion';

export type BirdState = 'idle' | 'thinking' | 'working' | 'success' | 'waiting';

interface WingmanBirdProps {
  state?: BirdState;
  size?: number;
  className?: string;
}

const birdVariants: Variants = {
  idle: {
    scale: [1, 1.02, 1],
    rotate: [0, 0.5, 0],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  },
  thinking: {
    rotate: [0, -8, 0, 8, 0],
    y: [0, -2, 0],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
  },
  working: {
    y: [0, -3, 0, -3, 0],
    rotate: [0, -2, 0, 2, 0],
    transition: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' },
  },
  success: {
    scale: [1, 1.1, 1],
    rotate: [0, -5, 5, 0],
    transition: { duration: 0.8, ease: 'easeOut' },
  },
  waiting: {
    opacity: [1, 0.7, 1],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
};

/**
 * Origami bird SVG — a clean geometric bird shape built from triangular facets.
 */
function OrigamiBirdSVG({ size = 40 }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Body */}
      <polygon
        points="8,28 20,14 32,28"
        fill="var(--mint)"
        stroke="var(--deep)"
        strokeWidth="0.8"
      />
      {/* Wing (left) */}
      <polygon
        points="8,28 2,20 20,14"
        fill="var(--aqua)"
        stroke="var(--deep)"
        strokeWidth="0.6"
      />
      {/* Wing (right) */}
      <polygon
        points="32,28 38,20 20,14"
        fill="var(--aqua)"
        stroke="var(--deep)"
        strokeWidth="0.6"
      />
      {/* Head */}
      <polygon
        points="20,14 17,8 23,8"
        fill="var(--teal)"
        stroke="var(--deep)"
        strokeWidth="0.6"
      />
      {/* Beak */}
      <polygon
        points="20,6 19,8 21,8"
        fill="var(--deep)"
      />
      {/* Tail */}
      <polygon
        points="18,28 20,34 22,28"
        fill="var(--jade)"
        stroke="var(--deep)"
        strokeWidth="0.5"
      />
      {/* Eye */}
      <circle cx="20" cy="10" r="1" fill="var(--ink)" />
    </svg>
  );
}

export default function WingmanBird({ state = 'idle', size = 40, className }: WingmanBirdProps) {
  return (
    <motion.div
      className={className}
      variants={birdVariants}
      animate={state}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <OrigamiBirdSVG size={size} />
    </motion.div>
  );
}
