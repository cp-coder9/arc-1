import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * StatCard — Individual metric display tile with optional icon and trend indicator.
 *
 * Preconditions:
 *   - label is a non-empty string
 *   - value is a string or number
 *   - icon is an optional React node (e.g. lucide-react icon)
 *   - trend.direction is 'up' | 'down', trend.value is a display string
 *
 * Postconditions:
 *   - renders with glass-tile class (hover: scale + translateY via CSS, not inline style)
 *   - label renders as text-sm text-foreground-muted
 *   - value renders as text-2xl font-black
 *   - trend indicator shows ↑ green for up, ↓ red for down
 *   - onClick makes the tile keyboard-navigable
 *
 * Requirements: 4.3, 4.4
 */
export interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  trend?: { direction: "up" | "down"; value: string }
  onClick?: () => void
  className?: string
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  onClick,
  className,
}: StatCardProps) {
  const isInteractive = typeof onClick === "function"

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={cn(
        "glass-tile rounded-xl p-5 flex flex-col gap-3",
        isInteractive && "cursor-pointer focus-visible-ring focus:outline-none",
        className
      )}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {/* Top row: icon (left) + trend pill (right) */}
      <div className="flex items-start justify-between">
        {icon ? (
          <div className="glass-icon-box text-primary">{icon}</div>
        ) : (
          /* placeholder to keep trend aligned right when no icon */
          <span />
        )}

        {trend && (
          <div
            className={cn(
              "glass-pill text-xs font-semibold px-2 py-0.5 rounded-full",
              trend.direction === "up" ? "text-green-400" : "text-red-400"
            )}
            aria-label={
              trend.direction === "up"
                ? `Trending up ${trend.value}`
                : `Trending down ${trend.value}`
            }
          >
            {trend.direction === "up" ? "↑" : "↓"} {trend.value}
          </div>
        )}
      </div>

      {/* Label + value */}
      <div>
        <p className="text-sm text-foreground-muted">{label}</p>
        <p className="text-2xl font-black text-foreground mt-1">{value}</p>
      </div>
    </div>
  )
}
