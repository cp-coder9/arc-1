// Firm-Wide Document Register calculator definition
//
// `firm_document_register_v1` (toolId `firm_document_register`) — a schedule-based tool
// for maintaining firm-level document registers with review dates and categorisation.
//
// Computes: count by category, count by status, count overdue reviews.
// Clause checks: no documents past review date, all have an owner.
//
// Requirements: 2.1, 8.1.

import { z } from 'zod'
import type {
  CalculationResult,
  CalculatorDefinition,
  ClauseCheckDef,
  ClauseResult,
  ComputeContext,
} from '@/services/toolbox/types'
import { evaluateClauseSet } from '@/services/toolbox/engine'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type DocumentCategory = 'policy' | 'procedure' | 'template' | 'form' | 'record'
export type DocumentStatus = 'current' | 'archived' | 'under_review'

export interface FirmDocumentRegisterRow {
  documentId: string
  title: string
  category: DocumentCategory
  version: string
  owner: string
  reviewDate: string
  status: DocumentStatus
}

export interface FirmDocumentRegisterInput {
  firmName: string
  registerId: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const firmDocumentRegisterRowSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(['policy', 'procedure', 'template', 'form', 'record']),
  version: z.string().min(1),
  owner: z.string(),
  reviewDate: z.string().min(1),
  status: z.enum(['current', 'archived', 'under_review']),
})

export const firmDocumentRegisterInputSchema = z.object({
  firmName: z.string().min(1),
  registerId: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const firmDocumentRegisterClauseSet: ClauseCheckDef<FirmDocumentRegisterInput, FirmDocumentRegisterRow>[] = [
  {
    clauseRef: 'FDR-001',
    label: 'No documents past review date',
    evaluate: (ctx) => {
      const today = new Date().toISOString().slice(0, 10)
      const overdue = ctx.rows.filter(
        (r) => r.status === 'current' && r.reviewDate && r.reviewDate < today,
      )
      return {
        outcome: overdue.length === 0 ? 'pass' : 'advisory',
        threshold: '0 overdue documents',
        actual: `${overdue.length} overdue document(s)`,
        note:
          overdue.length > 0
            ? `Documents past review date: ${overdue.map((r) => r.documentId).join(', ')}`
            : undefined,
      }
    },
  },
  {
    clauseRef: 'FDR-002',
    label: 'All documents have an owner',
    evaluate: (ctx) => {
      const noOwner = ctx.rows.filter((r) => !r.owner || r.owner.trim() === '')
      return {
        outcome: noOwner.length === 0 ? 'pass' : 'fail',
        threshold: '0 documents without owner',
        actual: `${noOwner.length} document(s) without owner`,
        note:
          noOwner.length > 0
            ? `Documents without owner: ${noOwner.map((r) => r.documentId).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Advisory only — this document register is a record-keeping aid. Ensure formal review and approval processes are followed.',
]

function compute(ctx: ComputeContext<FirmDocumentRegisterInput, FirmDocumentRegisterRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    documentId: row.documentId,
    title: row.title,
    category: row.category,
    version: row.version,
    owner: row.owner,
    reviewDate: row.reviewDate,
    status: row.status,
  }))

  // Count by category
  const countPolicy = rows.filter((r) => r.category === 'policy').length
  const countProcedure = rows.filter((r) => r.category === 'procedure').length
  const countTemplate = rows.filter((r) => r.category === 'template').length
  const countForm = rows.filter((r) => r.category === 'form').length
  const countRecord = rows.filter((r) => r.category === 'record').length

  // Count by status
  const countCurrent = rows.filter((r) => r.status === 'current').length
  const countArchived = rows.filter((r) => r.status === 'archived').length
  const countUnderReview = rows.filter((r) => r.status === 'under_review').length

  // Count overdue reviews
  const today = new Date().toISOString().slice(0, 10)
  const countOverdue = rows.filter(
    (r) => r.status === 'current' && r.reviewDate && r.reviewDate < today,
  ).length

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(firmDocumentRegisterClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      firmName: input.firmName,
      registerId: input.registerId,
      totalDocuments: rows.length,
      countPolicy,
      countProcedure,
      countTemplate,
      countForm,
      countRecord,
      countCurrent,
      countArchived,
      countUnderReview,
      countOverdue,
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

export const firmDocumentRegisterV1: CalculatorDefinition<FirmDocumentRegisterInput, FirmDocumentRegisterRow> =
  registerCalculatorDefinition<FirmDocumentRegisterInput, FirmDocumentRegisterRow>({
    id: 'firm_document_register_v1',
    toolId: 'firm_document_register',
    title: 'Firm-Wide Document Register',
    method: 'hybrid',
    inputSchema: firmDocumentRegisterInputSchema,
    scheduleSchema: firmDocumentRegisterRowSchema,
    tableRefs: [],
    clauseSet: firmDocumentRegisterClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'ISO 9001 Document Control',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
