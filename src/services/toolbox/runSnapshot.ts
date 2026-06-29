// Toolbox — run snapshot helper
//
// Maps a `CalculationResult` (the engine's output) onto the additive run-snapshot fields
// of `StandaloneToolRun` so a saved run is fully reproducible against the exact guideline
// versions it consumed (Requirements 3.3, 9.1; design Property 1 — version pinning).
//
// This is the single, cohesive place that knows how a calculator run becomes run metadata.
// Persistence itself (extending `standaloneToolRunService.createRun`) is Task 4.2; this
// module only produces the snapshot fields and the inverse pin map used to replay a run.
//
// Why a `guideline -> version` pin map round-trips cleanly:
//   `runCalculator` records each resolved table in `sourceVersions` as
//   `{ guideline: table.id, version: table.version }`. The engine's table resolver, in
//   turn, accepts `PinnedVersions` keyed by table id. So `guidelineVersions` captured at
//   save time map straight back to `pinnedVersions` at replay time — no lookup table needed.

import type {
  CalculationResult,
  CalculatorDefinition,
  ClauseResult,
  GuidelineVersionRef,
} from './types'
import type { PinnedVersions } from './engine/tableResolver'

/**
 * The additive snapshot fields persisted on a `StandaloneToolRun` for a framework run.
 * Mirrors the optional fields on `StandaloneToolRun` (see `standaloneToolTypes.ts`) so the
 * result can be spread directly onto a run record without re-deriving anything.
 */
export interface RunSnapshotFields {
  calculatorDefinitionId: string
  scheduleRows: unknown[]
  guidelineVersions: GuidelineVersionRef[]
  clauseResults: ClauseResult[]
}

/**
 * Build the run-snapshot fields from a calculation result.
 *
 * Snapshots the pinned guideline versions straight from `result.sourceVersions` (which the
 * engine guarantees contains every consumed table — design Property 2), alongside the
 * definition id, the schedule rows used, and the clause outcomes. Defensive copies are
 * taken so later mutation of the inputs/result cannot corrupt a persisted snapshot.
 *
 * @param def    The calculator definition that produced the result (only its `id` is used).
 * @param result The engine's `CalculationResult`.
 * @param rows   The (valid) schedule rows the run was computed against; defaults to none.
 */
export function toRunSnapshot<TInput, TRow>(
  def: Pick<CalculatorDefinition<TInput, TRow>, 'id'>,
  result: CalculationResult,
  rows: readonly unknown[] = [],
): RunSnapshotFields {
  return {
    calculatorDefinitionId: def.id,
    scheduleRows: rows.map((r) => (r && typeof r === 'object' ? { ...(r as object) } : r)),
    guidelineVersions: result.sourceVersions.map((v) => ({ ...v })),
    clauseResults: result.clauseResults.map((c) => ({ ...c })),
  }
}

/**
 * Convert the `guidelineVersions` snapshotted on a saved run back into the engine's
 * `PinnedVersions` map (table id -> version) so the run can be replayed deterministically.
 *
 * `guidelineVersions[].guideline` is the table id (per `runCalculator`), so the mapping is
 * direct. When two refs share an id (should not happen — the engine dedupes), the last one
 * wins, matching map-assignment semantics.
 */
export function pinnedVersionsFromSnapshot(
  versions: readonly GuidelineVersionRef[] | undefined,
): PinnedVersions {
  const pinned: PinnedVersions = {}
  for (const v of versions ?? []) {
    pinned[v.guideline] = v.version
  }
  return pinned
}
