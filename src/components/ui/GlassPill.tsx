import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * GlassPill — Small rounded pill-shaped glass container / badge.
 *
 * Preconditions:
 *   - children is valid React content (optional)
 *   - optional `className` for consumer overrides
 * Postconditions:
 *   - renders a <span> with the `glass-pill` material (rounded-full, frosted bg)
 *   - forwards all native span props (including aria-* attributes)
 *   - when `as="button"` semantics are needed, consumers pass role/onClick and
 *     the pill exposes a keyboard-focusable, accessible control
 *
 * Requirements: 2.10, 3.11
 */
export interface GlassPillProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode
}

export const GlassPill = React.forwardRef<HTMLSpanElement, GlassPillProps>(
  function GlassPill({ className, children, onClick, role, tabIndex, ...props }, ref) {
    const isInteractive = typeof onClick === "function"

    const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (!isInteractive) return
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        // Synthesize a click for keyboard activation (Req 3.11).
        ;(event.currentTarget as HTMLSpanElement).click()
      }
      props.onKeyDown?.(event)
    }

    return (
      <span
        ref={ref}
        className={cn(
          "glass-pill",
          isInteractive &&
            "cursor-pointer focus-visible-ring focus:outline-none",
          className
        )}
        onClick={onClick}
        onKeyDown={isInteractive ? handleKeyDown : props.onKeyDown}
        role={role ?? (isInteractive ? "button" : undefined)}
        tabIndex={tabIndex ?? (isInteractive ? 0 : undefined)}
        {...props}
      >
        {children}
      </span>
    )
  }
)
GlassPill.displayName = "GlassPill"

export default GlassPill
