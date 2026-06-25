// AI Drawing Compliance Pre-check calculator definition
//
// `ai_drawing_checker_v1` (toolId `ai_drawing_checker`) evaluates drawing submissions
// against standard requirements: title block presence, north point, scale bar,
// dimensions, and drawing number format — based on drawing type.
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

export interface DrawingCheckRow {
  drawingType: string
  label: string
  requiresTitleBlock: boolean
  requiresNorthPoint: boolean
  requiresScaleBar: boolean
  requiresDimensions: boolean
  requiresDrawingNumber: boolean
  minScale: string
  notes: string
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

export const aiDrawingInputSchema = z.object({
  /** Drawing type (site_plan, floor_plan, section, elevation). */
  drawingType: z.string().min(1),
  /** Drawing scale (e.g. "1:100"). */
  scale: z.string().min(1),
  /** Whether the drawing has a north point. */
  hasNorthPoint: z.boolean(),
  /** Whether the drawing has a title block. */
  hasTitleBlock: z.boolean(),
  /** Whether the drawing has dimension annotations. */
  hasDimensions: z.boolean(),
  /** Whether the drawing has a scale bar. */
  hasScaleBar: z.boolean(),
  /** Drawing number (e.g. "A-101"). */
  drawingNumber: z.string(),
  /** Paper size (e.g. "A1", "A3"). */
  paperSize: z.string().min(1),
})
export type AiDrawingInput = z.infer<typeof aiDrawingInputSchema>

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function resolveDrawingReqs(ctx: ComputeContext<AiDrawingInput>): DrawingCheckRow {
  const table = ctx.tables.drawing_check_requirements as GuidelineTable<DrawingCheckRow>
  const row = table.rows.find(
    (r) => r.drawingType.toLowerCase() === ctx.input.drawingType.toLowerCase(),
  )
  if (!row) {
    throw new Error(
      `No drawing_check_requirements row for drawing type "${ctx.input.drawingType}"`,
    )
  }
  return row
}

/** Drawing number format: letter(s) + dash/hyphen + digits (e.g. A-101, SK-01). */
const DRAWING_NUMBER_PATTERN = /^[A-Za-z]{1,5}[-_]\d{1,5}$/

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const aiDrawingClauseSet: ClauseCheckDef<AiDrawingInput>[] = [
  {
    clauseRef: 'Drawing 1.1',
    label: 'Title block present',
    evaluate: (ctx) => {
      const reqs = resolveDrawingReqs(ctx)
      if (!reqs.requiresTitleBlock) {
        return {
          outcome: 'advisory',
          threshold: 'Not required for this drawing type',
          actual: ctx.input.hasTitleBlock ? 'Present' : 'Not present',
        }
      }
      return {
        outcome: ctx.input.hasTitleBlock ? 'pass' : 'fail',
        threshold: 'Required',
        actual: ctx.input.hasTitleBlock ? 'Present' : 'Not present',
      }
    },
  },
  {
    clauseRef: 'Drawing 1.2',
    label: 'North point present',
    evaluate: (ctx) => {
      const reqs = resolveDrawingReqs(ctx)
      if (!reqs.requiresNorthPoint) {
        return {
          outcome: 'advisory',
          threshold: 'Not required for this drawing type',
          actual: ctx.input.hasNorthPoint ? 'Present' : 'Not present',
          note: 'North point is optional for sections and elevations.',
        }
      }
      return {
        outcome: ctx.input.hasNorthPoint ? 'pass' : 'fail',
        threshold: 'Required',
        actual: ctx.input.hasNorthPoint ? 'Present' : 'Not present',
      }
    },
  },
  {
    clauseRef: 'Drawing 1.3',
    label: 'Scale bar present',
    evaluate: (ctx) => {
      const reqs = resolveDrawingReqs(ctx)
      if (!reqs.requiresScaleBar) {
        return {
          outcome: 'advisory',
          threshold: 'Not required for this drawing type',
          actual: ctx.input.hasScaleBar ? 'Present' : 'Not present',
        }
      }
      return {
        outcome: ctx.input.hasScaleBar ? 'pass' : 'fail',
        threshold: 'Required',
        actual: ctx.input.hasScaleBar ? 'Present' : 'Not present',
      }
    },
  },
  {
    clauseRef: 'Drawing 1.4',
    label: 'Dimensions annotated',
    evaluate: (ctx) => {
      const reqs = resolveDrawingReqs(ctx)
      if (!reqs.requiresDimensions) {
        return {
          outcome: 'advisory',
          threshold: 'Not required for this drawing type',
          actual: ctx.input.hasDimensions ? 'Present' : 'Not present',
        }
      }
      return {
        outcome: ctx.input.hasDimensions ? 'pass' : 'fail',
        threshold: 'Required',
        actual: ctx.input.hasDimensions ? 'Present' : 'Not present',
      }
    },
  },
  {
    clauseRef: 'Drawing 1.5',
    label: 'Drawing number in valid format',
    evaluate: (ctx) => {
      const valid = DRAWING_NUMBER_PATTERN.test(ctx.input.drawingNumber.trim())
      return {
        outcome: valid ? 'pass' : 'fail',
        threshold: 'Format: [A-Z]-[digits] (e.g. "A-101", "SK-01")',
        actual: ctx.input.drawingNumber || '(not provided)',
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this automated drawing check does not replace professional review.',
  'Drawings must still be reviewed by a qualified professional for technical compliance.',
  'Check results are based on declared attributes — actual drawing content verification requires AI/OCR analysis.',
]

function compute(ctx: ComputeContext<AiDrawingInput>): CalculationResult {
  const reqs = resolveDrawingReqs(ctx)
  const { clauseResults, complianceScore } = evaluateClauseSet(aiDrawingClauseSet, ctx)

  return {
    lineResults: [],
    aggregates: {
      drawingType: ctx.input.drawingType,
      drawingLabel: reqs.label,
      scale: ctx.input.scale,
      paperSize: ctx.input.paperSize,
      drawingNumber: ctx.input.drawingNumber,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings: [],
  }
}

/** `ai_drawing_checker_v1` — AI Drawing Compliance Pre-check. */
export const aiDrawingCheckerV1: CalculatorDefinition<AiDrawingInput> =
  registerCalculatorDefinition<AiDrawingInput, Record<string, unknown>>({
    id: 'ai_drawing_checker_v1',
    toolId: 'ai_drawing_checker',
    title: 'AI Drawing Compliance Pre-check',
    method: 'clauseSet',
    inputSchema: aiDrawingInputSchema,
    tableRefs: ['drawing_check_requirements'],
    clauseSet: aiDrawingClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Professional Drawing Standards (SA)',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
