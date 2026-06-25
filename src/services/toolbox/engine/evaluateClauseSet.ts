// Toolbox engine — clause-set evaluator
//
// `evaluateClauseSet` runs an array of `ClauseCheckDef` against a `ComputeContext` and
// produces the regulation half of a `CalculationResult`: a list of `ClauseResult`
// (pass / fail / advisory, each carrying its cited clause reference, label, threshold and
// actual value) plus a 0–100 `complianceScore`.
//
// It is the `clauseSet` counterpart to the fee method providers (Task 2.2): a definition's
// `compute` calls it with the already-validated, version-pinned context the runner built,
// then folds the returned clause results + score into its `CalculationResult`.
//
// Each `ClauseCheckDef.evaluate(ctx)` returns the outcome/threshold/actual (and optional
// note); the cited `clauseRef` and human `label` are merged in from the definition so the
// citation is always preserved on the result (Requirement 1.3). An `evaluate` may override
// `clauseRef`/`label` when a single check spans sub-clauses, but the definition's values
// are the default.
//
// Compliance score rule (documented, deterministic):
//   - Only *non-advisory* clauses (pass or fail) count toward the score; advisory clauses
//     are informational and never count as a failure (Requirement 6.2).
//   - score = round( passCount / (passCount + failCount) × 100 ), in [0, 100].
//   - When there are no non-advisory clauses (an empty set, or every clause advisory) the
//     result is *vacuously compliant* → score = 100. There is nothing failing to penalise.
//
// Requirements: 1.3, 6.1, 6.2, 10.1.

import {
  type ClauseCheckDef,
  type ClauseResult,
  type ComputeContext,
} from '../types'

/** Outcome of evaluating a clause set: the per-clause results plus the rolled-up score. */
export interface ClauseSetEvaluation {
  /** Per-clause pass/fail/advisory outcomes with cited refs, thresholds and actuals. */
  clauseResults: ClauseResult[]
  /** 0–100 compliance score — pass rate among non-advisory clauses (see module docs). */
  complianceScore: number
}

/**
 * Compute the compliance score from already-evaluated clause results.
 *
 * Pass rate among non-advisory clauses, rounded to the nearest integer in [0, 100].
 * An empty set (or an all-advisory set) is vacuously compliant and scores 100.
 */
export function computeComplianceScore(results: ClauseResult[]): number {
  let passCount = 0
  let failCount = 0
  for (const result of results) {
    if (result.outcome === 'pass') passCount += 1
    else if (result.outcome === 'fail') failCount += 1
    // advisory outcomes are intentionally excluded from the denominator
  }
  const nonAdvisory = passCount + failCount
  if (nonAdvisory === 0) return 100
  return Math.round((passCount / nonAdvisory) * 100)
}

/**
 * Evaluate every clause check in `clauseSet` against `ctx`, returning merged
 * `ClauseResult`s (citation preserved from the definition) and a `complianceScore`.
 *
 * The definition's `clauseRef` / `label` are applied to each result; an `evaluate`
 * function may override them when a check spans sub-clauses.
 */
export function evaluateClauseSet<
  TInput = Record<string, unknown>,
  TRow = Record<string, unknown>,
>(
  clauseSet: ClauseCheckDef<TInput, TRow>[],
  ctx: ComputeContext<TInput, TRow>,
): ClauseSetEvaluation {
  const clauseResults: ClauseResult[] = clauseSet.map((def) => {
    const evaluated = def.evaluate(ctx)
    return {
      // Citation is preserved from the definition unless the check overrides it.
      clauseRef: evaluated.clauseRef ?? def.clauseRef,
      label: evaluated.label ?? def.label,
      outcome: evaluated.outcome,
      threshold: evaluated.threshold,
      actual: evaluated.actual,
      ...(evaluated.note !== undefined ? { note: evaluated.note } : {}),
    }
  })

  return {
    clauseResults,
    complianceScore: computeComplianceScore(clauseResults),
  }
}
