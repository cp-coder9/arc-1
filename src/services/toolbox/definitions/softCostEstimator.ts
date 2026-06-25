// Soft Cost Estimator definition — Task 8.2
//
// A multi-discipline soft-cost estimator (`soft_cost_estimator_v1`) that:
//   1. Takes a construction cost/value as input
//   2. Allows selection of multiple disciplines (architect, engineer, QS, PM, etc.)
//   3. For each selected discipline, applies the relevant council bracket table
//   4. Adds municipal/statutory allowances (plan submission, building plan levy, occupancy cert)
//   5. Adds a contingency percentage
//   6. Produces a schedule of soft costs (line items per discipline + statutory)
//   7. Computes total soft costs and soft cost percentage of construction cost
//   8. Clause check: total soft cost within typical range (15-25% advisory)
//
// Requirements: 5.1 (methods), 5.3 (soft cost estimation).
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
import { computeBracketBaseFee, type FeeTableBracketRow } from './feeCalculator'
import { roundMoney } from '@/services/professionalFeeCalculatorService'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const DISCIPLINES = [
  'architect',
  'engineer',
  'quantity_surveyor',
  'project_manager',
  'town_planner',
  'landscape_architect',
  'energy_professional',
  'land_surveyor',
] as const

export type Discipline = (typeof DISCIPLINES)[number]

/** Maps discipline → bracket table id in seed data. */
export const DISCIPLINE_TABLE_IDS: Record<Discipline, string> = {
  architect: 'sacap_fee_brackets',
  engineer: 'ecsa_fee_brackets',
  quantity_surveyor: 'sacqsp_fee_brackets',
  project_manager: 'sacpcmp_fee_brackets',
  town_planner: 'sacplan_fee_brackets',
  landscape_architect: 'saclap_fee_brackets',
  energy_professional: 'sagc_fee_brackets',
  land_surveyor: 'sagc_fee_brackets',
}

/** Human-readable discipline labels. */
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  architect: 'Architect (SACAP)',
  engineer: 'Engineer (ECSA)',
  quantity_surveyor: 'Quantity Surveyor (SACQSP)',
  project_manager: 'Project Manager (SACPCMP)',
  town_planner: 'Town Planner (SACPLAN)',
  landscape_architect: 'Landscape Architect (SACLAP)',
  energy_professional: 'Energy Professional (SAGC)',
  land_surveyor: 'Land Surveyor (SAGC)',
}

export const MUNICIPAL_TABLE_ID = 'municipal_fee_allowances'

/** Municipal fee row shape from seedTables.json. */
export interface MunicipalFeeRow {
  feeType: string
  label: string
  ratePerM2?: number
  minFee?: number
  flatFee?: number
}

// ----------------------------------------------------------------------------
// Input schema
// ----------------------------------------------------------------------------

export const softCostInputSchema = z.object({
  /** Construction cost / value for fee purposes (ZAR). */
  constructionCost: z.number().min(0),
  /** Gross building area in m² — used for municipal rate × m² calculations. */
  buildingAreaM2: z.number().min(0).default(0),
  /** Selected professional disciplines to include in the soft cost estimate. */
  selectedDisciplines: z.array(z.enum(DISCIPLINES)).min(1),
  /** Municipal/statutory fee types to include. Empty = include all. */
  selectedMunicipalFees: z.array(z.string()).default([]),
  /** Contingency percentage (0–100). */
  contingencyPercent: z.number().min(0).max(100).default(5),
  /** Whether to include VAT on professional fees. */
  vatInclusive: z.boolean().default(true),
  /** VAT rate (decimal). */
  vatRate: z.number().min(0).max(1).default(0.15),
})

export type SoftCostInput = z.infer<typeof softCostInputSchema>

// ----------------------------------------------------------------------------
// Computation helpers
// ----------------------------------------------------------------------------

/**
 * Compute a municipal fee from its row definition.
 * Rows with `ratePerM2` use area × rate (floored at minFee).
 * Rows with `flatFee` use the flat amount directly.
 */
export function computeMunicipalFee(row: MunicipalFeeRow, areaM2: number): number {
  if (row.flatFee !== undefined) return row.flatFee
  if (row.ratePerM2 !== undefined) {
    const computed = row.ratePerM2 * areaM2
    return Math.max(computed, row.minFee ?? 0)
  }
  return 0
}

// ----------------------------------------------------------------------------
// Clause checks
// ----------------------------------------------------------------------------

export const softCostClauseSet: ClauseCheckDef<SoftCostInput>[] = [
  {
    clauseRef: 'SOFT-COST-RANGE',
    label: 'Total soft cost within typical percentage range (15–25% of construction cost)',
    evaluate: (ctx) => {
      const { constructionCost } = ctx.input
      if (constructionCost <= 0) {
        return { outcome: 'advisory', threshold: '15–25%', actual: 'N/A', note: 'Construction cost is zero' }
      }
      // We need the aggregates computed by the main compute, so re-derive here in a
      // simplified check (the full compute is the source of truth — this clause checks
      // the ratio conceptually). Since we only have ctx.input, not the result, we
      // compute it inline for the clause check.
      const tables = ctx.tables
      const disciplines = ctx.input.selectedDisciplines
      let totalProfessionalFees = 0
      for (const disc of disciplines) {
        const tableId = DISCIPLINE_TABLE_IDS[disc]
        const table = tables[tableId]
        if (table && Array.isArray(table.rows) && table.rows.length > 0) {
          totalProfessionalFees += computeBracketBaseFee(table.rows as FeeTableBracketRow[], constructionCost)
        }
      }

      // Municipal fees
      const municipalTable = tables[MUNICIPAL_TABLE_ID]
      let totalMunicipal = 0
      if (municipalTable && Array.isArray(municipalTable.rows)) {
        const municipalRows = municipalTable.rows as MunicipalFeeRow[]
        const selected = ctx.input.selectedMunicipalFees
        const rowsToUse = selected.length > 0
          ? municipalRows.filter((r) => selected.includes(r.feeType))
          : municipalRows
        for (const row of rowsToUse) {
          totalMunicipal += computeMunicipalFee(row, ctx.input.buildingAreaM2)
        }
      }

      const contingency = (totalProfessionalFees + totalMunicipal) * (ctx.input.contingencyPercent / 100)
      const totalSoftCost = totalProfessionalFees + totalMunicipal + contingency
      const pctOfConstruction = (totalSoftCost / constructionCost) * 100

      if (pctOfConstruction >= 15 && pctOfConstruction <= 25) {
        return {
          outcome: 'pass',
          threshold: '15–25%',
          actual: `${pctOfConstruction.toFixed(1)}%`,
          note: 'Soft costs within typical range',
        }
      }
      return {
        outcome: 'advisory',
        threshold: '15–25%',
        actual: `${pctOfConstruction.toFixed(1)}%`,
        note: pctOfConstruction < 15
          ? 'Soft costs below typical range — verify all disciplines included'
          : 'Soft costs above typical range — review scope or discount potential',
      }
    },
  },
  {
    clauseRef: 'SOFT-COST-CONTINGENCY',
    label: 'Contingency within normal range (3–10%)',
    evaluate: (ctx) => {
      const { contingencyPercent } = ctx.input
      if (contingencyPercent >= 3 && contingencyPercent <= 10) {
        return { outcome: 'pass', threshold: '3–10%', actual: `${contingencyPercent}%`, note: 'Contingency within normal range' }
      }
      return {
        outcome: 'advisory',
        threshold: '3–10%',
        actual: `${contingencyPercent}%`,
        note: contingencyPercent < 3
          ? 'Contingency below recommended minimum'
          : 'Contingency above normal range',
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute function
// ----------------------------------------------------------------------------

function computeSoftCost(ctx: ComputeContext<SoftCostInput>): CalculationResult {
  const input = ctx.input
  const { constructionCost, buildingAreaM2, selectedDisciplines, selectedMunicipalFees, contingencyPercent, vatInclusive, vatRate } = input

  const lineResults: Array<Record<string, number | string>> = []
  const sourceVersions: GuidelineVersionRef[] = []
  const warnings: string[] = []

  // 1. Compute fee for each selected discipline
  let totalProfessionalFees = 0
  for (const discipline of selectedDisciplines) {
    const tableId = DISCIPLINE_TABLE_IDS[discipline]
    const table = ctx.tables[tableId]
    if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
      warnings.push(`Bracket table "${tableId}" not found for ${discipline} — skipped.`)
      continue
    }
    const bracketRows = table.rows as FeeTableBracketRow[]
    const fee = computeBracketBaseFee(bracketRows, constructionCost)
    totalProfessionalFees += fee

    lineResults.push({
      label: DISCIPLINE_LABELS[discipline],
      amount: roundMoney(fee),
      category: 'professional_fee',
      discipline,
      tableId,
    })

    // Track source version
    if (!sourceVersions.some((sv) => sv.guideline === table.id)) {
      sourceVersions.push({ guideline: table.id, version: table.version })
    }
  }

  // 2. Municipal/statutory fees
  const municipalTable = ctx.tables[MUNICIPAL_TABLE_ID]
  let totalMunicipal = 0
  if (municipalTable && Array.isArray(municipalTable.rows)) {
    const municipalRows = municipalTable.rows as MunicipalFeeRow[]
    const rowsToUse = selectedMunicipalFees.length > 0
      ? municipalRows.filter((r) => selectedMunicipalFees.includes(r.feeType))
      : municipalRows

    for (const row of rowsToUse) {
      const fee = computeMunicipalFee(row, buildingAreaM2)
      totalMunicipal += fee
      lineResults.push({
        label: row.label,
        amount: roundMoney(fee),
        category: 'municipal_fee',
        feeType: row.feeType,
      })
    }
    sourceVersions.push({ guideline: municipalTable.id, version: municipalTable.version })
  } else {
    warnings.push('Municipal fee table not loaded — statutory fees excluded.')
  }

  // 3. Contingency
  const subtotal = totalProfessionalFees + totalMunicipal
  const contingencyAmount = roundMoney(subtotal * (contingencyPercent / 100))
  lineResults.push({
    label: `Contingency (${contingencyPercent}%)`,
    amount: contingencyAmount,
    category: 'contingency',
  })

  // 4. VAT
  const vatBase = totalProfessionalFees + contingencyAmount // VAT on professional fees + contingency (not on municipal)
  const vatAmount = vatInclusive ? roundMoney(vatBase * vatRate) : 0
  if (vatAmount > 0) {
    lineResults.push({
      label: `VAT (${(vatRate * 100).toFixed(0)}%)`,
      amount: vatAmount,
      category: 'vat',
    })
  }

  // 5. Totals
  const totalSoftCost = roundMoney(subtotal + contingencyAmount + vatAmount)
  const softCostPercentage = constructionCost > 0
    ? roundMoney((totalSoftCost / constructionCost) * 100)
    : 0

  lineResults.push({
    label: 'Total Soft Costs',
    amount: totalSoftCost,
    category: 'total',
  })

  // 6. Clause checks
  const clauseResults: ClauseResult[] = softCostClauseSet.map((clause) => {
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

  const disclaimers = [
    'Soft cost estimate based on applicable SA professional council fee guidelines.',
    'Municipal fees are indicative — confirm with relevant local authority.',
    'This is an indicative estimate — not a binding quotation. Professional confirmation required.',
  ]

  return {
    lineResults,
    aggregates: {
      constructionCost,
      totalProfessionalFees: roundMoney(totalProfessionalFees),
      totalMunicipalFees: roundMoney(totalMunicipal),
      contingencyAmount,
      vatAmount,
      totalSoftCost,
      softCostPercentage,
      disciplineCount: selectedDisciplines.length,
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

export const softCostEstimatorV1 = registerCalculatorDefinition<SoftCostInput, Record<string, unknown>>({
  id: 'soft_cost_estimator_v1',
  toolId: 'soft_cost_estimator',
  title: 'Multi-Discipline Soft Cost Estimator',
  method: 'hybrid',
  inputSchema: softCostInputSchema,
  tableRefs: [
    ...Object.values(DISCIPLINE_TABLE_IDS),
    MUNICIPAL_TABLE_ID,
  ],
  clauseSet: softCostClauseSet,
  compute: computeSoftCost,
  reportTemplateId: 'soft_cost_report',
  source: {
    guideline: 'SA Professional Council Fee Guidelines + Municipal Tariffs',
    version: '2024.1',
    status: 'indicative',
  },
  disclaimers: [
    'Indicative soft cost estimate based on applicable SA council fee guidelines and municipal tariffs.',
    'Professional confirmation and sign-off required before issue.',
  ],
  status: 'full',
})
