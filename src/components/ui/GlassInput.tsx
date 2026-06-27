import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * GlassInput — Frosted input primitive with glass styling and focus state.
 *
 * Preconditions:
 *   - `type` is a valid HTML input type (defaults to browser default "text")
 * Postconditions:
 *   - renders an <input> with the `glass-input` class (backdrop blur + frosted bg)
 *   - on focus, the `.glass-input:focus-within` rule shifts the border colour to
 *     var(--ring) and applies a ring box-shadow (Req 3.6)
 *   - keyboard accessible: a native <input> is in the natural Tab order (Req 10.1–10.3)
 *   - supports placeholder, type, value, disabled and all native input props (Req 3.5)
 *
 * Requirements: 3.5, 3.6, 3.7, 10.1, 10.2, 10.3
 */
function GlassInput({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "glass-input w-full rounded-lg px-4 py-2 text-base text-foreground",
        // Req 8.9 — minimum 44px touch target: py-2 (16px) + text-base lh (24px) = 40px
        // → min-h-[44px] closes the 4px gap.
        "min-h-[44px]",
        "placeholder:text-muted-foreground",
        // focus-visible-ring provides the keyboard focus outline; glass-input
        // :focus-within supplies the border-color shift + ring shadow.
        "focus-visible-ring focus:outline-none",
        // disabled state: visually muted and non-interactive.
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { GlassInput }
