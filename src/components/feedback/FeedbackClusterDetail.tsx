import * as React from "react"
import { ArrowLeft, ChevronRight, ChevronLeft, Loader2, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch } from "@/lib/apiClient"
import type { FeedbackCluster, FeedbackSubmission, FeedbackStatus } from "@/services/feedbackTypes"
import { VALID_STATUS_TRANSITIONS } from "@/services/feedbackTypes"
import {
  validateStatusTransition,
  validateActionDescription,
  validateDeclineReason,
} from "@/services/feedbackValidation"

/**
 * FeedbackClusterDetail — Shows detailed cluster info with status transition controls.
 *
 * Displays all submissions within the selected cluster (paginated 50/page,
 * sorted by timestamp desc) along with Context_Snapshots, timestamps, and user roles.
 *
 * Implements status transition controls with validation:
 * - Action description required (≥10 chars) for all transitions
 * - Decline reason required (≥20 chars) for decline transitions
 * - Validates transitions follow the state machine before persisting
 * - Submits via PATCH /api/feedback/clusters/:id/status
 *
 * Requirements: 4.4, 4.6, 5.8
 */

export interface FeedbackClusterDetailProps {
  clusterId: string;
  onBack: () => void;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClusterDetailResponse {
  cluster: FeedbackCluster;
  submissions: FeedbackSubmission[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

/** Status flow: received → reviewing → planned → shipped, with declined branch */
const STATUS_FLOW: FeedbackStatus[] = ["received", "reviewing", "planned", "shipped"]
const DECLINED_STATUS: FeedbackStatus = "declined"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatusColor(status: FeedbackStatus): string {
  switch (status) {
    case "received":
      return "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-900/30 dark:text-slate-300"
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

function formatTimestamp(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    return d.toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return isoDate
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FeedbackClusterDetail({ clusterId, onBack }: FeedbackClusterDetailProps) {
  // State
  const [cluster, setCluster] = React.useState<FeedbackCluster | null>(null)
  const [submissions, setSubmissions] = React.useState<FeedbackSubmission[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Transition state
  const [actionDescription, setActionDescription] = React.useState("")
  const [declineReason, setDeclineReason] = React.useState("")
  const [transitionError, setTransitionError] = React.useState<string | null>(null)
  const [transitioning, setTransitioning] = React.useState(false)
  const [transitionSuccess, setTransitionSuccess] = React.useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ─── Fetch cluster detail ──────────────────────────────────────────────────

  const fetchDetail = React.useCallback(async (pageNum: number) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set("page", String(pageNum))
      params.set("pageSize", String(PAGE_SIZE))

      const response = await apiFetch(`/api/feedback/clusters/${clusterId}?${params.toString()}`)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Failed to load cluster detail (${response.status})`)
      }

      const data: ClusterDetailResponse = await response.json()
      setCluster(data.cluster)
      setSubmissions(data.submissions ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cluster detail")
    } finally {
      setLoading(false)
    }
  }, [clusterId])

  React.useEffect(() => {
    fetchDetail(page)
  }, [fetchDetail, page])

  // ─── Status Transition ─────────────────────────────────────────────────────

  const handleTransition = async (targetStatus: FeedbackStatus) => {
    if (!cluster) return

    setTransitionError(null)
    setTransitionSuccess(null)

    // Validate transition via state machine
    const transitionResult = validateStatusTransition(cluster.status, targetStatus)
    if (!transitionResult.valid) {
      setTransitionError(transitionResult.error ?? "Invalid status transition")
      return
    }

    // Validate action description
    const descResult = validateActionDescription(actionDescription)
    if (!descResult.valid) {
      setTransitionError(descResult.error ?? "Action description is required (≥10 characters)")
      return
    }

    // Validate decline reason if declining
    if (targetStatus === "declined") {
      const declineResult = validateDeclineReason(declineReason)
      if (!declineResult.valid) {
        setTransitionError(declineResult.error ?? "Decline reason is required (≥20 characters)")
        return
      }
    }

    setTransitioning(true)

    try {
      const body: Record<string, string> = {
        status: targetStatus,
        actionDescription,
      }
      if (targetStatus === "declined") {
        body.declineReason = declineReason
      }

      const response = await apiFetch(`/api/feedback/clusters/${clusterId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Failed to update status (${response.status})`)
      }

      // Update local state
      setCluster((prev) => prev ? { ...prev, status: targetStatus } : prev)
      setTransitionSuccess(`Status updated to "${targetStatus}" successfully.`)
      setActionDescription("")
      setDeclineReason("")
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setTransitioning(false)
    }
  }

  // ─── Get available transitions ─────────────────────────────────────────────

  const availableTransitions: FeedbackStatus[] = cluster
    ? [...VALID_STATUS_TRANSITIONS[cluster.status]]
    : []

  const isDeclineAvailable = availableTransitions.includes("declined")
  const forwardTransitions = availableTransitions.filter((s) => s !== "declined")

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading && !cluster) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading cluster detail...</p>
      </div>
    )
  }

  // ─── Error ─────────────────────────────────────────────────────────────────

  if (error && !cluster) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-destructive">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchDetail(page)}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!cluster) return null

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Back button + cluster header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back to Clusters
        </Button>
      </div>

      {/* Cluster info panel */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold text-foreground">{cluster.title}</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{cluster.occurrenceCount} occurrences</span>
              <span>·</span>
              <span>{cluster.distinctUserCount} users</span>
              <span>·</span>
              <span className="capitalize">{cluster.averageSentiment} sentiment</span>
              <span>·</span>
              <span>Severity: {cluster.severityScore}/10</span>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`capitalize text-xs px-2.5 py-1 ${getStatusColor(cluster.status)}`}
          >
            {cluster.status}
          </Badge>
        </div>

        {/* Status Flow Visualization */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Status Flow
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FLOW.map((status, idx) => (
              <React.Fragment key={status}>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-2 py-0.5 capitalize ${
                    cluster.status === status
                      ? getStatusColor(status) + " ring-2 ring-offset-1 ring-primary/30"
                      : "text-muted-foreground"
                  }`}
                >
                  {status}
                </Badge>
                {idx < STATUS_FLOW.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                )}
              </React.Fragment>
            ))}
            <span className="mx-1 text-muted-foreground/50">|</span>
            <Badge
              variant="outline"
              className={`text-[10px] px-2 py-0.5 capitalize ${
                cluster.status === DECLINED_STATUS
                  ? getStatusColor(DECLINED_STATUS) + " ring-2 ring-offset-1 ring-primary/30"
                  : "text-muted-foreground"
              }`}
            >
              declined
            </Badge>
          </div>
        </div>
      </div>

      {/* Status Transition Controls */}
      {availableTransitions.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Transition Status</h3>

          {/* Action description */}
          <div className="flex flex-col gap-1.5 mb-3">
            <label htmlFor="action-description" className="text-xs font-medium text-muted-foreground">
              Action Description <span className="text-destructive">*</span>
              <span className="ml-1 text-[10px]">(min 10 characters)</span>
            </label>
            <Textarea
              id="action-description"
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              placeholder="Describe the action being taken (min 10 characters)..."
              className="min-h-[72px] resize-y"
              aria-invalid={!!transitionError && actionDescription.length < 10}
            />
            <span className="text-[10px] text-muted-foreground">
              {actionDescription.length} characters
            </span>
          </div>

          {/* Decline reason (shown when decline is available) */}
          {isDeclineAvailable && (
            <div className="flex flex-col gap-1.5 mb-3">
              <label htmlFor="decline-reason" className="text-xs font-medium text-muted-foreground">
                Decline Reason <span className="text-destructive">*</span>
                <span className="ml-1 text-[10px]">(min 20 characters, required for decline)</span>
              </label>
              <Textarea
                id="decline-reason"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Explain the reason for declining (min 20 characters)..."
                className="min-h-[72px] resize-y"
                aria-invalid={!!transitionError && declineReason.length < 20}
              />
              <span className="text-[10px] text-muted-foreground">
                {declineReason.length} characters
              </span>
            </div>
          )}

          {/* Transition error */}
          {transitionError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 mb-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">{transitionError}</p>
            </div>
          )}

          {/* Transition success */}
          {transitionSuccess && (
            <div className="flex items-start gap-2 rounded-md border border-green-300 bg-green-50 p-3 mb-3 dark:border-green-700 dark:bg-green-900/20">
              <p className="text-xs text-green-700 dark:text-green-300">{transitionSuccess}</p>
            </div>
          )}

          {/* Transition buttons */}
          <div className="flex flex-wrap gap-2">
            {forwardTransitions.map((targetStatus) => (
              <Button
                key={targetStatus}
                variant="outline"
                size="sm"
                disabled={transitioning}
                onClick={() => handleTransition(targetStatus)}
                className="gap-1.5 capitalize"
              >
                {transitioning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Move to {targetStatus}
              </Button>
            ))}
            {isDeclineAvailable && (
              <Button
                variant="outline"
                size="sm"
                disabled={transitioning}
                onClick={() => handleTransition("declined")}
                className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {transitioning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                Decline
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Submissions list */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Submissions ({total})
          </h3>
          {total > PAGE_SIZE && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1 || loading}
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
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && submissions.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No submissions in this cluster.</p>
          </div>
        )}

        {!loading && submissions.length > 0 && (
          <div className="divide-y divide-border">
            {submissions.map((submission) => (
              <div key={submission.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">
                      {submission.description || <span className="italic text-muted-foreground">(deleted)</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                      <span>{formatTimestamp(submission.createdAt)}</span>
                      <span>·</span>
                      <span className="capitalize">
                        {submission.contextSnapshot?.userRole ?? "unknown"}
                      </span>
                      {submission.contextSnapshot?.pagePath && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-[10px] truncate max-w-[200px]">
                            {submission.contextSnapshot.pagePath}
                          </span>
                        </>
                      )}
                      {submission.contextSnapshot?.activeModule && (
                        <>
                          <span>·</span>
                          <span>{submission.contextSnapshot.activeModule}</span>
                        </>
                      )}
                      {submission.implicit && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          implicit
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] px-2 py-0.5 capitalize ${getStatusColor(submission.status)}`}
                  >
                    {submission.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom pagination info */}
        {!loading && total > 0 && (
          <div className="border-t border-border px-5 py-2.5">
            <p className="text-[10px] text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} submissions
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default FeedbackClusterDetail
