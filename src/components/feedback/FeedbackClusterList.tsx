import * as React from "react"
import { Filter, ChevronLeft, ChevronRight, Loader2, Inbox } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/apiClient"
import type { FeedbackCategory, FeedbackCluster, FeedbackStatus } from "@/services/feedbackTypes"

/**
 * FeedbackClusterList — Displays paginated, filterable feedback clusters.
 *
 * Fetches from GET /api/feedback/clusters with query params for page and filters.
 * Clusters are displayed sorted by severity descending (server-side).
 * Includes category, date range, and status filters.
 *
 * Renders inside the FeedbackRoadmapDashboard "Clusters" tab.
 *
 * Requirements: 4.2, 4.3, 4.9
 */

export interface FeedbackClusterListProps {
  onSelectCluster: (clusterId: string) => void;
}

// ─── Filter Types ────────────────────────────────────────────────────────────

interface ClusterFilters {
  category: FeedbackCategory | null;
  status: FeedbackStatus | null;
  dateFrom: string;  // ISO date string (YYYY-MM-DD)
  dateTo: string;    // ISO date string (YYYY-MM-DD)
}

interface ClustersResponse {
  clusters: FeedbackCluster[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 25
const MAX_DATE_RANGE_DAYS = 365
const DEFAULT_DATE_RANGE_DAYS = 30

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature Request" },
  { value: "usability", label: "Usability" },
  { value: "praise", label: "Praise" },
]

const STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: "received", label: "Received" },
  { value: "reviewing", label: "Reviewing" },
  { value: "planned", label: "Planned" },
  { value: "shipped", label: "Shipped" },
  { value: "declined", label: "Declined" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDefaultDateFrom(): string {
  const date = new Date()
  date.setDate(date.getDate() - DEFAULT_DATE_RANGE_DAYS)
  return date.toISOString().split("T")[0]
}

function getToday(): string {
  return new Date().toISOString().split("T")[0]
}

function getMinDate(): string {
  const date = new Date()
  date.setDate(date.getDate() - MAX_DATE_RANGE_DAYS)
  return date.toISOString().split("T")[0]
}

/** Returns Tailwind classes for severity color coding. */
function getSeverityClasses(score: number): string {
  if (score >= 8) return "border-red-300 bg-red-100 text-red-800 dark:border-red-600 dark:bg-red-900/30 dark:text-red-300"
  if (score >= 5) return "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
  return "border-green-300 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900/30 dark:text-green-300"
}

/** Returns Tailwind classes for status badge. */
function getStatusClasses(status: FeedbackStatus): string {
  switch (status) {
    case "received":
      return ""
    case "reviewing":
      return "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
    case "planned":
      return "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
    case "shipped":
      return "border-green-300 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900/30 dark:text-green-300"
    case "declined":
      return "border-red-300 bg-red-100 text-red-800 dark:border-red-600 dark:bg-red-900/30 dark:text-red-300"
    default:
      return ""
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FeedbackClusterList({ onSelectCluster }: FeedbackClusterListProps) {
  const [clusters, setClusters] = React.useState<FeedbackCluster[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = React.useState(false)

  const [filters, setFilters] = React.useState<ClusterFilters>({
    category: null,
    status: null,
    dateFrom: getDefaultDateFrom(),
    dateTo: getToday(),
  })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Fetch clusters when page or filters change
  React.useEffect(() => {
    let cancelled = false

    async function fetchClusters() {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        params.set("page", String(page))
        params.set("pageSize", String(PAGE_SIZE))
        if (filters.category) params.set("category", filters.category)
        if (filters.status) params.set("status", filters.status)
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
        if (filters.dateTo) params.set("dateTo", filters.dateTo)

        const response = await apiFetch(`/api/feedback/clusters?${params.toString()}`)

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || `Failed to load clusters (${response.status})`)
        }

        const data: ClustersResponse = await response.json()
        if (!cancelled) {
          setClusters(data.clusters ?? [])
          setTotal(data.total ?? 0)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load clusters")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchClusters()
    return () => { cancelled = true }
  }, [page, filters])

  const handleFilterChange = (key: keyof ClusterFilters, value: string | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)  // Reset to first page on filter change
  }

  const handleClearFilters = () => {
    setFilters({
      category: null,
      status: null,
      dateFrom: getDefaultDateFrom(),
      dateTo: getToday(),
    })
    setPage(1)
  }

  const hasActiveFilters = filters.category !== null || filters.status !== null

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading clusters...</p>
      </div>
    )
  }

  // ─── Error State ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => setPage(page)}>
          Retry
        </Button>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setFiltersOpen((prev) => !prev)}
          aria-expanded={filtersOpen}
          aria-controls="cluster-filters"
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {(filters.category ? 1 : 0) + (filters.status ? 1 : 0)}
            </span>
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Expanded filter panel */}
      {filtersOpen && (
        <div
          id="cluster-filters"
          className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* Category filter */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-category" className="text-xs font-medium text-muted-foreground">
              Category
            </label>
            <select
              id="filter-category"
              value={filters.category ?? ""}
              onChange={(e) => handleFilterChange("category", e.target.value || null)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">All categories</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-status" className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <select
              id="filter-status"
              value={filters.status ?? ""}
              onChange={(e) => handleFilterChange("status", e.target.value || null)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-date-from" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <input
              id="filter-date-from"
              type="date"
              value={filters.dateFrom}
              min={getMinDate()}
              max={filters.dateTo || getToday()}
              onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            />
          </div>

          {/* Date to */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-date-to" className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <input
              id="filter-date-to"
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || getMinDate()}
              max={getToday()}
              onChange={(e) => handleFilterChange("dateTo", e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {clusters.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No clusters match the active filters.</p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={handleClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Cluster table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Title
                  </th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Occurrences
                  </th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Users
                  </th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Sentiment
                  </th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Severity
                  </th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {clusters.map((cluster) => (
                  <tr
                    key={cluster.id}
                    className="border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => onSelectCluster(cluster.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onSelectCluster(cluster.id)
                      }
                    }}
                    aria-label={`Cluster: ${cluster.title}, severity ${cluster.severityScore}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground max-w-[280px] truncate">
                      {cluster.title}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground tabular-nums">
                      {cluster.occurrenceCount}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground tabular-nums">
                      {cluster.distinctUserCount}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground capitalize">
                      {cluster.averageSentiment}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant="outline"
                        className={`text-xs px-2 py-0.5 ${getSeverityClasses(cluster.severityScore)}`}
                      >
                        {cluster.severityScore}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 capitalize ${getStatusClasses(cluster.status)}`}
                      >
                        {cluster.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} clusters
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default FeedbackClusterList
