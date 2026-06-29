import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * GlassButton — Frosted button with hover elevation.
 *
 * Preconditions: variant in ['solid', 'outline'], size in ['sm', 'md', 'lg']
 * Postconditions: renders button with glass styling and keyboard focus ring.
 *
 * - variant="outline" (default) → glass-button class
 * - variant="solid" → glass-button-solid class
 * - disabled → opacity-50, cursor-not-allowed, click prevented
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 10.3, 11.4
 */
export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "solid" | "outline"
  size?: "sm" | "md" | "lg"
}

const variantClasses: Record<NonNullable<GlassButtonProps["variant"]>, string> = {
  solid: "glass-button-solid",
  outline: "glass-button",
}

const sizeClasses: Record<NonNullable<GlassButtonProps["size"]>, string> = {
  // Req 8.9 — minimum touch target 44×44px on mobile.
  // sm: py-1 (8px) + text-sm line-height (20px) = 28px → add min-h-[44px]
  sm: "px-3 py-1 text-sm min-h-[44px]",
  // md: py-2 (16px) + text-base line-height (24px) = 40px → add min-h-[44px]
  md: "px-4 py-2 text-base min-h-[44px]",
  // lg: py-3 (24px) + text-lg line-height (28px) = 52px → already ≥ 44px ✓
  lg: "px-6 py-3 text-lg",
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ variant = "outline", size = "md", className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "rounded-full font-medium focus-visible-ring",
          variantClasses[variant],
          sizeClasses[size],
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        {...props}
      />
    )
  }
)
GlassButton.displayName = "GlassButton"

export { GlassButton }
