// Toolbox Capability Framework — core contracts
//
// This module defines the single, typed contract every tool implements as part of
// the Comprehensive Professional Toolboxes feature. Tools become data-driven
// `CalculatorDefinition`s rendered by a generic-but-rich runner, backed by a reusable
// calculation engine, versioned guideline tables, dynamic schedules, and a unified
// report/run/assign pipeline.
//
// Design reference: .kiro/specs/comprehensive-professional-toolboxes/design.md
//   ("Components and Interfaces"). Requirements: 1.1, 1.2, 3.1.
//
// These contracts are intentionally decoupled from the legacy
// `src/types/toolboxCalculators.ts` shapes; the framework is additive and does not
// alter the existing registry behaviour.

import type { ZodType } from 'zod'

// ----------------------------------------------------------------------------
// Method types
// ----------------------------------------------------------------------------

/**
 * The calculation strategy a definition uses. Fee methods wrap the existing
 * `professionalFeeCalculatorService` providers; `clauseSet` drives regulation checks.
 */
export type MethodType =
  | 'bracket'
  | 'percentage'
  | 'stage'
  | 'time'
  | 'area'
  | 'hybrid'
  | 'clauseSet'

/**
 * Source provenance for a guideline/tariff/clause table. Every numeric threshold or
 * tariff surfaced in a result MUST be traceable to a versioned source (Requirement 3.1).
 */
export type GuidelineStatus = 'mandatory' | 'recommended' | 'indicative'

export interface GuidelineSource {
  guideline: string
  version: string
  status: GuidelineStatus
  url?: string
}

// ----------------------------------------------------------------------------
// Clause checks
// ----------------------------------------------------------------------------

export type ClauseOutcome = 'pass' | 'fail' | 'advisory'

/**
 * The evaluated outcome of a single clause check, including the cited reference,
 * the threshold used, and the actual value evaluated (Requirement 1.3).
 */
export interface ClauseResult {
  clauseRef: string
  label: string
  outcome: ClauseOutcome
  threshold: string
  actual: string
  note?: string
}

/**
 * A pass/fail/advisory evaluation against a cited regulation clause. The `evaluate`
 * function receives the full compute context (resolved tables, inputs, schedule rows).
 */
export interface ClauseCheckDef<
  TInput = Record<string, unknown>,
  TRow = Record<string, unknown>,
> {
  clauseRef: string // e.g. 'SANS 10400-XA 4.3.2'
  label: string
  evaluate: (ctx: ComputeContext<TInput, TRow>) => Omit<ClauseResult, 'clauseRef' | 'label'> & {
    clauseRef?: string
    label?: string
  }
}

// ----------------------------------------------------------------------------
// Versioned guideline / tariff / clause tables
// ----------------------------------------------------------------------------

/**
 * Versioned data table backing calculator thresholds, tariffs, and brackets.
 * Admin edits append a new version (effectiveFrom + supersededBy), leaving prior
 * versions intact. Runs pin the version used (Requirements 3.1, 3.2, 3.3).
 */
export interface GuidelineTable<TRow = unknown> {
  id: string // 'xa_zone_limits', 'sacqsp_brackets'
  version: string // semver or gazette ref
  effectiveFrom: string // ISO date
  supersededBy?: string // version string of the table that supersedes this one
  jurisdiction: string // 'ZA'
  status?: GuidelineStatus
  rows: TRow[] // bracket rows / zone limits / stage % / clause thresholds
}

/** A guideline/version pair pinned into a saved run or surfaced in a result.
 *  Extended to include effectiveFrom and status for full audit traceability
 *  (Requirements 8.2, 8.5). */
export interface GuidelineVersionRef {
  guideline: string
  version: string
  /** ISO date from GuidelineTable.effectiveFrom — when this version became active. */
  effectiveFrom?: string
  /** The regulatory status of the guideline: mandatory, recommended, or indicative. */
  status?: GuidelineStatus
}

/**
 * A grouped sub-rollup within a result — e.g. a per-storey or per-zone summary that sits
 * alongside the whole-building/total figures in `CalculationResult.aggregates`. `group`
 * names the dimension being rolled up over (e.g. 'storey'); `key` is the group's value
 * (e.g. 'Ground'); `values` carries the same shape of metrics an aggregate would
 * (Requirement 4.3 — per-storey summaries plus a whole-building rollup).
 */
export interface GroupAggregate {
  group: string
  key: string
  label?: string
  values: Record<string, number | string>
}

// ----------------------------------------------------------------------------
// Compute context + result
// ----------------------------------------------------------------------------

/**
 * Everything a definition's `compute` function (and each clause check) needs to run:
 * validated top-level inputs, schedule rows, and resolved (version-pinned) tables.
 */
export interface ComputeContext<
  TInput = Record<string, unknown>,
  TRow = Record<string, unknown>,
> {
  /** Validated top-level inputs (parsed by `inputSchema`). */
  input: TInput
  /** Validated schedule rows (parsed by `scheduleSchema`); empty when not schedule-based. */
  rows: TRow[]
  /** Resolved guideline tables keyed by table id, version-pinned by the engine. */
  tables: Record<string, GuidelineTable>
  /** Jurisdiction for table resolution; defaults to 'ZA'. */
  jurisdiction?: string
  /** Effective-as-of timestamp for version resolution (ISO); defaults to now. */
  asOf?: string
}

/**
 * The unified output of any calculator run: per-row results, aggregate rollups,
 * clause outcomes, the source versions used, disclaimers, and soft warnings
 * (Requirements 1.2, 1.4).
 */
export interface CalculationResult {
  /** Per schedule row results. */
  lineResults: Array<Record<string, number | string>>
  /** Per-storey / per-zone / total rollups. */
  aggregates: Record<string, number | string>
  /**
   * Optional grouped sub-rollups (per-storey / per-zone) that accompany the whole-building
   * `aggregates`. Empty/omitted when a result has no meaningful grouping dimension
   * (Requirement 4.3).
   */
  groupAggregates?: GroupAggregate[]
  /** Pass/fail/advisory clause outcomes with cited refs and thresholds. */
  clauseResults: ClauseResult[]
  /** Optional 0–100 compliance score. */
  complianceScore?: number
  /** Versioned tables actually consumed in producing this result. */
  sourceVersions: GuidelineVersionRef[]
  /** Standard disclaimers (advisory / sign-off notices). */
  disclaimers: string[]
  /** Non-fatal issues (e.g. excluded invalid rows). */
  warnings: string[]
}

// ----------------------------------------------------------------------------
// Calculator definition (core contract)
// ----------------------------------------------------------------------------

export type CalculatorStatus = 'full' | 'preview'

/**
 * The versioned spec every tool implements: typed inputs, optional schedule rows,
 * method, consumed tables, clause checks, compute function, report template, source
 * provenance, disclaimers, and status (full vs preview).
 *
 * `toolId` is the FK back to an entry in `STANDALONE_TOOL_REGISTRY`.
 */
export interface CalculatorDefinition<
  TInput = Record<string, unknown>,
  TRow = Record<string, unknown>,
> {
  id: string // e.g. 'xa_fenestration_v1'
  toolId: string // FK to STANDALONE_TOOL_REGISTRY
  title: string
  method: MethodType
  inputSchema: ZodType<any, any, any>
  scheduleSchema?: ZodType<any, any, any>
  tableRefs: string[] // GuidelineTable ids consumed
  clauseSet?: ClauseCheckDef<TInput, TRow>[]
  compute: (ctx: ComputeContext<TInput, TRow>) => CalculationResult
  reportTemplateId: string
  source: GuidelineSource
  disclaimers: string[]
  status: CalculatorStatus
}

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

export type CalculatorErrorCode =
  | 'MISSING_TABLE'
  | 'MISSING_TABLE_VERSION'
  | 'UNSUPPORTED_JURISDICTION'
  | 'INVALID_INPUT'
  | 'INVALID_SCHEDULE_ROW'
  | 'COMPUTE_FAILED'

/**
 * Typed error for hard failures (e.g. missing/expired guideline table version).
 * Soft issues are returned via `CalculationResult.warnings` instead of throwing
 * (see design "Error Handling").
 */
export class CalculatorError extends Error {
  readonly code: CalculatorErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: CalculatorErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'CalculatorError'
    this.code = code
    this.details = details
    // Restore prototype chain for instanceof checks when targeting ES5/ES2015 down-levels.
    Object.setPrototypeOf(this, CalculatorError.prototype)
  }
}
