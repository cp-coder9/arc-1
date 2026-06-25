// ClauseResultPanel — pass / fail / advisory clause outcomes (Task 5.3)
//
// Renders a `CalculationResult`'s `clauseResults` as an accessible list of clause checks,
// each citing the regulation clause reference, the threshold used, the actual value
// evaluated, and any note. Outcomes are colour- and icon-coded (pass = green, fail = red,
// advisory = amber) with a text label so meaning never relies on colour alone.
//
// Per Requirement 6.3 (and NFR governance), compliance output is advisory: the panel
// surfaces an explicit "advisory — professional sign-off required" notice whenever a
// sign-off is implied (compliance/clause tools), and lists the disclaimers carried by the
// result.
//
// Requirements:
//   1.3 — display per-clause results as pass/fail/advisory with the cited clause ref and threshold.
//   6.3 — advisory output requiring professional sign-off.
//   10.2 — keyboard-navigable, labelled, screen-reader friendly.

import React from 'react'
import { CheckCircle2, XCircle, AlertTriangle, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CalculationResult, ClauseOutcome, ClauseResult } from '@/services/toolbox/types'

export interface ClauseResultPanelProps {
  /** The clause outcomes to render (typically `CalculationResult.clauseResults`). */
  clauseResults: ClauseResult[]
  /** Optional 0–100 compliance score surfaced as a summary. */
  complianceScore?: CalculationResult['complianceScore']
  /** Disclaimers to print beneath the list (advisory / sign-off notices). */
  disclaimers?: string[]
  /**
   * When true (default), render an explicit advisory + professional sign-off notice
   * (Requirement 6.3). Set false for non-statutory calculators that carry no sign-off.
   */
  requiresSignOff?: boolean
  /** Accessible heading / region label. */
  title?: string
  className?: string
}

interface OutcomeMeta {
  label: string
  Icon: typeof CheckCircle2
  badgeVariant: 'secondary' | 'destructive' | 'outline'
  rowClass: string
  iconClass: string
}

const OUTCOME_META: Record<ClauseOutcome, OutcomeMeta> = {
  pass: {
    label: 'Pass',
    Icon: CheckCircle2,
    badgeVariant: 'secondary',
    rowClass: 'border-emerald-500/30 bg-emerald-500/5',
    iconClass: 'text-emerald-600',
  },
  fail: {
    label: 'Fail',
    Icon: XCircle,
    badgeVariant: 'destructive',
    rowClass: 'border-destructive/30 bg-destructive/5',
    iconClass: 'text-destructive',
  },
  advisory: {
    label: 'Advisory',
    Icon: AlertTriangle,
    badgeVariant: 'outline',
    rowClass: 'border-amber-500/30 bg-amber-500/5',
    iconClass: 'text-amber-600',
  },
}

function metaFor(outcome: string): OutcomeMeta {
  return OUTCOME_META[outcome as ClauseOutcome] ?? OUTCOME_META.advisory
}

export default function ClauseResultPanel(props: ClauseResultPanelProps) {
  const {
    clauseResults,
    complianceScore,
    disclaimers = [],
    requiresSignOff = true,
    title = 'Clause compliance',
    className,
  } = props

  const counts = clauseResults.reduce(
    (acc, c) => {
      const key = (c.outcome as ClauseOutcome) in OUTCOME_META ? (c.outcome as ClauseOutcome) : 'advisory'
      acc[key] += 1
      return acc
    },
    { pass: 0, fail: 0, advisory: 0 } as Record<ClauseOutcome, number>,
  )

  return (
    <section
      className={cn('space-y-3', className)}
      role="region"
      aria-label={title}
      data-testid="clause-result-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="flex items-center gap-2 text-xs">
          {typeof complianceScore === 'number' && (
            <span className="text-muted-foreground" data-testid="compliance-score">
              Compliance score: <span className="font-medium text-foreground">{complianceScore}</span>
            </span>
          )}
          <span className="sr-only">
            {counts.pass} pass, {counts.fail} fail, {counts.advisory} advisory.
          </span>
        </div>
      </div>

      {clauseResults.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No clause checks for this calculator.
        </p>
      ) : (
        <ul className="space-y-2" aria-label={`${title} results`}>
          {clauseResults.map((clause, index) => {
            const meta = metaFor(clause.outcome)
            const Icon = meta.Icon
            return (
              <li
                key={`${clause.clauseRef}-${index}`}
                className={cn('rounded-lg border p-3', meta.rowClass)}
                data-outcome={clause.outcome}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.iconClass)} aria-hidden="true" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{clause.label}</p>
                      <p className="text-xs text-muted-foreground">{clause.clauseRef}</p>
                    </div>
                  </div>
                  <Badge variant={meta.badgeVariant} className="uppercase">
                    {meta.label}
                    <span className="sr-only"> — {clause.clauseRef}</span>
                  </Badge>
                </div>

                <dl className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                  <div className="flex gap-1">
                    <dt className="text-muted-foreground">Threshold:</dt>
                    <dd className="font-medium">{clause.threshold}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-muted-foreground">Actual:</dt>
                    <dd className="font-medium">{clause.actual}</dd>
                  </div>
                </dl>

                {clause.note && <p className="mt-1 text-xs text-muted-foreground">{clause.note}</p>}
              </li>
            )
          })}
        </ul>
      )}

      {requiresSignOff && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Advisory only — these results are decision-support and require professional sign-off
            before submission or certification.
          </span>
        </p>
      )}

      {disclaimers.length > 0 && (
        <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {disclaimers.map((d, i) => (
            <p key={i}>{d}</p>
          ))}
        </div>
      )}
    </section>
  )
}
