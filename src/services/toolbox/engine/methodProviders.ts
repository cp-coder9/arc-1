// Toolbox engine — fee method providers
//
// These providers implement the fee `MethodType`s of the Toolbox Capability Framework
// (`bracket`, `percentage`, `stage`, `time`, `area`, `hybrid`). Each one is a thin
// adapter that:
//
//   1. Reads its thresholds / tariffs / brackets / stage shares from the *resolved*,
//      version-pinned `GuidelineTable` rows on the `ComputeContext` — never from
//      hard-coded constants (Requirement 3.1, design Property 2). The only new logic
//      here is *selecting the applicable table row*; the money math itself is reused.
//   2. Folds in the existing, battle-tested fee math from
//      `professionalFeeCalculatorService` (sliding-scale, percentage-of-cost,
//      stage-apportioned, time-based, area/unit) — including discount, disbursements,
//      statutory fees, VAT, totals and line items. We reuse, we do not duplicate.
//   3. Maps the service's fee result into the framework's `CalculationResult` so any
//      definition's `compute` can return it directly.
//
// The `hybrid` provider composes the per-method *base* fees (discount/VAT zeroed) and
// then runs a single finalize pass through the same service so discount/VAT/total are
// applied exactly once.
//
// Requirements: 5.1, 7.1, 7.2, 10.1. Monotonic-fee invariant: design Property 4.

import {
  calculateProfessionalFee,
  type ArchitexProfessionalRole,
  type CalculationInput as FeeServiceInput,
  type CalculatorDefinition as FeeServiceDefinition,
  type CalculationResult as FeeServiceResult,
  type FormulaType,
} from '../../professionalFeeCalculatorService'
import {
  CalculatorError,
  type CalculationResult,
  type ComputeContext,
  type GuidelineVersionRef,
} from '../types'

// ----------------------------------------------------------------------------
// Table row shapes consumed by the fee providers
// ----------------------------------------------------------------------------

/** Progressive sliding-scale bracket row (e.g. "R X plus Y% of the excess over R Z"). */
export interface BracketTableRow {
  /** Inclusive lower bound of the value-for-fee-purposes this bracket applies to. */
  minValue: number
  /** Exclusive upper bound; `null`/omitted marks the open-ended top bracket. */
  maxValue?: number | null
  /** Fixed fee at `minValue`. */
  baseFee: number
  /** Marginal rate (decimal, e.g. 0.045) applied to `(value − minValue)`. */
  marginalRate: number
}

/** Percentage-of-cost row, optionally value-banded. */
export interface PercentageTableRow {
  /** Optional inclusive lower bound when the percentage is value-banded. */
  minValue?: number
  /** Optional exclusive upper bound. */
  maxValue?: number | null
  /** Percentage as a whole number (e.g. 8 = 8%). */
  percentage: number
}

/** Stage apportionment row — each stage's share of the total fee. */
export interface StageTableRow {
  /** Stage identifier (matched against `input.selectedStages`). */
  stage: string
  /** Share of total fee as a whole number (all rows nominally sum to 100). */
  percentage: number
}

/** Hourly rate row, optionally keyed by professional grade. */
export interface HourlyRateTableRow {
  grade?: string
  hourlyRate: number
}

/** Unit/area rate row, optionally keyed by category. */
export interface UnitRateTableRow {
  category?: string
  ratePerUnit: number
}

// ----------------------------------------------------------------------------
// Provider input + configuration
// ----------------------------------------------------------------------------

/** Top-level inputs the fee providers read off `ComputeContext.input`. */
export interface FeeMethodInput {
  /** Canonical works/project value used for percentage & bracket methods. */
  valueForFeePurposes?: number
  /** Legacy alias for `valueForFeePurposes`. */
  projectValue?: number
  /** Complexity multiplier (1 = baseline). */
  complexityFactor?: number
  /** Labour hours for the time method. */
  hours?: number
  /** Area (m²) for the area method. */
  area?: number
  /** Unit count for the area/unit method (alias for area when rate is per-unit). */
  units?: number
  /** Professional grade selecting an hourly-rate row. */
  grade?: string
  /** Category selecting a unit-rate row. */
  category?: string
  /** Stages included in a stage-apportioned fee (defaults to all stages). */
  selectedStages?: string[]
  /** Disbursements (not subject to professional discount). */
  disbursements?: number
  /** Statutory / municipal fees (not subject to professional discount). */
  statutoryFees?: number
  /** Professional discount percentage (0–100). */
  discountPercent?: number
  /** Reason for the discount (required before issue). */
  discountReason?: string
  /** VAT rate override (decimal); falls back to config then 0.15. */
  vatRate?: number
}

/** Which tables a provider reads and how the resulting fee is labelled/sourced. */
export interface FeeMethodConfig {
  bracketTableId?: string
  percentageTableId?: string
  stageTableId?: string
  hourlyRateTableId?: string
  unitRateTableId?: string
  /** VAT rate (decimal) when not supplied on the input. */
  vatRate?: number
  role?: ArchitexProfessionalRole
  calculatorId?: string
  label?: string
  sourceName?: string
  sourceVersion?: string
  /** Disclaimers to attach; a default advisory is used when omitted. */
  disclaimers?: string[]
  /** For `hybrid`: which component methods to combine (default percentage + time). */
  hybridComponents?: Array<'bracket' | 'percentage' | 'time' | 'area'>
}

const DEFAULT_VAT_RATE = 0.15
const DEFAULT_DISCLAIMERS = [
  'Indicative fee estimate based on the cited guideline version — not a binding quote.',
  'Professional confirmation and sign-off required before issue.',
]

// ----------------------------------------------------------------------------
// Table-reading helpers (the only "new" logic — selecting the applicable row)
// ----------------------------------------------------------------------------

function requireTableId(id: string | undefined, configKey: string): string {
  if (!id) {
    throw new CalculatorError(
      'MISSING_TABLE',
      `Fee method requires a "${configKey}" to be configured.`,
      { configKey },
    )
  }
  return id
}

function rowsOf<T>(ctx: ComputeContext<FeeMethodInput>, tableId: string): T[] {
  const table = ctx.tables[tableId]
  if (!table) {
    throw new CalculatorError(
      'MISSING_TABLE',
      `Guideline table "${tableId}" was not resolved into the compute context.`,
      { tableId },
    )
  }
  if (!Array.isArray(table.rows) || table.rows.length === 0) {
    throw new CalculatorError('MISSING_TABLE', `Guideline table "${tableId}" has no rows.`, { tableId })
  }
  return table.rows as T[]
}

/** Value used for percentage/bracket methods (canonical name, with legacy fallback). */
function feeValue(input: FeeMethodInput): number {
  return input.valueForFeePurposes ?? input.projectValue ?? 0
}

/** Pick the progressive bracket whose lower bound is the greatest one ≤ value. */
function selectBracket(rows: BracketTableRow[], value: number): BracketTableRow {
  const sorted = [...rows].sort((a, b) => a.minValue - b.minValue)
  let chosen = sorted[0]
  for (const row of sorted) {
    if (value >= row.minValue) chosen = row
    else break
  }
  return chosen
}

/** Resolve the applicable percentage: the band containing value, else a flat row. */
function selectPercentage(rows: PercentageTableRow[], value: number): number {
  const banded = rows.some((r) => r.minValue !== undefined || r.maxValue !== undefined)
  if (!banded) return rows[0].percentage
  const sorted = [...rows].sort((a, b) => (a.minValue ?? 0) - (b.minValue ?? 0))
  let chosen = sorted[0]
  for (const row of sorted) {
    if (value >= (row.minValue ?? 0)) chosen = row
    else break
  }
  return chosen.percentage
}

/** Sum the share of the selected stages (all stages when none selected). */
function sumStagePercentages(rows: StageTableRow[], selected?: string[]): number {
  if (!selected || selected.length === 0) {
    return rows.reduce((sum, r) => sum + r.percentage, 0)
  }
  return rows
    .filter((r) => selected.includes(r.stage))
    .reduce((sum, r) => sum + r.percentage, 0)
}

function selectHourlyRate(rows: HourlyRateTableRow[], grade?: string): number {
  if (grade) {
    const match = rows.find((r) => r.grade === grade)
    if (match) return match.hourlyRate
  }
  return rows[0].hourlyRate
}

function selectUnitRate(rows: UnitRateTableRow[], category?: string): number {
  if (category) {
    const match = rows.find((r) => r.category === category)
    if (match) return match.ratePerUnit
  }
  return rows[0].ratePerUnit
}

// ----------------------------------------------------------------------------
// Folding in professionalFeeCalculatorService
// ----------------------------------------------------------------------------

function resolveVatRate(input: FeeMethodInput, config: FeeMethodConfig): number {
  return input.vatRate ?? config.vatRate ?? DEFAULT_VAT_RATE
}

/** Build a fee-service definition whose parameters are sourced from the tables. */
function buildFeeDefinition(
  formulaType: FormulaType,
  params: Partial<FeeServiceDefinition>,
  config: FeeMethodConfig,
  vatRate: number,
): FeeServiceDefinition {
  return {
    calculatorId: config.calculatorId ?? `toolbox_${formulaType}`,
    label: config.label ?? `Toolbox ${formulaType} fee`,
    role: config.role ?? 'architect',
    formulaType,
    sourceName: config.sourceName ?? 'Toolbox versioned guideline table',
    sourceVersion: config.sourceVersion ?? 'table-pinned',
    vatRate,
    requiresProfessionalConfirmation: true,
    ...params,
  }
}

function feeInput(input: FeeMethodInput, overrides: Partial<FeeServiceInput>): FeeServiceInput {
  return {
    projectValue: overrides.projectValue ?? feeValue(input),
    stagePercentage: overrides.stagePercentage,
    hours: overrides.hours ?? input.hours,
    hourlyRate: overrides.hourlyRate,
    area: overrides.area,
    unitRate: overrides.unitRate,
    complexityFactor: input.complexityFactor,
    disbursements: input.disbursements,
    statutoryFees: input.statutoryFees,
    discountPercent: input.discountPercent,
    discountReason: input.discountReason,
  }
}

/** Schedule-free input used when computing a *base* fee component (no discount/VAT). */
function baseOnlyInput(input: FeeMethodInput, overrides: Partial<FeeServiceInput>): FeeServiceInput {
  return {
    projectValue: overrides.projectValue ?? feeValue(input),
    stagePercentage: overrides.stagePercentage,
    hours: overrides.hours ?? input.hours,
    hourlyRate: overrides.hourlyRate,
    area: overrides.area,
    unitRate: overrides.unitRate,
    complexityFactor: input.complexityFactor,
    disbursements: 0,
    statutoryFees: 0,
    discountPercent: 0,
  }
}

function sourceVersionsFrom(ctx: ComputeContext<FeeMethodInput>): GuidelineVersionRef[] {
  return Object.values(ctx.tables).map((t) => ({ guideline: t.id, version: t.version }))
}

/** Map a fee-service result into the framework's `CalculationResult`. */
function toToolboxResult(
  svc: FeeServiceResult,
  ctx: ComputeContext<FeeMethodInput>,
  config: FeeMethodConfig,
  extraWarnings: string[] = [],
): CalculationResult {
  const lineResults = svc.lines.map((line) => ({
    label: line.label,
    amount: line.amount,
    category: line.category,
  }))
  return {
    lineResults,
    aggregates: {
      originalProfessionalFee: svc.originalProfessionalFee,
      discountAmount: svc.discountAmount,
      professionalFeeAfterDiscount: svc.professionalFeeAfterDiscount,
      vatAmount: svc.vatAmount,
      total: svc.total,
    },
    clauseResults: [],
    sourceVersions: sourceVersionsFrom(ctx),
    disclaimers: config.disclaimers ?? DEFAULT_DISCLAIMERS,
    warnings: [...svc.warnings, ...extraWarnings],
  }
}

// ----------------------------------------------------------------------------
// Public method providers
// ----------------------------------------------------------------------------

/**
 * Sliding-scale bracket fee. Selects the applicable progressive bracket from the
 * configured bracket table and folds it into the service's `sliding_scale` math.
 */
export function bracketFee(
  ctx: ComputeContext<FeeMethodInput>,
  config: FeeMethodConfig,
): CalculationResult {
  const input = ctx.input
  const value = feeValue(input)
  const rows = rowsOf<BracketTableRow>(ctx, requireTableId(config.bracketTableId, 'bracketTableId'))
  const bracket = selectBracket(rows, value)
  const def = buildFeeDefinition(
    'sliding_scale',
    {
      slidingScaleBase: {
        threshold: bracket.minValue,
        baseFee: bracket.baseFee,
        rateAboveThreshold: bracket.marginalRate,
      },
    },
    config,
    resolveVatRate(input, config),
  )
  const svc = calculateProfessionalFee(def, feeInput(input, { projectValue: value }))
  return toToolboxResult(svc, ctx, config)
}

/**
 * Percentage-of-cost fee. Reads the applicable percentage (flat or value-banded) from
 * the configured percentage table and folds it into the service's `percentage_of_cost`.
 */
export function percentageFee(
  ctx: ComputeContext<FeeMethodInput>,
  config: FeeMethodConfig,
): CalculationResult {
  const input = ctx.input
  const value = feeValue(input)
  const rows = rowsOf<PercentageTableRow>(ctx, requireTableId(config.percentageTableId, 'percentageTableId'))
  const pct = selectPercentage(rows, value)
  const def = buildFeeDefinition('percentage_of_cost', { defaultPercentage: pct }, config, resolveVatRate(input, config))
  const svc = calculateProfessionalFee(def, feeInput(input, { projectValue: value }))
  return toToolboxResult(svc, ctx, config)
}

/**
 * Stage-apportioned fee. Computes the base fee percentage from the percentage table and
 * the included stage share from the stage table, then folds both into the service's
 * `stage_apportioned` math.
 */
export function stageApportion(
  ctx: ComputeContext<FeeMethodInput>,
  config: FeeMethodConfig,
): CalculationResult {
  const input = ctx.input
  const value = feeValue(input)
  const pctRows = rowsOf<PercentageTableRow>(
    ctx,
    requireTableId(config.percentageTableId, 'percentageTableId'),
  )
  const basePct = selectPercentage(pctRows, value)
  const stageRows = rowsOf<StageTableRow>(ctx, requireTableId(config.stageTableId, 'stageTableId'))
  const stagePct = sumStagePercentages(stageRows, input.selectedStages)
  const def = buildFeeDefinition('stage_apportioned', { defaultPercentage: basePct }, config, resolveVatRate(input, config))
  const svc = calculateProfessionalFee(def, feeInput(input, { projectValue: value, stagePercentage: stagePct }))
  return toToolboxResult(svc, ctx, config)
}

/**
 * Time-based fee. Reads the hourly rate (optionally by grade) from the configured rate
 * table and folds it into the service's `time_based` math.
 */
export function timeCost(
  ctx: ComputeContext<FeeMethodInput>,
  config: FeeMethodConfig,
): CalculationResult {
  const input = ctx.input
  const rows = rowsOf<HourlyRateTableRow>(
    ctx,
    requireTableId(config.hourlyRateTableId, 'hourlyRateTableId'),
  )
  const rate = selectHourlyRate(rows, input.grade)
  const def = buildFeeDefinition('time_based', { defaultHourlyRate: rate }, config, resolveVatRate(input, config))
  const svc = calculateProfessionalFee(def, feeInput(input, { hours: input.hours, hourlyRate: rate }))
  return toToolboxResult(svc, ctx, config)
}

/**
 * Area/unit fee. Reads the unit rate (optionally by category) from the configured unit
 * table and folds it into the service's `area_unit` math.
 */
export function areaUnit(
  ctx: ComputeContext<FeeMethodInput>,
  config: FeeMethodConfig,
): CalculationResult {
  const input = ctx.input
  const rows = rowsOf<UnitRateTableRow>(ctx, requireTableId(config.unitRateTableId, 'unitRateTableId'))
  const rate = selectUnitRate(rows, input.category)
  const area = input.area ?? input.units ?? 0
  const def = buildFeeDefinition('area_unit', { defaultUnitRate: rate }, config, resolveVatRate(input, config))
  const svc = calculateProfessionalFee(def, feeInput(input, { area, unitRate: rate }))
  return toToolboxResult(svc, ctx, config)
}

/** Compute a single component's *base* professional fee (no discount/VAT applied). */
function componentBaseFee(
  method: 'bracket' | 'percentage' | 'time' | 'area',
  ctx: ComputeContext<FeeMethodInput>,
  config: FeeMethodConfig,
  warnings: string[],
): number {
  const input = ctx.input
  const value = feeValue(input)
  switch (method) {
    case 'bracket': {
      if (!config.bracketTableId) {
        warnings.push('Hybrid: bracket component skipped (no bracketTableId configured).')
        return 0
      }
      const rows = rowsOf<BracketTableRow>(ctx, config.bracketTableId)
      const bracket = selectBracket(rows, value)
      const def = buildFeeDefinition(
        'sliding_scale',
        {
          slidingScaleBase: {
            threshold: bracket.minValue,
            baseFee: bracket.baseFee,
            rateAboveThreshold: bracket.marginalRate,
          },
        },
        config,
        resolveVatRate(input, config),
      )
      return calculateProfessionalFee(def, baseOnlyInput(input, { projectValue: value })).originalProfessionalFee
    }
    case 'percentage': {
      if (!config.percentageTableId) {
        warnings.push('Hybrid: percentage component skipped (no percentageTableId configured).')
        return 0
      }
      const rows = rowsOf<PercentageTableRow>(ctx, config.percentageTableId)
      const pct = selectPercentage(rows, value)
      const def = buildFeeDefinition('percentage_of_cost', { defaultPercentage: pct }, config, resolveVatRate(input, config))
      return calculateProfessionalFee(def, baseOnlyInput(input, { projectValue: value })).originalProfessionalFee
    }
    case 'time': {
      if (!config.hourlyRateTableId) {
        warnings.push('Hybrid: time component skipped (no hourlyRateTableId configured).')
        return 0
      }
      const rows = rowsOf<HourlyRateTableRow>(ctx, config.hourlyRateTableId)
      const rate = selectHourlyRate(rows, input.grade)
      const def = buildFeeDefinition('time_based', { defaultHourlyRate: rate }, config, resolveVatRate(input, config))
      return calculateProfessionalFee(def, baseOnlyInput(input, { hours: input.hours, hourlyRate: rate }))
        .originalProfessionalFee
    }
    case 'area': {
      if (!config.unitRateTableId) {
        warnings.push('Hybrid: area component skipped (no unitRateTableId configured).')
        return 0
      }
      const rows = rowsOf<UnitRateTableRow>(ctx, config.unitRateTableId)
      const rate = selectUnitRate(rows, input.category)
      const area = input.area ?? input.units ?? 0
      const def = buildFeeDefinition('area_unit', { defaultUnitRate: rate }, config, resolveVatRate(input, config))
      return calculateProfessionalFee(def, baseOnlyInput(input, { area, unitRate: rate })).originalProfessionalFee
    }
    default:
      return 0
  }
}

/**
 * Hybrid fee. Sums the base fees of the configured component methods (each computed via
 * the reused service with discount/VAT zeroed), then runs a single finalize pass through
 * the service so discount, disbursements, statutory fees and VAT are applied exactly once.
 */
export function hybrid(
  ctx: ComputeContext<FeeMethodInput>,
  config: FeeMethodConfig,
): CalculationResult {
  const input = ctx.input
  const components = config.hybridComponents ?? ['percentage', 'time']
  const warnings: string[] = []
  const combinedBase = components.reduce(
    (sum, method) => sum + componentBaseFee(method, ctx, config, warnings),
    0,
  )
  // Finalize once: inject the combined base as `hours × 1` so the service applies
  // discount/disbursements/statutory/VAT/total without re-deriving the base fee.
  const def = buildFeeDefinition('time_based', { defaultHourlyRate: 1 }, config, resolveVatRate(input, config))
  const svc = calculateProfessionalFee(def, feeInput(input, { hours: combinedBase, hourlyRate: 1 }))
  return toToolboxResult(svc, ctx, config, warnings)
}

/** Registry of fee method providers keyed by framework `MethodType`. */
export const feeMethodProviders = {
  bracket: bracketFee,
  percentage: percentageFee,
  stage: stageApportion,
  time: timeCost,
  area: areaUnit,
  hybrid,
} as const
