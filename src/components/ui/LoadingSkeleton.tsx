// @vitest-environment jsdom
/**
 * LoadingSkeleton — Frosted glass skeleton block with a continuous pulse animation.
 *
 * Used in tables, charts, and any data-loading sections to indicate content is
 * being fetched. The pulse effect (opacity 0.5 → 1 → 0.5, infinite, 2 s) is
 * implemented with Framer Motion so it integrates naturally with the rest of the
 * motion layer. When the user prefers reduced motion the animation is disabled.
 *
 * Pre-built variants:
 *   - SkeletonCard     — matches StatCard / glass-tile dimensions (full-width, h-28)
 *   - SkeletonTableRow — matches GlassTable row height (full-width, h-12)
 *
 * Preconditions:
 *   - framer-motion is installed (it is, project-wide)
 *   - CSS class glass-tile is defined in src/index.css
 *
 * Postconditions:
 *   - Renders a rounded glass-tile block of the requested size
 *   - Pulses opacity 0.5 → 1 → 0.5 with repeat: Infinity, duration: 2 s
 *   - When prefers-reduced-motion is true, the animation is disabled
 *   - Exposes className, width, and height for arbitrary sizing
 *
 * Requirements: 7.7, 12.1
 */

import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/useReducedMotion"

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoadingSkeletonProps {
  /** Tailwind / custom class for width (e.g. "w-full", "w-48"). Defaults to "w-full". */
  width?: string
  /** Tailwind / custom class for height (e.g. "h-12", "h-28"). Defaults to "h-6". */
  height?: string
  /** Additional class names merged on top of the base skeleton styles. */
  className?: string
  /**
   * Explicit override for the reduced-motion preference.
   * When omitted the value is detected automatically via the useReducedMotion hook.
   */
  prefersReducedMotion?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * LoadingSkeleton — Base skeleton block with glass-tile background and pulse animation.
 *
 * @param width  Tailwind width class (default: "w-full")
 * @param height Tailwind height class (default: "h-6")
 * @param className  Additional classes
 * @param prefersReducedMotion  Override reduced-motion detection
 */
export function LoadingSkeleton({
  width = "w-full",
  height = "h-6",
  className,
  prefersReducedMotion,
}: LoadingSkeletonProps) {
  const hookValue = useReducedMotion()
  const reducedMotion = prefersReducedMotion ?? hookValue ?? false

  return (
    <motion.div
      className={cn(
        "glass-tile rounded-lg",
        width,
        height,
        className
      )}
      aria-hidden="true"
      // Pulse animation: opacity 0.5 → 1 → 0.5, infinite
      animate={reducedMotion ? { opacity: 0.7 } : { opacity: [0.5, 1, 0.5] }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : {
              repeat: Infinity,
              duration: 2,
              ease: "easeInOut",
            }
      }
    />
  )
}

// ── Pre-built variants ───────────────────────────────────────────────────────

/**
 * SkeletonCard — Pre-built skeleton that matches StatCard / glass-tile dimensions.
 * Full-width, h-28, rounded. Accepts the same override props as LoadingSkeleton.
 */
export function SkeletonCard({
  className,
  prefersReducedMotion,
}: Pick<LoadingSkeletonProps, "className" | "prefersReducedMotion">) {
  return (
    <LoadingSkeleton
      width="w-full"
      height="h-28"
      className={className}
      prefersReducedMotion={prefersReducedMotion}
    />
  )
}

/**
 * SkeletonTableRow — Pre-built skeleton that matches GlassTable row height.
 * Full-width, h-12, slightly less rounding to echo table rows.
 */
export function SkeletonTableRow({
  className,
  prefersReducedMotion,
}: Pick<LoadingSkeletonProps, "className" | "prefersReducedMotion">) {
  return (
    <LoadingSkeleton
      width="w-full"
      height="h-12"
      className={cn("rounded-md", className)}
      prefersReducedMotion={prefersReducedMotion}
    />
  )
}

export default LoadingSkeleton
