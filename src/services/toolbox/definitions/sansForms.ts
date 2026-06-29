// SANS / compliance forms autofill calculator definition
//
// `sans_forms_v1` (toolId `sans_forms`) is a completeness/schedule checker that verifies
// all required fields are present for a given compliance form type, professional
// registration is in valid format, and relevant annexures are referenced.
//
// This is more of a validation/completeness checker than a numerical calculator — it uses
// `method: 'clauseSet'` to produce pass/fail outcomes per required element.
//
// Requirements: 6.1, 6.2, 6.3, 6.4, 8.1.

import { z } from 'zod'
import type {
  CalculationResult,
  CalculatorDefinition,
  ClauseCheckDef,
  ClauseResult,
  ComputeContext,
  GuidelineTable,
} from '@/services/toolbox/types'
import { evaluateClauseSet } from '@/services/toolbox/engine'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface SansFormRow {
  formType: string
  label: string
  requiredFields: string[]
  annexures: string[]
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

export const sansFormsInputSchema = z.object({
  /** Form type (e.g. "rational_assessment", "certificate_compliance", "energy_declaration"). */
  formType: z.string().min(1),
  /** Building details (address, erf number, description, occupancy class, etc.). */
  buildingDetails: z.record(z.string()),
  /** Professional details (name, registration number, date, etc.). */
  professionalDetails: z.record(z.string()),
  /** Annexures provided (list of annexure identifiers). */
  annexuresProvided: z.array(z.string()),
})
export type SansFormsInput = z.infer<typeof sansFormsInputSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function resolveFormRequirements(ctx: ComputeContext<SansFormsInput>): SansFormRow {
  const table = ctx.tables.sans_form_requirements as GuidelineTable<SansFormRow>
  const row = table.rows.find(
    (r) => r.formType.toLowerCase() === ctx.input.formType.toLowerCase(),
  )
  if (!row) {
    throw new Error(`No sans_form_requirements row for form type "${ctx.input.formType}"`)
  }
  return row
}

/** SA professional registration format: 2-4 letters followed by digits (e.g. PrArch 12345). */
const REGISTRATION_PATTERN = /^[A-Za-z]{2,10}\s?\d{4,8}$/

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const sansFormsClauseSet: ClauseCheckDef<SansFormsInput>[] = [
  {
    clauseRef: 'Forms 1.1',
    label: 'All required fields present',
    evaluate: (ctx) => {
      const form = resolveFormRequirements(ctx)
      const allFields = { ...ctx.input.buildingDetails, ...ctx.input.professionalDetails }
      const missing = form.requiredFields.filter((f) => !allFields[f] || allFields[f].trim() === '')
      return {
        outcome: missing.length === 0 ? 'pass' : 'fail',
        threshold: `All ${form.requiredFields.length} required fields populated`,
        actual: missing.length === 0
          ? `All ${form.requiredFields.length} fields present`
          : `Missing: ${missing.join(', ')}`,
      }
    },
  },
  {
    clauseRef: 'Forms 1.2',
    label: 'Professional registration in valid format',
    evaluate: (ctx) => {
      const regNo = ctx.input.professionalDetails.professionalRegistration || ''
      const valid = REGISTRATION_PATTERN.test(regNo.trim())
      return {
        outcome: valid ? 'pass' : 'fail',
        threshold: 'Format: 2–10 letters + 4–8 digits (e.g. "PrArch 12345")',
        actual: regNo || '(not provided)',
      }
    },
  },
  {
    clauseRef: 'Forms 1.3',
    label: 'Required annexures referenced',
    evaluate: (ctx) => {
      const form = resolveFormRequirements(ctx)
      const provided = new Set(ctx.input.annexuresProvided.map((a) => a.toLowerCase()))
      const missing = form.annexures.filter((a) => !provided.has(a.toLowerCase()))
      return {
        outcome: missing.length === 0 ? 'pass' : 'fail',
        threshold: `All annexures: ${form.annexures.join(', ')}`,
        actual: missing.length === 0
          ? `All ${form.annexures.length} annexures referenced`
          : `Missing: ${missing.join(', ')}`,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this form completeness check does not validate the technical content of the submission.',
  'A registered professional must review and sign all statutory forms before submission.',
  'Form requirements may vary by municipality — confirm with the relevant local authority.',
]

function compute(ctx: ComputeContext<SansFormsInput>): CalculationResult {
  const form = resolveFormRequirements(ctx)
  const allFields = { ...ctx.input.buildingDetails, ...ctx.input.professionalDetails }
  const populatedCount = form.requiredFields.filter(
    (f) => allFields[f] && allFields[f].trim() !== '',
  ).length
  const providedAnnexures = ctx.input.annexuresProvided.length

  const { clauseResults, complianceScore } = evaluateClauseSet(sansFormsClauseSet, ctx)

  return {
    lineResults: [],
    aggregates: {
      formType: ctx.input.formType,
      formLabel: form.label,
      requiredFieldCount: form.requiredFields.length,
      populatedFieldCount: populatedCount,
      requiredAnnexureCount: form.annexures.length,
      providedAnnexureCount: providedAnnexures,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings: [],
  }
}

/** `sans_forms_v1` — SANS / compliance forms completeness checker. */
export const sansFormsV1: CalculatorDefinition<SansFormsInput> =
  registerCalculatorDefinition<SansFormsInput, Record<string, unknown>>({
    id: 'sans_forms_v1',
    toolId: 'sans_forms',
    title: 'SANS / Compliance Forms Autofill',
    method: 'clauseSet',
    inputSchema: sansFormsInputSchema,
    tableRefs: ['sans_form_requirements'],
    clauseSet: sansFormsClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'SANS 10400 / NBR Submission Requirements',
      version: '2024',
      status: 'mandatory',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
