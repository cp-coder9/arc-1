/**
 * TableRowAnimated — Table row wrapper with a staggered slide-in entrance.
 *
 * Wraps a `<tr>` with a Framer Motion entrance (slide in from the left while
 * fading in). Rows animate in sequentially using a per-row stagger delay of
 * `index * 0.05s` (50ms per row) so a table body cascades into view rather than
 * appearing all at once.
 *
 * Respects the user's prefers-reduced-motion preference: when
 * `prefersReducedMotion` is true, both the duration and the stagger delay
 * collapse to 0 so the row renders immediately in its final resting state.
 *
 * **Validates: Requirements 7.6, 12.1**
 */

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

import { calculateStaggerDelay } from '@/lib/animation-utils';
import { cn } from '@/lib/utils';

export interface TableRowAnimatedProps {
  /** Cells (`<td>` / `<th>`) rendered inside the animated row. */
  children: ReactNode;
  /** Zero-based row index used to compute the stagger delay. */
  index: number;
  /** Whether the user prefers reduced motion (disables animation). */
  prefersReducedMotion: boolean;
  /** Optional additional class names merged with the glass row styling. */
  className?: string;
}

/**
 * TableRowAnimated — Table row with staggered entrance.
 *
 * Preconditions:
 *   - index is a number (negative/non-finite values are treated as 0)
 *   - prefersReducedMotion is a boolean
 *
 * Postconditions:
 *   - Renders a motion.tr with initial { opacity: 0, x: -20 } animating to
 *     { opacity: 1, x: 0 }
 *   - Entrance delay = index * 0.05s (or 0 when prefersReducedMotion = true)
 *   - Duration = 0.3s (or 0 when prefersReducedMotion = true)
 */
export function TableRowAnimated({
  children,
  index,
  prefersReducedMotion,
  className,
}: TableRowAnimatedProps) {
  return (
    <motion.tr
      className={cn('glass-record rounded-lg', className)}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.3,
        ease: [0.2, 0.8, 0.2, 1],
        delay: prefersReducedMotion ? 0 : calculateStaggerDelay(index),
      }}
    >
      {children}
    </motion.tr>
  );
}

export default TableRowAnimated;
