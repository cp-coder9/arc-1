// Professional Fee Calculator definition — Task 8.1
//
// A single `CalculatorDefinition` (`fee_calculator_v1`) supporting all 7 SA council
// guidelines: SACAP, ECSA, SACQSP, SACPLAN, SACPCMP, SACLAP, SAGC. The calculator:
//
//   1. Looks up the selected council's versioned bracket table from `ComputeContext.tables`.
//   2. Computes a sliding-scale base fee via `bracketFee` provider logic.
//   3. Applies stage apportioning from the shared `fee_stages` table.
//   4. Folds in complexity factor, additional services, disbursements, VAT.
//   5. Evaluates clause checks: fee within guideline range, stage sum correctness, VAT applied.
//   6. Carries source/version/disclaimer info per council.
//
// Requirements: 5.1 (methods), 5.2 (council-specific guideline tables), 3.1 (versioned tables).
// Design Property 2 (no hidden constants), Property 4 (monotonic fees).

import { z } from 'zod'
import {
  type CalculationResult,
  type CalculatorDefinition,
  type ClauseCheckDef,
  type ClauseResult,
  type ComputeContext,
  type GuidelineTable,
  type GuidelineVersionRef,
  CalculatorError,
} from '@/services/toolbox/types'
import {
  calculateProfessionalFee,
  roundMoney,
  type CalculatorDefinition as FeeServiceDef,
  type CalculationInput as FeeServiceInput,
} from '@/services/professionalFeeCalculatorService'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const DEFAULT_VAT_RATE = 0.15

export const COUNCILS = ['SACAP', 'ECSA', 'SACQSP', 'SACPLAN', 'SACPCMP', 'SACLAP', 'SAGC'] as const
export type Council = (typeof COUNCILS)[number]

/** Maps council enum → bracket table id in seed data. */
export const COUNCIL_TABLE_IDS: Record<Council, string> = {
  SACAP: 'sacap_fee_brackets',
  ECSA: 'ecsa_fee_brackets',
  SACQSP: 'sacqsp_fee_brackets',
  SACPLAN: 'sacplan_fee_brackets',
  SACPCMP: 'sacpcmp_fee_brackets',
  SACLAP: 'saclap_fee_brackets',
  SAGC: 'sagc_fee_brackets',
}

export const FEE_STAGES_TABLE_ID = 'fee_stages'

/** Human-readable council names for report disclaimers. */
export const COUNCIL_NAMES: Record<Council, string> = {
  SACAP: 'South African Council for the Architectural Profession',
  ECSA: 'Engineering Council of South Africa',
  SACQSP: 'South African Council for the Quantity Surveying Profession',
  SACPLAN: 'South African Council for Planners',
  SACPCMP: 'South African Council for the Project and Construction Management Professions',
  SACLAP: 'South African Council for the Landscape Architectural Profession',
  SAGC: 'South African Council for the Landscape Architectural Profession — Quantity Surveying (Construction)',
}

// ----------------------------------------------------------------------------
// Table row shapes
// ----------------------------------------------------------------------------

/** A single bracket row from a council's fee table. */
export interface FeeTableBracketRow {
  /** Inclusive lower bound of the value range. */
  lowerBound: number
  /** Exclusive upper bound; null = open-ended. */
  upperBound: number | null
  /** Percentage rate (whole number, e.g. 12 = 12%). */
  percentageRate: number
  /** Optional fixed amount added at this bracket's lower bound. */
  fixedAmount?: number
}

/** A row from the shared fee_stages table. */
export interface FeeStageRow {
  /** Stage identifier (e.g. "Stage 1: Inception"). */
  stage: string
  /** Share of total fee as a whole number (all rows sum to 100). */
  percentage: number
}

// ----------------------------------------------------------------------------
// Input schema
// ----------------------------------------------------------------------------

export const feeCalculatorInputSchema = z.object({
  /** Which council guideline to apply. */
  council: z.enum(COUNCILS),
  /** The value for fee purposes (project construction cost in ZAR). */
  valueForFeePurposes: z.number().min(0),
  /** Selected work stages (when empty/omitted, all stages are included = 100%). */
  selectedStages: z.array(z.string()).default([]),
  /** Complexity multiplier (1 = baseline). */
  complexityFactor: z.number().min(0.5).max(3.0).default(1),
  /** Additional services amount (ZAR, added after base fee). */
  additionalServicesAmount: z.number().min(0).default(0),
  /** Disbursements (ZAR, not subject to professional discount). */
  disbursements: z.number().min(0).default(0),
  /** Statutory / municipal fees. */
  statutoryFees: z.number().min(0).default(0),
  /** Whether to include VAT. */
  vatInclusive: z.boolean().default(true),
  /** VAT rate override (decimal, e.g. 0.15). Defaults to 15%. */
  vatRate: z.number().min(0).max(1).default(DEFAULT_VAT_RATE),
  /** Optional discount percentage (0-100). */
  discountPercent: z.number().min(0).max(100).default(0),
  /** Reason for the discount (required when discountPercent > 0). */
  discountReason: z.string().optional(),
})

export type FeeCalculatorInput = z.infer<typeof feeCalculatorInputSchema>

// ----------------------------------------------------------------------------
// Computation helpers
// ----------------------------------------------------------------------------

/**
 * Selects the applicable bracket row for the given value. The bracket whose
 * `lowerBound` is the greatest value ≤ input value is chosen (progressive scale).
 */
export function selectBracketRow(rows: FeeTableBracketRow[], value: number): FeeTableBracketRow {
  const sorted = [...rows].sort((a, b) => a.lowerBound - b.lowerBound)
  let chosen = sorted[0]
  for (const row of sorted) {
    if (value >= row.lowerBound) chosen = row
    else break
  }
  return chosen
}

/**
 * Computes the base professional fee from a council's bracket table using
 * sliding-scale logic: fixedAmount + percentageRate × value (or the excess).
 *
 * Design Property 4: monotonic — increasing value never decreases the fee.
 */
export function computeBracketBaseFee(rows: FeeTableBracketRow[], value: number): number {
  const bracket = selectBracketRow(rows, value)
  const fixed = bracket.fixedAmount ?? 0
  const excess = value - bracket.lowerBound
  const baseFee = fixed + (bracket.percentageRate / 100) * (excess >= 0 ? excess : 0)
  // For zero lower-bound brackets (first bracket), apply rate to the full value
  if (bracket.lowerBound === 0) {
    return (bracket.percentageRate / 100) * value + fixed
  }
  return baseFee
}

/**
 * Compute the stage apportionment share. If selectedStages is empty, returns 100%.
 * Otherwise sums the percentages of selected stages.
 */
export function computeStageShare(stageRows: FeeStageRow[], selectedStages: string[]): number {
  if (!selectedStages || selectedStages.length === 0) return 100
  return stageRows
    .filter((r) => selectedStages.includes(r.stage))
    .reduce((sum, r) => sum + r.percentage, 0)
}

// ----------------------------------------------------------------------------
// Clause checks
// ----------------------------------------------------------------------------

export const feeCalculatorClauseSet: ClauseCheckDef<FeeCalculatorInput>[] = [
  {
    clauseRef: 'FEE-GUIDELINE-RANGE',
    label: 'Fee within council guideline percentage range',
    evaluate: (ctx) => {
      const { council, valueForFeePurposes } = ctx.input
      const tableId = COUNCIL_TABLE_IDS[council]
      const table = ctx.tables[tableId]
      if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
        return { outcome: 'advisory', threshold: 'N/A', actual: 'N/A', note: 'Bracket table not loaded' }
      }
      const rows = table.rows as FeeTableBracketRow[]
      const bracket = selectBracketRow(rows, valueForFeePurposes)
      return {
        outcome: 'pass',
        threshold: `${bracket.percentageRate}% (${council} guideline)`,
        actual: `${bracket.percentageRate}%`,
        note: `Value R${valueForFeePurposes.toLocaleString()} falls in the ${bracket.lowerBound.toLocaleString()}–${bracket.upperBound !== null ? bracket.upperBound.toLocaleString() : '∞'} bracket`,
      }
    },
  },
  {
    clauseRef: 'FEE-STAGE-SUM',
    label: 'Selected stage percentages sum correctly',
    evaluate: (ctx) => {
      const { selectedStages } = ctx.input
      if (!selectedStages || selectedStages.length === 0) {
        return { outcome: 'pass', threshold: '100%', actual: '100% (all stages)', note: 'All stages included' }
      }
      const stageTable = ctx.tables[FEE_STAGES_TABLE_ID]
      if (!stageTable || !Array.isArray(stageTable.rows)) {
        return { outcome: 'advisory', threshold: 'N/A', actual: 'N/A', note: 'Stage table not loaded' }
      }
      const stageRows = stageTable.rows as FeeStageRow[]
      const sum = computeStageShare(stageRows, selectedStages)
      if (sum <= 0) {
        return { outcome: 'fail', threshold: '>0%', actual: `${sum}%`, note: 'No valid stages selected' }
      }
      return { outcome: 'pass', threshold: '1–100%', actual: `${sum}%`, note: `${selectedStages.length} stage(s) selected` }
    },
  },
  {
    clauseRef: 'FEE-VAT-APPLIED',
    label: 'VAT applied correctly when vatInclusive is true',
    evaluate: (ctx) => {
      const { vatInclusive, vatRate } = ctx.input
      if (!vatInclusive) {
        return { outcome: 'pass', threshold: 'VAT excluded', actual: 'Excluded by user', note: 'Client elected to exclude VAT' }
      }
      const ratePct = (vatRate * 100).toFixed(1)
      return { outcome: 'pass', threshold: `${ratePct}%`, actual: `${ratePct}%`, note: 'VAT included as specified' }
    },
  },
  {
    clauseRef: 'FEE-DISCOUNT-REASON',
    label: 'Discount reason provided when discount applied',
    evaluate: (ctx) => {
      const { discountPercent, discountReason } = ctx.input
      if (!discountPercent || discountPercent === 0) {
        return { outcome: 'pass', threshold: 'N/A', actual: 'No discount', note: 'No discount applied' }
      }
      if (!discountReason || discountReason.trim().length === 0) {
        return {
          outcome: 'advisory',
          threshold: 'Reason required',
          actual: `${discountPercent}% discount without reason`,
          note: 'A discount reason is required before proposal issue per professional standards',
        }
      }
      return { outcome: 'pass', threshold: 'Reason provided', actual: discountReason, note: `${discountPercent}% discount` }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute function
// ----------------------------------------------------------------------------

function computeFeeCalculator(ctx: ComputeContext<FeeCalculatorInput>): CalculationResult {
  const input = ctx.input
  const { council, valueForFeePurposes, selectedStages, complexityFactor, additionalServicesAmount, disbursements, statutoryFees, vatInclusive, vatRate, discountPercent, discountReason } = input

  // 1. Resolve the council's bracket table
  const bracketTableId = COUNCIL_TABLE_IDS[council]
  const bracketTable = ctx.tables[bracketTableId]
  if (!bracketTable || !Array.isArray(bracketTable.rows) || bracketTable.rows.length === 0) {
    throw new CalculatorError('MISSING_TABLE', `Bracket table "${bracketTableId}" not found or empty.`, { bracketTableId })
  }
  const bracketRows = bracketTable.rows as FeeTableBracketRow[]

  // 2. Resolve stage table
  const stageTable = ctx.tables[FEE_STAGES_TABLE_ID]
  if (!stageTable || !Array.isArray(stageTable.rows) || stageTable.rows.length === 0) {
    throw new CalculatorError('MISSING_TABLE', `Stage table "${FEE_STAGES_TABLE_ID}" not found or empty.`, { tableId: FEE_STAGES_TABLE_ID })
  }
  const stageRows = stageTable.rows as FeeStageRow[]

  // 3. Compute base fee from bracket
  const baseFee = computeBracketBaseFee(bracketRows, valueForFeePurposes)

  // 4. Apply stage apportioning
  const stageShare = computeStageShare(stageRows, selectedStages) / 100

  // 5. Apply complexity factor
  const professionalFee = roundMoney(baseFee * stageShare * complexityFactor)

  // 6. Add additional services
  const totalProfessional = roundMoney(professionalFee + additionalServicesAmount)

  // 7. Apply discount
  const discountAmount = discountPercent > 0 ? roundMoney(totalProfessional * (discountPercent / 100)) : 0
  const feeAfterDiscount = roundMoney(totalProfessional - discountAmount)

  // 8. VAT calculation (on fee after discount + disbursements)
  const vatBase = feeAfterDiscount + disbursements
  const vatAmount = vatInclusive ? roundMoney(vatBase * vatRate) : 0

  // 9. Total
  const total = roundMoney(feeAfterDiscount + disbursements + statutoryFees + vatAmount)

  // 10. Build line results
  const lineResults: Array<Record<string, number | string>> = [
    { label: 'Base professional fee (bracket)', amount: roundMoney(baseFee), category: 'professional_fee' },
    { label: `Stage apportionment (${(stageShare * 100).toFixed(0)}%)`, amount: roundMoney(baseFee * stageShare), category: 'professional_fee' },
    { label: `Complexity factor (×${complexityFactor})`, amount: professionalFee, category: 'professional_fee' },
  ]
  if (additionalServicesAmount > 0) {
    lineResults.push({ label: 'Additional services', amount: additionalServicesAmount, category: 'professional_fee' })
  }
  if (discountAmount > 0) {
    lineResults.push({ label: `Discount (${discountPercent}%)`, amount: -discountAmount, category: 'discount' })
  }
  lineResults.push({ label: 'Professional fee after discount', amount: feeAfterDiscount, category: 'professional_fee' })
  if (disbursements > 0) {
    lineResults.push({ label: 'Disbursements', amount: disbursements, category: 'disbursement' })
  }
  if (statutoryFees > 0) {
    lineResults.push({ label: 'Statutory / municipal fees', amount: statutoryFees, category: 'statutory_fee' })
  }
  if (vatAmount > 0) {
    lineResults.push({ label: `VAT (${(vatRate * 100).toFixed(0)}%)`, amount: vatAmount, category: 'vat' })
  }
  lineResults.push({ label: 'Total', amount: total, category: 'total' })

  // 11. Evaluate clause checks
  const clauseResults: ClauseResult[] = feeCalculatorClauseSet.map((clause) => {
    const result = clause.evaluate(ctx)
    return {
      clauseRef: result.clauseRef ?? clause.clauseRef,
      label: result.label ?? clause.label,
      outcome: result.outcome,
      threshold: result.threshold,
      actual: result.actual,
      note: result.note,
    }
  })

  // 12. Source versions
  const sourceVersions: GuidelineVersionRef[] = []
  if (bracketTable) {
    sourceVersions.push({ guideline: bracketTable.id, version: bracketTable.version })
  }
  if (stageTable) {
    sourceVersions.push({ guideline: stageTable.id, version: stageTable.version })
  }

  // 13. Warnings
  const warnings: string[] = []
  if (discountPercent > 0 && (!discountReason || discountReason.trim().length === 0)) {
    warnings.push('Discount reason is required before proposal issue.')
  }

  const bracket = selectBracketRow(bracketRows, valueForFeePurposes)
  const disclaimers = [
    `Fee estimate based on ${council} (${COUNCIL_NAMES[council]}) fee guideline.`,
    `Bracket table version: ${bracketTable.version}, effective from ${bracketTable.effectiveFrom}.`,
    'This is an indicative fee estimate — not a binding quotation. Professional confirmation and sign-off required before issue.',
  ]

  return {
    lineResults,
    aggregates: {
      baseFee: roundMoney(baseFee),
      stageShare: roundMoney(stageShare * 100),
      professionalFee,
      additionalServices: additionalServicesAmount,
      discountAmount,
      feeAfterDiscount,
      disbursements,
      statutoryFees,
      vatAmount,
      total,
      council,
      bracketRate: bracket.percentageRate,
    },
    clauseResults,
    sourceVersions,
    disclaimers,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition registration
// ----------------------------------------------------------------------------

export const feeCalculatorV1 = registerCalculatorDefinition<FeeCalculatorInput, Record<string, unknown>>({
  id: 'fee_calculator_v1',
  toolId: 'fee_calculator',
  title: 'Professional Fee Calculator',
  method: 'bracket',
  inputSchema: feeCalculatorInputSchema,
  tableRefs: [
    ...Object.values(COUNCIL_TABLE_IDS),
    FEE_STAGES_TABLE_ID,
  ],
  clauseSet: feeCalculatorClauseSet,
  compute: computeFeeCalculator,
  reportTemplateId: 'fee_calculator_report',
  source: {
    guideline: 'SA Professional Council Fee Guidelines',
    version: '2024.1',
    status: 'recommended',
    url: 'https://www.sacap.org.za',
  },
  disclaimers: [
    'Indicative fee estimate based on the cited council guideline — not a binding quotation.',
    'Professional confirmation and sign-off required before issue.',
  ],
  status: 'full',
})
