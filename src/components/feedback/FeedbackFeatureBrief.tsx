import * as React from "react"
import { Sparkles, Loader2, Users, Target, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/apiClient"
import type { FeatureBrief } from "@/services/feedbackTypes"

/**
 * FeedbackFeatureBrief — AI-generated feature brief panel for feature_request clusters.
 *
 * Displays: problem statement, affected roles, suggested scope, estimated impact.
 * Provides a "Generate Brief" button that calls POST /api/feedback/clusters/:id/brief.
 * Shows loading state while generating and renders the FeatureBrief type once available.
 *
 * Requirements: 4.5
 */

export interface FeedbackFeatureBriefProps {
  clusterId: string;
}

export function FeedbackFeatureBrief({ clusterId }: FeedbackFeatureBriefProps) {
  const [brief, setBrief] = React.useState<FeatureBrief | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleGenerateBrief = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/feedback/clusters/${clusterId}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Failed to generate brief (${response.status})`)
      }

      const data: FeatureBrief = await response.json()
      setBrief(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate brief")
    } finally {
      setLoading(false)
    }
  }

  // No brief yet — show the generate prompt
  if (!brief && !loading) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <Sparkles
          className="mx-auto mb-3"
          size={28}
          style={{ color: "var(--teal)" }}
        />
        <h3
          className="text-sm font-semibold mb-1"
          style={{ color: "var(--ink)" }}
        >
          AI Feature Brief
        </h3>
        <p
          className="text-xs mb-4"
          style={{ color: "var(--muted)" }}
        >
          Generate an AI-powered feature brief with problem statement, affected roles,
          suggested scope, and estimated impact.
        </p>
        {error && (
          <p className="text-xs mb-3 text-red-600">{error}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleGenerateBrief}
        >
          <Sparkles className="h-4 w-4" />
          Generate Brief
        </Button>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="rounded-lg border border-border p-6 text-center">
        <Loader2
          className="mx-auto mb-3 animate-spin"
          size={28}
          style={{ color: "var(--teal)" }}
        />
        <p
          className="text-sm font-medium"
          style={{ color: "var(--ink)" }}
        >
          Generating AI Brief...
        </p>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--muted)" }}
        >
          Analysing cluster data and submissions
        </p>
      </div>
    )
  }

  // Brief generated — display it
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} style={{ color: "var(--teal)" }} />
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--ink)" }}
        >
          AI Feature Brief
        </h3>
        <span
          className="ml-auto text-[10px]"
          style={{ color: "var(--muted)" }}
        >
          Generated {brief!.generatedAt ? new Date(brief!.generatedAt).toLocaleDateString() : ""}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {/* Problem Statement */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Target size={14} style={{ color: "var(--deep)" }} />
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--deep)" }}
            >
              Problem Statement
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            {brief!.problemStatement}
          </p>
        </div>

        {/* Affected Roles */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Users size={14} style={{ color: "var(--deep)" }} />
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--deep)" }}
            >
              Affected Roles
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {brief!.affectedRoles.map((role) => (
              <span
                key={role}
                className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize"
                style={{
                  color: "var(--deep)",
                  backgroundColor: "var(--aqua)",
                  border: "1px solid var(--mint)",
                }}
              >
                {role.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>

        {/* Suggested Scope */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={14} style={{ color: "var(--deep)" }} />
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--deep)" }}
            >
              Suggested Scope
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            {brief!.suggestedScope}
          </p>
        </div>

        {/* Estimated Impact */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 size={14} style={{ color: "var(--deep)" }} />
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--deep)" }}
            >
              Estimated Impact
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            {brief!.estimatedImpact}
          </p>
        </div>
      </div>

      {/* Regenerate action */}
      <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleGenerateBrief}
          disabled={loading}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Regenerate
        </Button>
      </div>
    </div>
  )
}

export default FeedbackFeatureBrief
