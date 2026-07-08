import * as React from "react"
import { BarChart3, Loader2, Inbox } from "lucide-react"
import { apiFetch } from "@/lib/apiClient"
import type { FeedbackCategory, FeedbackCluster } from "@/services/feedbackTypes"

/**
 * FeedbackTrendChart — Trend chart showing feedback volume by category over 30 days.
 *
 * Renders a simple bar chart using div elements with Tailwind (no external chart library).
 * Shows a legend with category colors and fetches data from the clusters endpoint.
 * Displays an empty state when no data is available.
 *
 * Requirements: 4.8
 */

export interface FeedbackTrendChartProps {
  // No props needed — fetches its own data
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayData {
  date: string;  // YYYY-MM-DD
  bug: number;
  feature_request: number;
  usability: number;
  praise: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<FeedbackCategory, string> = {
  bug: "#ef4444",              // red-500
  feature_request: "#14b8a6",  // teal-500
  usability: "#f59e0b",        // amber-500
  praise: "#22c55e",           // green-500
}

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  feature_request: "Feature Request",
  usability: "Usability",
  praise: "Praise",
}

const CATEGORIES: FeedbackCategory[] = ["bug", "feature_request", "usability", "praise"]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLast30Days(): string[] {
  const days: string[] = []
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split("T")[0])
  }
  return days
}

function groupClustersByDay(clusters: FeedbackCluster[]): DayData[] {
  const days = getLast30Days()
  const dayMap = new Map<string, DayData>()

  for (const day of days) {
    dayMap.set(day, { date: day, bug: 0, feature_request: 0, usability: 0, praise: 0 })
  }

  for (const cluster of clusters) {
    const createdDay = cluster.createdAt?.split("T")[0]
    if (createdDay && dayMap.has(createdDay)) {
      const entry = dayMap.get(createdDay)!
      const category = cluster.category as FeedbackCategory
      if (category in entry) {
        entry[category] += cluster.occurrenceCount
      }
    }
  }

  return days.map((day) => dayMap.get(day)!)
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FeedbackTrendChart() {
  const [dayData, setDayData] = React.useState<DayData[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        params.set("pageSize", "500")  // Fetch enough clusters for 30-day trend

        const response = await apiFetch(`/api/feedback/clusters?${params.toString()}`)

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || `Failed to load trend data (${response.status})`)
        }

        const data = await response.json()
        const clusters: FeedbackCluster[] = data.clusters ?? []

        if (!cancelled) {
          setDayData(groupClustersByDay(clusters))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load trend data")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [])

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--muted)" }} />
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading trend data...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>
      </div>
    )
  }

  // Check if there is any data
  const hasData = dayData.some((d) => d.bug + d.feature_request + d.usability + d.praise > 0)

  // Empty state
  if (!hasData) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16" style={{ borderColor: "var(--border)" }}>
        <Inbox className="h-10 w-10" style={{ color: "var(--muted)", opacity: 0.4 }} />
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No feedback data available for the last 30 days.
        </p>
      </div>
    )
  }

  // Compute max value for scaling
  const maxValue = Math.max(
    ...dayData.map((d) => d.bug + d.feature_request + d.usability + d.praise),
    1
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} style={{ color: "var(--teal)" }} />
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--ink)" }}
          >
            Feedback Volume — Last 30 Days
          </h3>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {CATEGORIES.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: CATEGORY_COLORS[cat] }}
            />
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {CATEGORY_LABELS[cat]}
            </span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div
        className="flex items-end gap-px overflow-x-auto pb-2"
        style={{ minHeight: 180 }}
        role="img"
        aria-label="Stacked bar chart showing feedback volume by category over the last 30 days"
      >
        {dayData.map((day, idx) => {
          const total = day.bug + day.feature_request + day.usability + day.praise
          const heightPct = total > 0 ? (total / maxValue) * 100 : 0

          return (
            <div
              key={day.date}
              className="flex flex-col items-center flex-1 min-w-[12px]"
              title={`${formatDateLabel(day.date)}: ${total} total (Bug: ${day.bug}, Feature: ${day.feature_request}, Usability: ${day.usability}, Praise: ${day.praise})`}
            >
              {/* Stacked bar */}
              <div
                className="w-full flex flex-col-reverse rounded-t-sm overflow-hidden"
                style={{ height: `${Math.max(heightPct, total > 0 ? 4 : 0)}%`, minHeight: total > 0 ? 4 : 0 }}
              >
                {day.bug > 0 && (
                  <div
                    style={{
                      backgroundColor: CATEGORY_COLORS.bug,
                      height: `${(day.bug / total) * 100}%`,
                      minHeight: 2,
                    }}
                  />
                )}
                {day.feature_request > 0 && (
                  <div
                    style={{
                      backgroundColor: CATEGORY_COLORS.feature_request,
                      height: `${(day.feature_request / total) * 100}%`,
                      minHeight: 2,
                    }}
                  />
                )}
                {day.usability > 0 && (
                  <div
                    style={{
                      backgroundColor: CATEGORY_COLORS.usability,
                      height: `${(day.usability / total) * 100}%`,
                      minHeight: 2,
                    }}
                  />
                )}
                {day.praise > 0 && (
                  <div
                    style={{
                      backgroundColor: CATEGORY_COLORS.praise,
                      height: `${(day.praise / total) * 100}%`,
                      minHeight: 2,
                    }}
                  />
                )}
              </div>

              {/* Date label (show every 5th day) */}
              {(idx % 5 === 0 || idx === dayData.length - 1) && (
                <span
                  className="mt-1.5 text-[9px] whitespace-nowrap"
                  style={{ color: "var(--muted)" }}
                >
                  {formatDateLabel(day.date)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FeedbackTrendChart
