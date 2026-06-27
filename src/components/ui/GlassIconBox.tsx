import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * GlassIconBox — Square (icon) container with frosted glass styling.
 *
 * Typically wraps a single lucide-react icon to give it a consistent,
 * tinted glass surface inside dashboard sections and stat tiles.
 *
 * Preconditions:
 *   - children is valid React content (usually an icon)
 *   - optional `className` for consumer overrides
 * Postconditions:
 *   - renders a <div> with the `glass-icon-box` material
 *   - decorative by default: marked aria-hidden unless an `aria-label` is given,
 *     in which case it is exposed with role="img" for assistive tech (Req 3.11)
 *   - forwards all native div props
 *
 * Requirements: 2.10, 3.11
 */
export interface GlassIconBoxProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

export const GlassIconBox = React.forwardRef<HTMLDivElement, GlassIconBoxProps>(
  function GlassIconBox(
    { className, children, "aria-label": ariaLabel, ...props },
    ref
  ) {
    const hasLabel = typeof ariaLabel === "string" && ariaLabel.length > 0

    return (
      <div
        ref={ref}
        className={cn("glass-icon-box", className)}
        aria-label={hasLabel ? ariaLabel : undefined}
        role={hasLabel ? "img" : undefined}
        aria-hidden={hasLabel ? undefined : true}
        {...props}
      >
        {children}
      </div>
    )
  }
)
GlassIconBox.displayName = "GlassIconBox"

export default GlassIconBox
