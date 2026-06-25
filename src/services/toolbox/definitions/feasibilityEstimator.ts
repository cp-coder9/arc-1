// Feasibility Estimator definition — Task 8.2
//
// A project budget/feasibility estimator (`feasibility_estimator_v1`) that:
//   1. Takes: land cost, construction area (m²), construction rate per m²,
//      contingency %, professional fee %, municipal allowances, finance costs,
//      marketing costs (for developers)
//   2. Computes: total construction cost, professional fees, municipal fees,
//      finance costs, total development cost, cost per m²
//   3. For developers: adds revenue projections (selling price/m², total GLA),
//      profit margin, development surplus/deficit
//   4. Clause checks: contingency within normal range, professional fee %
//      within council guideline range, feasibility surplus positive
//
// Requirements: 5.1 (methods), 5.3 (feasibility estimation).
// Design Property 2 (no hidden constants), Property 5 (advisory invariant).

import { z } from 'zod'
import {
  type CalculationResult,
  type CalculatorDefinition,
  type ClauseCheckDef,
  type ClauseResult,
  type ComputeContext,
  type GuidelineVersionRef,
  CalculatorError,
} from '@/services/toolbox/types'
import { roundMoney } from '@/services/professionalFeeCalculatorService'
import { registerCalculatorDefinition } from './definitionRegistry'
import { computeMunicipalFee, MUNICIPAL_TABLE_ID, type MunicipalFeeRow } from './softCostEstimator'

// ----------------------------------------------------------------------------
// Input schema
// ----------------------------------------------------------------------------

export const feasibilityInputSchema = z.object({
  /** Land / site acquisition cost (ZAR). */
  landCost: z.number().min(0),
  /** Gross construction area (m²). */
  constructionAreaM2: z.number().min(0),
  /** Construction rate per m² (ZAR/m²). */
  constructionRatePerM2: z.number().min(0),
  /** Contingency percentage on construction cost (0–100). */
  contingencyPercent: z.number().min(0).max(100).default(7.5),
  /** Professional fee percentage of construction cost (0–100). */
  professionalFeePercent: z.number().min(0).max(100).default(12),
  /** Municipal/statutory fees — either a lump sum or calculated from table. */
  municipalAllowance: z.number().min(0).default(0),
  /** Whether to calculate municipal fees from the seed table instead of using lump sum. */
  useMunicipalTable: z.boolean().default(false),
  /** Finance / interest costs (ZAR). */
  financeCosts: z.number().min(0).default(0),
  /** Marketing costs (ZAR) — typically for developer projects. */
  marketingCosts: z.number().min(0).default(0),
  /** Legal/transfer costs (ZAR). */
  legalCosts: z.number().min(0).default(0),

  // ─── Developer revenue projection ──────────────────────────
  /** Whether this is a developer feasibility (enables revenue projections). */
  isDeveloperFeasibility: z.boolean().default(false),
  /** Selling price per m² of GLA (ZAR/m²). */
  sellingPricePerM2: z.number().min(0).default(0),
  /** Gross Lettable Area (m²) — may differ from construction area. */
  grossLettableAreaM2: z.number().min(0).default(0),
  /** Target profit margin (%) — for clause check. */
  targetProfitMarginPercent: z.number().min(0).max(100).default(20),

  /** Whether to include VAT on the total development cost. */
  vatInclusive: z.boolean().default(false),
  /** VAT rate (decimal). */
  vatRate: z.number().min(0).max(1).default(0.15),
})

export type FeasibilityInput = z.infer<typeof feasibilityInputSchema>

// ----------------------------------------------------------------------------
// Clause checks
// ----------------------------------------------------------------------------

export const feasibilityClauseSet: ClauseCheckDef<FeasibilityInput>[] = [
  {
    clauseRef: 'FEAS-CONTINGENCY-RANGE',
    label: 'Contingency within normal range (5–10%)',
    evaluate: (ctx) => {
      const { contingencyPercent } = ctx.input
      if (contingencyPercent >= 5 && contingencyPercent <= 10) {
        return { outcome: 'pass', threshold: '5–10%', actual: `${contingencyPercent}%`, note: 'Contingency within normal range' }
      }
      if (contingencyPercent > 0 && contingencyPercent < 5) {
        return { outcome: 'advisory', threshold: '5–10%', actual: `${contingencyPercent}%`, note: 'Contingency below recommended minimum for feasibility' }
      }
      if (contingencyPercent > 10) {
        return { outcome: 'advisory', threshold: '5–10%', actual: `${contingencyPercent}%`, note: 'Contingency above normal feasibility range' }
      }
      return { outcome: 'advisory', threshold: '5–10%', actual: `${contingencyPercent}%`, note: 'No contingency applied' }
    },
  },
  {
    clauseRef: 'FEAS-PROFESSIONAL-FEE-RANGE',
    label: 'Professional fee % within council guideline range (8–18%)',
    evaluate: (ctx) => {
      const { professionalFeePercent } = ctx.input
      if (professionalFeePercent >= 8 && professionalFeePercent <= 18) {
        return { outcome: 'pass', threshold: '8–18%', actual: `${professionalFeePercent}%`, note: 'Professional fees within typical multi-discipline range' }
      }
      if (professionalFeePercent < 8) {
        return { outcome: 'advisory', threshold: '8–18%', actual: `${professionalFeePercent}%`, note: 'Professional fees below typical range — confirm scope' }
      }
      return { outcome: 'advisory', threshold: '8–18%', actual: `${professionalFeePercent}%`, note: 'Professional fees above typical range — confirm scope' }
    },
  },
  {
    clauseRef: 'FEAS-SURPLUS-POSITIVE',
    label: 'Feasibility surplus (revenue exceeds cost for developer projects)',
    evaluate: (ctx) => {
      const { isDeveloperFeasibility, sellingPricePerM2, grossLettableAreaM2, constructionAreaM2, constructionRatePerM2, landCost, contingencyPercent, professionalFeePercent, municipalAllowance, financeCosts, marketingCosts, legalCosts } = ctx.input
      if (!isDeveloperFeasibility) {
        return { outcome: 'pass', threshold: 'N/A', actual: 'Not a developer feasibility', note: 'Revenue check not applicable' }
      }
      const constructionCost = constructionAreaM2 * constructionRatePerM2
      const contingency = constructionCost * (contingencyPercent / 100)
      const professionalFees = constructionCost * (professionalFeePercent / 100)
      const totalDevCost = landCost + constructionCost + contingency + professionalFees + municipalAllowance + financeCosts + marketingCosts + legalCosts
      const gla = grossLettableAreaM2 > 0 ? grossLettableAreaM2 : constructionAreaM2
      const totalRevenue = sellingPricePerM2 * gla
      const surplus = totalRevenue - totalDevCost

      if (surplus > 0) {
        const margin = (surplus / totalDevCost) * 100
        return { outcome: 'pass', threshold: 'Surplus > 0', actual: `R${surplus.toLocaleString()} (${margin.toFixed(1)}%)`, note: 'Project feasible — positive surplus' }
      }
      return { outcome: 'fail', threshold: 'Surplus > 0', actual: `R${surplus.toLocaleString()} deficit`, note: 'Project shows negative feasibility — costs exceed revenue' }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute function
// ----------------------------------------------------------------------------

function computeFeasibility(ctx: ComputeContext<FeasibilityInput>): CalculationResult {
  const input = ctx.input
  const {
    landCost, constructionAreaM2, constructionRatePerM2, contingencyPercent,
    professionalFeePercent, municipalAllowance, useMunicipalTable, financeCosts,
    marketingCosts, legalCosts, isDeveloperFeasibility, sellingPricePerM2,
    grossLettableAreaM2, targetProfitMarginPercent, vatInclusive, vatRate,
  } = input

  const lineResults: Array<Record<string, number | string>> = []
  const sourceVersions: GuidelineVersionRef[] = []
  const warnings: string[] = []

  // 1. Construction cost
  const constructionCost = roundMoney(constructionAreaM2 * constructionRatePerM2)
  lineResults.push({ label: 'Land / Site Acquisition', amount: landCost, category: 'land' })
  lineResults.push({ label: `Construction (${constructionAreaM2.toLocaleString()} m² × R${constructionRatePerM2.toLocaleString()}/m²)`, amount: constructionCost, category: 'construction' })

  // 2. Contingency
  const contingencyAmount = roundMoney(constructionCost * (contingencyPercent / 100))
  lineResults.push({ label: `Contingency (${contingencyPercent}%)`, amount: contingencyAmount, category: 'contingency' })

  // 3. Professional fees
  const professionalFees = roundMoney(constructionCost * (professionalFeePercent / 100))
  lineResults.push({ label: `Professional Fees (${professionalFeePercent}%)`, amount: professionalFees, category: 'professional_fee' })

  // 4. Municipal fees
  let municipalFees = municipalAllowance
  if (useMunicipalTable) {
    const municipalTable = ctx.tables[MUNICIPAL_TABLE_ID]
    if (municipalTable && Array.isArray(municipalTable.rows)) {
      const rows = municipalTable.rows as MunicipalFeeRow[]
      municipalFees = 0
      for (const row of rows) {
        municipalFees += computeMunicipalFee(row, constructionAreaM2)
      }
      sourceVersions.push({ guideline: municipalTable.id, version: municipalTable.version })
    } else {
      warnings.push('Municipal fee table not available — using lump sum allowance.')
      municipalFees = municipalAllowance
    }
  }
  lineResults.push({ label: 'Municipal / Statutory Fees', amount: roundMoney(municipalFees), category: 'municipal_fee' })

  // 5. Finance costs
  if (financeCosts > 0) {
    lineResults.push({ label: 'Finance / Interest Costs', amount: financeCosts, category: 'finance' })
  }

  // 6. Marketing costs
  if (marketingCosts > 0) {
    lineResults.push({ label: 'Marketing Costs', amount: marketingCosts, category: 'marketing' })
  }

  // 7. Legal costs
  if (legalCosts > 0) {
    lineResults.push({ label: 'Legal / Transfer Costs', amount: legalCosts, category: 'legal' })
  }

  // 8. Total development cost
  const totalDevCostExVat = roundMoney(
    landCost + constructionCost + contingencyAmount + professionalFees +
    municipalFees + financeCosts + marketingCosts + legalCosts
  )

  const vatAmount = vatInclusive ? roundMoney(totalDevCostExVat * vatRate) : 0
  if (vatAmount > 0) {
    lineResults.push({ label: `VAT (${(vatRate * 100).toFixed(0)}%)`, amount: vatAmount, category: 'vat' })
  }

  const totalDevCost = roundMoney(totalDevCostExVat + vatAmount)
  lineResults.push({ label: 'Total Development Cost', amount: totalDevCost, category: 'total' })

  // 9. Cost per m²
  const costPerM2 = constructionAreaM2 > 0 ? roundMoney(totalDevCost / constructionAreaM2) : 0

  // 10. Developer revenue projections
  let totalRevenue = 0
  let surplus = 0
  let profitMarginPercent = 0
  const gla = grossLettableAreaM2 > 0 ? grossLettableAreaM2 : constructionAreaM2

  if (isDeveloperFeasibility && sellingPricePerM2 > 0) {
    totalRevenue = roundMoney(sellingPricePerM2 * gla)
    surplus = roundMoney(totalRevenue - totalDevCost)
    profitMarginPercent = totalDevCost > 0 ? roundMoney((surplus / totalDevCost) * 100) : 0

    lineResults.push({ label: `Revenue (${gla.toLocaleString()} m² GLA × R${sellingPricePerM2.toLocaleString()}/m²)`, amount: totalRevenue, category: 'revenue' })
    lineResults.push({ label: 'Development Surplus / (Deficit)', amount: surplus, category: 'surplus' })
  }

  // 11. Clause checks
  const clauseResults: ClauseResult[] = feasibilityClauseSet.map((clause) => {
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
    'This is an indicative feasibility estimate — not a formal development appraisal.',
    'Professional fees estimated as a percentage of construction cost — actual fees may vary per council guideline brackets.',
    'Municipal fees are indicative — confirm with relevant local authority.',
    'Professional confirmation and sign-off required before project commitment.',
  ]

  return {
    lineResults,
    aggregates: {
      landCost,
      constructionCost,
      contingencyAmount,
      professionalFees,
      municipalFees: roundMoney(municipalFees),
      financeCosts,
      marketingCosts,
      legalCosts,
      vatAmount,
      totalDevCost,
      costPerM2,
      totalRevenue,
      surplus,
      profitMarginPercent,
      gla,
      targetProfitMarginPercent,
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

export const feasibilityEstimatorV1 = registerCalculatorDefinition<FeasibilityInput, Record<string, unknown>>({
  id: 'feasibility_estimator_v1',
  toolId: 'feasibility_estimator',
  title: 'Project Feasibility & Budget Estimator',
  method: 'hybrid',
  inputSchema: feasibilityInputSchema,
  tableRefs: [MUNICIPAL_TABLE_ID],
  clauseSet: feasibilityClauseSet,
  compute: computeFeasibility,
  reportTemplateId: 'feasibility_report',
  source: {
    guideline: 'Property Development Feasibility Standards',
    version: '2024.1',
    status: 'indicative',
  },
  disclaimers: [
    'Indicative feasibility estimate — not a formal development appraisal.',
    'Professional confirmation and sign-off required before project commitment.',
  ],
  status: 'full',
})
