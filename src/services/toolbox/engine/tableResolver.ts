// Toolbox engine — guideline table resolver
//
// Resolves the concrete `GuidelineTable` version a calculator run should use for each
// table id it consumes. The core semantics (design "Engine API"):
//   - Resolve by id to the *latest non-superseded* version by default.
//   - Resolve to a *pinned* version when one is specified (e.g. replaying a saved run).
//   - A missing table id or a missing/expired pinned version is a hard failure
//     (`CalculatorError`) — never silently fall back to a default (Requirement 3.1, 3.3,
//     and design "Error Handling").
//
// The resolver is data-source agnostic: callers pass the full set of available table
// versions (the Task 3 store contents plug in here). Requirements: 3.1, 3.3.

import { CalculatorError, type GuidelineTable } from '../types'

/** Per-table pinned version map: table id -> exact version string. */
export type PinnedVersions = Record<string, string>

export interface ResolveTablesArgs {
  /** Table ids the calculator definition consumes (`def.tableRefs`). */
  tableRefs: string[]
  /** All available table versions across all ids (every version, superseded or not). */
  available: GuidelineTable[]
  /** Optional pinned versions, by table id — used to replay a saved run deterministically. */
  pinned?: PinnedVersions
  /** Optional effective-as-of ISO timestamp; only versions effective on/before this apply. */
  asOf?: string
}

/**
 * Compare two ISO date/timestamp strings. Returns a negative number when `a` precedes
 * `b`, positive when it follows, and 0 when equal. Falls back to lexical comparison for
 * non-parseable values so resolution stays deterministic.
 */
function compareEffective(a: string, b: string): number {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Resolve a single table id to the concrete version that should be used.
 *
 * @throws CalculatorError('MISSING_TABLE') when no version of the id exists.
 * @throws CalculatorError('MISSING_TABLE_VERSION') when a pinned version is absent, or
 *   when no version is effective as of `asOf`.
 */
export function resolveTable(
  tableId: string,
  available: GuidelineTable[],
  pinnedVersion?: string,
  asOf?: string,
): GuidelineTable {
  const versions = available.filter((t) => t.id === tableId)
  if (versions.length === 0) {
    throw new CalculatorError('MISSING_TABLE', `No guideline table registered for id "${tableId}".`, {
      tableId,
    })
  }

  // Pinned: must match exactly. A missing pinned version is a hard failure so that
  // replaying a saved run can never silently drift to a different version.
  if (pinnedVersion !== undefined) {
    const match = versions.find((v) => v.version === pinnedVersion)
    if (!match) {
      throw new CalculatorError(
        'MISSING_TABLE_VERSION',
        `Guideline table "${tableId}" has no version "${pinnedVersion}".`,
        { tableId, requestedVersion: pinnedVersion, availableVersions: versions.map((v) => v.version) },
      )
    }
    return match
  }

  // Latest: optionally constrained to versions effective on/before `asOf`.
  const effective = asOf
    ? versions.filter((v) => compareEffective(v.effectiveFrom, asOf) <= 0)
    : versions
  if (effective.length === 0) {
    throw new CalculatorError(
      'MISSING_TABLE_VERSION',
      `Guideline table "${tableId}" has no version effective as of "${asOf}".`,
      { tableId, asOf, availableVersions: versions.map((v) => v.version) },
    )
  }

  // Prefer non-superseded versions; among the chosen pool pick the latest effectiveFrom.
  const live = effective.filter((v) => !v.supersededBy)
  const pool = live.length > 0 ? live : effective
  return pool.reduce((latest, candidate) =>
    compareEffective(candidate.effectiveFrom, latest.effectiveFrom) > 0 ? candidate : latest,
  )
}

/**
 * Resolve every table id a definition consumes into a version-pinned map keyed by id.
 * The returned map is what the engine places on `ComputeContext.tables`.
 */
export function resolveTables(args: ResolveTablesArgs): Record<string, GuidelineTable> {
  const { tableRefs, available, pinned, asOf } = args
  const resolved: Record<string, GuidelineTable> = {}
  for (const id of tableRefs) {
    resolved[id] = resolveTable(id, available, pinned?.[id], asOf)
  }
  return resolved
}
