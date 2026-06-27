/**
 * StatCardAnimated — Stat metric tile with fadeInUp entrance and hover elevation.
 *
 * Self-contained motion component: renders a `glass-tile` surface displaying a
 * label, value, optional icon, and optional trend indicator. Wraps the visual
 * with a Framer Motion entrance animation (fadeInUp) and an interactive hover
 * elevation. All motion respects the user's prefers-reduced-motion preference.
 *
 * Motion behavior:
 *   - Entrance: initial { opacity: 0, y: 20 } → animate { opacity: 1, y: 0 }
 *     using cubic-bezier(0.2, 0.8, 0.2, 1) over 0.4s, plus an optional stagger
 *     `delay` (in seconds) for grid cascades.
 *   - Hover: whileHover { scale: 1.02, y: -4 } — undefined when reduced motion
 *     is preferred (no hover animation).
 *   - When prefers-reduced-motion is true: entrance duration and delay are 0,
 *     and whileHover is undefined.
 *
 * Only GPU-accelerated properties (opacity, transform) are animated to maintain
 * 60fps and avoid layout shift.
 *
 * Requirements: 5.4, 7.5, 12.1
 */

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Trend indicator describing direction and a display value (e.g. "+12%").
 */
export interface StatCardTrend {
  direction: 'up' | 'down';
  value: string;
}

/**
 * Props for StatCardAnimated.
 *
 * Preconditions:
 *   - label is a string, value is string | number
 *   - icon (optional) is a valid React node
 *   - trend (optional) has direction 'up' | 'down' and a display value
 *   - delay (optional, seconds) >= 0 applied to the entrance animation
 *   - prefersReducedMotion (optional) overrides the internal hook detection
 *
 * Postconditions:
 *   - renders a glass-tile surface with the metric content
 *   - applies fadeInUp entrance and hover elevation honoring reduced motion
 */
export interface StatCardAnimatedProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: StatCardTrend;
  onClick?: () => void;
  /** Stagger delay for the entrance animation, in seconds. Defaults to 0. */
  delay?: number;
  /**
   * Optional explicit reduced-motion preference. When omitted, the component
   * detects it internally via the useReducedMotion hook.
   */
  prefersReducedMotion?: boolean;
  className?: string;
}

const ENTRANCE_EASING = [0.2, 0.8, 0.2, 1] as const;

export function StatCardAnimated({
  label,
  value,
  icon,
  trend,
  onClick,
  delay = 0,
  prefersReducedMotion,
  className,
}: StatCardAnimatedProps) {
  // Detect reduced-motion internally; an explicit prop always takes precedence.
  const detected = useReducedMotion();
  const reducedMotion = prefersReducedMotion ?? detected ?? false;

  const interactive = typeof onClick === 'function';

  return (
    <motion.div
      className={cn(
        'glass-tile rounded-lg p-6 flex flex-col gap-3',
        interactive && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.4,
        ease: ENTRANCE_EASING,
        delay: reducedMotion ? 0 : delay,
      }}
      whileHover={reducedMotion ? undefined : { scale: 1.02, y: -4 }}
    >
      <div className="flex items-start justify-between">
        {icon && <div className="glass-icon-box text-primary">{icon}</div>}
        {trend && (
          <div
            className={cn(
              'glass-pill text-xs',
              trend.direction === 'up' ? 'text-green-400' : 'text-red-400',
            )}
          >
            {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
          </div>
        )}
      </div>
      <div>
        <p className="text-sm text-foreground-muted">{label}</p>
        <p className="text-2xl font-black text-foreground mt-1">{value}</p>
      </div>
    </motion.div>
  );
}

export default StatCardAnimated;
