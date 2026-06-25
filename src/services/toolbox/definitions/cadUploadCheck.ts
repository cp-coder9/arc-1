// CAD/BIM File Upload + Drawing Checker calculator definition
//
// `cad_upload_check_v1` (toolId `cad_upload_check`) evaluates uploaded CAD/BIM files
// against standard requirements: file format acceptability, file size limits, layer naming
// conventions, georeference presence for site plans, and revision numbering.
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

export interface CadUploadRow {
  format: string
  label: string
  acceptedVersions: string[]
  maxFileSizeMB: number
  requiresLayerNaming: boolean
  requiresGeoreference: boolean
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

export const cadUploadInputSchema = z.object({
  /** File format (dwg, dxf, ifc, pdf). */
  fileFormat: z.string().min(1),
  /** File size in MB. */
  fileSizeMB: z.number().min(0),
  /** Whether the file follows layer naming conventions. */
  layerNamingFollowed: z.boolean(),
  /** Whether the file is georeferenced. */
  georeferenced: z.boolean(),
  /** Drawing number. */
  drawingNumber: z.string(),
  /** Revision identifier (e.g. "A", "01", "P1"). */
  revision: z.string(),
  /** Whether this is a site plan (triggers georeference requirement). */
  isSitePlan: z.boolean(),
})
export type CadUploadInput = z.infer<typeof cadUploadInputSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function resolveFormat(ctx: ComputeContext<CadUploadInput>): CadUploadRow {
  const table = ctx.tables.cad_upload_standards as GuidelineTable<CadUploadRow>
  const row = table.rows.find(
    (r) => r.format.toLowerCase() === ctx.input.fileFormat.toLowerCase(),
  )
  if (!row) {
    throw new Error(
      `No cad_upload_standards row for file format "${ctx.input.fileFormat}"`,
    )
  }
  return row
}

/** Revision format: letter(s), or digits, or P/C prefix + digits (e.g. "A", "01", "P1", "C2"). */
const REVISION_PATTERN = /^[A-Za-z]\d{0,3}$|^\d{1,4}$/

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const cadUploadClauseSet: ClauseCheckDef<CadUploadInput>[] = [
  {
    clauseRef: 'CAD 1.1',
    label: 'File format acceptable',
    evaluate: (ctx) => {
      const fmt = resolveFormat(ctx)
      return {
        outcome: 'pass',
        threshold: `Accepted format: ${fmt.label}`,
        actual: `${ctx.input.fileFormat.toUpperCase()} (${fmt.label})`,
      }
    },
  },
  {
    clauseRef: 'CAD 1.2',
    label: 'File size within limit',
    evaluate: (ctx) => {
      const fmt = resolveFormat(ctx)
      return {
        outcome: ctx.input.fileSizeMB <= fmt.maxFileSizeMB ? 'pass' : 'fail',
        threshold: `<= ${fmt.maxFileSizeMB} MB (${fmt.label})`,
        actual: `${ctx.input.fileSizeMB} MB`,
      }
    },
  },
  {
    clauseRef: 'CAD 1.3',
    label: 'Layer naming convention followed',
    evaluate: (ctx) => {
      const fmt = resolveFormat(ctx)
      if (!fmt.requiresLayerNaming) {
        return {
          outcome: 'advisory',
          threshold: 'Not required for this format',
          actual: ctx.input.layerNamingFollowed ? 'Followed' : 'Not followed',
          note: 'Layer naming is optional for this file format.',
        }
      }
      return {
        outcome: ctx.input.layerNamingFollowed ? 'pass' : 'fail',
        threshold: 'Required (standard layer naming convention)',
        actual: ctx.input.layerNamingFollowed ? 'Followed' : 'Not followed',
      }
    },
  },
  {
    clauseRef: 'CAD 1.4',
    label: 'Georeference present for site plans',
    evaluate: (ctx) => {
      if (!ctx.input.isSitePlan) {
        return {
          outcome: 'advisory',
          threshold: 'Only required for site plans',
          actual: ctx.input.georeferenced ? 'Present' : 'Not present',
          note: 'Georeference check applies to site plans only.',
        }
      }
      const fmt = resolveFormat(ctx)
      const required = fmt.requiresGeoreference || ctx.input.isSitePlan
      return {
        outcome: required && !ctx.input.georeferenced ? 'fail' : 'pass',
        threshold: 'Required for site plans',
        actual: ctx.input.georeferenced ? 'Present' : 'Not present',
      }
    },
  },
  {
    clauseRef: 'CAD 1.5',
    label: 'Revision numbering in valid format',
    evaluate: (ctx) => {
      const valid = REVISION_PATTERN.test(ctx.input.revision.trim())
      return {
        outcome: valid ? 'pass' : 'fail',
        threshold: 'Format: letter(s) or digits (e.g. "A", "01", "P1")',
        actual: ctx.input.revision || '(not provided)',
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this file upload check validates metadata and declared attributes, not file content.',
  'File integrity and detailed layer/object verification require opening the file in native software.',
  'Georeference checks are metadata-based — survey accuracy must be confirmed by a professional.',
]

function compute(ctx: ComputeContext<CadUploadInput>): CalculationResult {
  const fmt = resolveFormat(ctx)
  const { clauseResults, complianceScore } = evaluateClauseSet(cadUploadClauseSet, ctx)

  return {
    lineResults: [],
    aggregates: {
      fileFormat: ctx.input.fileFormat,
      formatLabel: fmt.label,
      fileSizeMB: ctx.input.fileSizeMB,
      maxFileSizeMB: fmt.maxFileSizeMB,
      layerNamingFollowed: ctx.input.layerNamingFollowed ? 'Yes' : 'No',
      georeferenced: ctx.input.georeferenced ? 'Yes' : 'No',
      drawingNumber: ctx.input.drawingNumber,
      revision: ctx.input.revision,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings: [],
  }
}

/** `cad_upload_check_v1` — CAD/BIM File Upload + Drawing Checker. */
export const cadUploadCheckV1: CalculatorDefinition<CadUploadInput> =
  registerCalculatorDefinition<CadUploadInput, Record<string, unknown>>({
    id: 'cad_upload_check_v1',
    toolId: 'cad_upload_check',
    title: 'CAD / BIM File Upload + Drawing Checker',
    method: 'clauseSet',
    inputSchema: cadUploadInputSchema,
    tableRefs: ['cad_upload_standards'],
    clauseSet: cadUploadClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'SA CAD/BIM Standards',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
