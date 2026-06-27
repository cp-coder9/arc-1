import * as React from "react"
import { cn } from "@/lib/utils"
import { GlassIconBox } from "@/components/ui/GlassIconBox"

/**
 * DashboardSection — Glass panel container for a dashboard subsection.
 *
 * Composes a header row (title + optional icon and description) with an
 * optional right-aligned action element, and wraps child content in a
 * `glass-panel` surface.
 *
 * Preconditions:
 *   - `title` is a non-empty string (required)
 *   - `children` is valid React content
 *   - `icon` is an optional React node (typically a lucide-react icon)
 *   - `action` is an optional React node rendered at the right of the header
 *   - `description` is an optional subtitle string
 * Postconditions:
 *   - renders a <section> with a flex header row (items-center, justify-between)
 *   - title rendered as <h2> with font-heading and font-bold (Req 11.1)
 *   - icon wrapped in <GlassIconBox> when provided (Req 4.2)
 *   - description rendered as muted <p> below title when provided
 *   - action element rendered at header right when provided (Req 4.2)
 *   - children wrapped in glass-panel rounded container (Req 4.1)
 *
 * Requirements: 4.1, 4.2, 11.1, 11.2
 */
export interface DashboardSectionProps {
  /** Section heading — rendered as h2 with font-heading font-bold. */
  title: string
  /** Optional subtitle rendered below the heading in muted text. */
  description?: string
  /** Optional icon rendered inside a glass-icon-box to the left of the title. */
  icon?: React.ReactNode
  /** Section body content — wrapped in glass-panel. */
  children: React.ReactNode
  /** Optional element (e.g. a button) rendered at the right side of the header. */
  action?: React.ReactNode
  /** Additional classes merged onto the outer <section>. */
  className?: string
}

export function DashboardSection({
  title,
  description,
  icon,
  children,
  action,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      {/* Header row: title+icon area on the left, optional action on the right */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon && (
            <GlassIconBox className="text-lg shrink-0">
              {icon}
            </GlassIconBox>
          )}
          <div>
            <h2 className="text-xl font-heading font-bold text-foreground">
              {title}
            </h2>
            {description && (
              <p className="text-sm text-foreground/60 mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* Glass-wrapped content area */}
      <div className="glass-panel rounded-2xl p-6">
        {children}
      </div>
    </section>
  )
}

export default DashboardSection
