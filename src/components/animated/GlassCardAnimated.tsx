import * as React from "react"
import { motion, type TargetAndTransition, type Transition } from "framer-motion"

import { GlassCard, type GlassCardProps } from "@/components/ui/GlassCard"
import { fadeInUp } from "@/features/landing/animations"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { withReducedMotion } from "@/lib/animation-utils"

/**
 * GlassCardAnimated — GlassCard with a Framer Motion entrance.
 *
 * Wraps {@link GlassCard} in a `motion.div` that plays the shared `fadeInUp`
 * entrance preset on mount. A `delay` prop allows callers to stagger a grid or
 * list of cards (e.g. `index * 0.05`). The entrance always honours the user's
 * prefers-reduced-motion preference: when reduced motion is preferred the
 * card renders instantly in its final state (duration and delay collapse to 0).
 *
 * Preconditions:
 *   - children is a valid React node (forwarded to GlassCard)
 *   - delay is a non-negative number of seconds (defaults to 0)
 *   - prefersReducedMotion, when provided, overrides the hook-detected value
 *
 * Postconditions:
 *   - Renders GlassCard wrapped in an animated container
 *   - Entrance animates opacity 0 → 1 and y 20 → 0 via fadeInUp
 *   - Applies the supplied delay before the entrance begins
 *   - When reduced motion is preferred, duration and delay are 0
 *
 * Requirements: 7.4, 7.7, 12.1
 */
export interface GlassCardAnimatedProps extends GlassCardProps {
  /** Entrance delay in seconds, used to stagger cards. Defaults to 0. */
  delay?: number
  /**
   * Explicit reduced-motion override. When omitted, the value is read from
   * the `useReducedMotion` hook.
   */
  prefersReducedMotion?: boolean
}

export const GlassCardAnimated = React.forwardRef<
  HTMLDivElement,
  GlassCardAnimatedProps
>(function GlassCardAnimated(
  { delay = 0, prefersReducedMotion, ...glassCardProps },
  ref
) {
  const hookPrefersReducedMotion = useReducedMotion()
  // Prop override wins; fall back to the hook, defaulting to false while the
  // hook is still initialising (null).
  const reducedMotion =
    prefersReducedMotion ?? hookPrefersReducedMotion ?? false

  const preset = fadeInUp(reducedMotion)
  const initial = preset.initial as TargetAndTransition
  const animate = preset.animate as TargetAndTransition

  const transition = withReducedMotion(
    { ...(preset.transition as Transition), delay },
    reducedMotion
  )

  return (
    <motion.div initial={initial} animate={animate} transition={transition}>
      <GlassCard ref={ref} {...glassCardProps} />
    </motion.div>
  )
})
