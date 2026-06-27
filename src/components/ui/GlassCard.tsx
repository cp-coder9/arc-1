import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * GlassCard — Reusable frosted card wrapper.
 *
 * Preconditions: children is valid React node, optional className for overrides.
 * Postconditions: renders glass-card surface with proper stacking context and
 * accessibility hooks. When onClick is provided the card becomes an interactive,
 * keyboard-navigable control with a visible focus ring.
 *
 * Requirements: 3.8, 3.9, 10.3
 */
export interface GlassCardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  role?: string
  "aria-label"?: string
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard(
    { children, className, onClick, role, "aria-label": ariaLabel },
    ref
  ) {
    const isInteractive = typeof onClick === "function"

    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onClick) return
      // Prevent the click from bubbling to parent handlers (Req 3.9).
      event.stopPropagation()
      onClick()
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onClick) return
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          "glass-card rounded-lg p-6",
          isInteractive &&
            "cursor-pointer focus-visible-ring focus:outline-none",
          className
        )}
        onClick={isInteractive ? handleClick : undefined}
        onKeyDown={isInteractive ? handleKeyDown : undefined}
        role={role ?? (isInteractive ? "button" : undefined)}
        tabIndex={isInteractive ? 0 : undefined}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    )
  }
)
