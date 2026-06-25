// Toolbox — restore-from-saved-run (reopen as a new version)
//
// Requirement 9.2: re-opening a saved run restores all inputs/schedule rows for editing
// AS A NEW VERSION. This module turns a persisted `StandaloneToolRun` back into the state
// the runner needs to re-open it:
//   - the top-level `input` and the `scheduleRows` to edit,
//   - the `pinnedVersions` map so a recompute reproduces the run deterministically
//     (design Property 1 — version pinning), unless the user intentionally re-runs against
//     the latest tables,
//   - the prior `clauseResults` for display, plus lineage (`sourceRunId`, `baseVersion`).
//
// Persisting the edited result as a new version is handled by
// `standaloneToolRunService.reopenAsNewVersion`, which consumes `sourceRunId` to link
// lineage and bumps the version. This module is pure (no persistence, no mutation) so the
// restored state can be safely held in component state and edited before save.

import type { StandaloneToolRun } from '@/types/standaloneToolTypes'
import type { ClauseResult } from './types'
import type { PinnedVersions } from './engine/tableResolver'
import { pinnedVersionsFromSnapshot } from './runSnapshot'

/** The editable state produced when a saved run is re-opened in the runner. */
export interface RestoredRunState {
  /** Calculator definition the run used (undefined for legacy runs). */
  calculatorDefinitionId?: string
  /** Top-level inputs to re-populate the form (defensive copy). */
  input: Record<string, unknown>
  /** Schedule rows to re-populate the grid (defensive deep-ish copy of each row). */
  scheduleRows: unknown[]
  /**
   * Guideline versions pinned at save time, mapped to the engine's `PinnedVersions` so a
   * recompute reproduces the original run exactly (Requirement 9.2 + Property 1). Empty
   * when the run carried no framework version metadata.
   */
  pinnedVersions: PinnedVersions
  /** Clause outcomes from the saved run, for display until recomputed. */
  clauseResults: ClauseResult[]
  /** The run being re-opened — used as the new version's `previousRunId`. */
  sourceRunId: string
  /** The version of the run being re-opened; the new version will be this + 1. */
  baseVersion: number
}

/** Defensive copy of a single schedule row (objects spread; primitives pass through). */
function copyRow(row: unknown): unknown {
  return row && typeof row === 'object' ? { ...(row as object) } : row
}

/**
 * Restore a saved run into editable runner state. Pure — the input run is never mutated,
 * and all nested structures are copied so editing the restored state cannot corrupt the
 * persisted run.
 */
export function restoreRunForReopen(run: StandaloneToolRun): RestoredRunState {
  return {
    calculatorDefinitionId: run.calculatorDefinitionId,
    input: { ...run.input },
    scheduleRows: (run.scheduleRows ?? []).map(copyRow),
    pinnedVersions: pinnedVersionsFromSnapshot(run.guidelineVersions),
    clauseResults: (run.clauseResults ?? []).map((c) => ({ ...c })),
    sourceRunId: run.runId,
    baseVersion: run.version,
  }
}
