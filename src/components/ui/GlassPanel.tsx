import { cn } from "@/lib/utils"
import { forwardRef, type HTMLAttributes, type ReactNode } from "react"

/**
 * GlassPanel — Frosted glass container for larger dashboard sections.
 *
 * Similar to GlassCard but uses the `glass-panel` material (stronger blur,
 * deeper shadow) intended for grouping substantial blocks of content.
 *
 * Preconditions:
 *   - children is valid React content (optional)
 *   - optional `title` is a non-empty string when provided
 * Postconditions:
 *   - renders a semantic <section> with `glass-panel` styling
 *   - when `title` is provided, renders an <h2> with font-heading above the content
 *   - `className` is merged onto the section for consumer overrides
 *
 * Requirements: 3.8, 3.9, 11.1, 11.2
 */
export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  /** Optional heading rendered as an h2 (font-heading) above the content. */
  title?: string
  children?: ReactNode
}

export const GlassPanel = forwardRef<HTMLElement, GlassPanelProps>(
  ({ className, title, children, ...props }, ref) => (
    <section
      ref={ref}
      className={cn("rounded-2xl p-8 glass-panel", className)}
      {...props}
    >
      {title && (
        <h2 className="text-xl font-heading font-bold text-foreground mb-4">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
)
GlassPanel.displayName = "GlassPanel"

export default GlassPanel
