// Toolbox engine — guideline table resolver
//
// Resolves the concrete `GuidelineTable` version a calculator run should use for each
// table id it consumes. The core semantics (design "Engine API"):
//   - Resolve by id + jurisdiction to the *latest non-superseded* version where
//     effectiveFrom ≤ computation date.
//   - If multiple versions share the same effectiveFrom, select the one with the
//     highest version number.
//   - Default jurisdiction to 'ZA' when not supplied in the input.
//   - Resolve to a *pinned* version when one is specified (e.g. replaying a saved run).
//   - A missing table id, missing/expired pinned version, or unsupported jurisdiction
//     is a hard failure (`CalculatorError`) — never silently fall back to a default.
//
// Requirements: 8.1, 8.3, 8.4, 9.1, 9.2.

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
  /** Jurisdiction for table resolution; defaults to 'ZA' (Requirement 9.1). */
  jurisdiction?: string
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
 * Compare two semantic version strings (e.g. "1.2.3" vs "1.2.4").
 * Returns a positive number when `a` is greater than `b`, negative when less,
 * and 0 when equal. Falls back to lexical comparison for non-semver strings.
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)

  // If parsing fails (NaN), fall back to lexical comparison
  if (partsA.some(Number.isNaN) || partsB.some(Number.isNaN)) {
    return a < b ? -1 : a > b ? 1 : 0
  }

  const maxLen = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    if (numA !== numB) return numA - numB
  }
  return 0
}

/**
 * Collect all distinct jurisdictions present across all versions of a given table id.
 */
function getAvailableJurisdictions(tableId: string, available: GuidelineTable[]): string[] {
  const jurisdictions = new Set<string>()
  for (const t of available) {
    if (t.id === tableId) {
      jurisdictions.add(t.jurisdiction)
    }
  }
  return Array.from(jurisdictions).sort()
}

/**
 * Resolve a single table id to the concrete version that should be used.
 *
 * @throws CalculatorError('MISSING_TABLE') when no version of the id exists at all.
 * @throws CalculatorError('UNSUPPORTED_JURISDICTION') when the requested jurisdiction
 *   doesn't match any version of the table.
 * @throws CalculatorError('MISSING_TABLE_VERSION') when a pinned version is absent, or
 *   when no version is effective as of `asOf`.
 */
export function resolveTable(
  tableId: string,
  available: GuidelineTable[],
  pinnedVersion?: string,
  asOf?: string,
  jurisdiction?: string,
): GuidelineTable {
  // Default jurisdiction to 'ZA' per Requirement 9.1
  const resolvedJurisdiction = jurisdiction ?? 'ZA'

  // All versions for this table id (any jurisdiction)
  const allVersions = available.filter((t) => t.id === tableId)
  if (allVersions.length === 0) {
    throw new CalculatorError('MISSING_TABLE', `No guideline table registered for id "${tableId}".`, {
      tableId,
    })
  }

  // Pinned: must match exactly. A missing pinned version is a hard failure so that
  // replaying a saved run can never silently drift to a different version.
  // Pinned resolution bypasses jurisdiction filtering (deterministic replay — Req 8.4).
  if (pinnedVersion !== undefined) {
    const match = allVersions.find((v) => v.version === pinnedVersion)
    if (!match) {
      throw new CalculatorError(
        'MISSING_TABLE_VERSION',
        `Guideline table "${tableId}" has no version "${pinnedVersion}".`,
        { tableId, requestedVersion: pinnedVersion, availableVersions: allVersions.map((v) => v.version) },
      )
    }
    return match
  }

  // Filter by jurisdiction (Requirement 9.1, 9.2)
  const versions = allVersions.filter((t) => t.jurisdiction === resolvedJurisdiction)
  if (versions.length === 0) {
    const availableJurisdictions = getAvailableJurisdictions(tableId, available)
    throw new CalculatorError(
      'UNSUPPORTED_JURISDICTION',
      `Guideline table "${tableId}" has no versions for jurisdiction "${resolvedJurisdiction}". Available jurisdictions: ${availableJurisdictions.join(', ')}.`,
      {
        tableId,
        requestedJurisdiction: resolvedJurisdiction,
        availableJurisdictions,
      },
    )
  }

  // Latest: optionally constrained to versions effective on/before `asOf`.
  const effective = asOf
    ? versions.filter((v) => compareEffective(v.effectiveFrom, asOf) <= 0)
    : versions
  if (effective.length === 0) {
    throw new CalculatorError(
      'MISSING_TABLE_VERSION',
      `Guideline table "${tableId}" has no version effective as of "${asOf}" for jurisdiction "${resolvedJurisdiction}".`,
      { tableId, asOf, jurisdiction: resolvedJurisdiction, availableVersions: versions.map((v) => v.version) },
    )
  }

  // Prefer non-superseded versions; among the chosen pool pick the latest effectiveFrom.
  // If multiple versions share the same effectiveFrom, pick the highest version number (Req 8.1).
  const live = effective.filter((v) => !v.supersededBy)
  const pool = live.length > 0 ? live : effective

  return pool.reduce((best, candidate) => {
    const cmpDate = compareEffective(candidate.effectiveFrom, best.effectiveFrom)
    if (cmpDate > 0) return candidate
    if (cmpDate === 0) {
      // Same effectiveFrom — tiebreak on highest version number
      return compareVersions(candidate.version, best.version) > 0 ? candidate : best
    }
    return best
  })
}

/**
 * Resolve every table id a definition consumes into a version-pinned map keyed by id.
 * The returned map is what the engine places on `ComputeContext.tables`.
 */
export function resolveTables(args: ResolveTablesArgs): Record<string, GuidelineTable> {
  const { tableRefs, available, pinned, asOf, jurisdiction } = args
  const resolved: Record<string, GuidelineTable> = {}
  for (const id of tableRefs) {
    resolved[id] = resolveTable(id, available, pinned?.[id], asOf, jurisdiction)
  }
  return resolved
}
