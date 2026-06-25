// Proposal Output Service — Task 8.3
//
// Takes a fee calculator `CalculationResult` and generates a structured proposal
// document containing scope, assumptions, exclusions, terms, and the Architex
// platform-fee disclosure. Also provides a convert-to-appointment function that
// produces an `AppointmentDraft` compatible with `appointmentService.ts`.
//
// Requirements: 5.4 (proposal output with scope, assumptions, exclusions, terms,
//   platform-fee disclosure, convertible to appointment).
// Design Property 5 (advisory invariant — every output carries disclaimers).

import type { CalculationResult } from '@/services/toolbox/types'

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/** Default platform fee percentage disclosed in proposals. */
export const PLATFORM_FEE_PERCENT = 5

/** Standard validity period in days when not specified. */
export const DEFAULT_VALIDITY_DAYS = 30

/** Standard cancellation clause text. */
export const DEFAULT_CANCELLATION_CLAUSE =
  'Either party may terminate this appointment by providing 14 days written notice. ' +
  'Fees for work completed to date shall be payable within 30 days of termination.'

/** Standard payment terms when not specified. */
export const DEFAULT_PAYMENT_TERMS =
  'Payment within 30 days of invoice. Milestone-based invoicing aligned to work stages.'

/** The Architex platform-fee disclosure (REQUIRED per NFR governance). */
export function getPlatformFeeDisclosure(feePercent: number = PLATFORM_FEE_PERCENT): string {
  return (
    `This proposal is prepared through the Architex platform. A platform service fee of ${feePercent}% is applicable ` +
    'on milestone payments processed through the platform escrow system. This fee is separate from the ' +
    'professional fees quoted above and is disclosed here for transparency.'
  )
}

/** Standard assumptions for professional proposals. */
export const STANDARD_ASSUMPTIONS: string[] = [
  'Site access will be provided by the client as required.',
  'Timely client decisions at each stage gate (within 10 business days).',
  'Existing site information and surveys provided by the client are accurate.',
  'No unforeseen ground conditions or structural defects.',
  'Statutory and municipal fees are estimated and subject to change.',
  'The project scope is as described and does not include significant variations.',
]

/** Standard exclusions for professional proposals. */
export const STANDARD_EXCLUSIONS: string[] = [
  'Geotechnical investigations and soil testing.',
  'Land surveying and topographic surveys (unless included in selected stages).',
  'Environmental impact assessments.',
  'Specialist structural or fire engineering (unless included as a discipline).',
  'Legal fees and conveyancing.',
  'Furniture, fittings, and equipment (FF&E) procurement.',
  'Construction cost escalation beyond the validity period.',
]

/** Standard disclaimers appended to every proposal (Design Property 5). */
export const PROPOSAL_DISCLAIMERS: string[] = [
  'This proposal is an indicative fee estimate — not a binding quotation until accepted.',
  'Professional confirmation and sign-off required before formal appointment issue.',
  'Fees are subject to revision if the project scope, complexity, or timeline changes materially.',
]

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface ProposalOptions {
  professionalName: string
  professionalRegistration: string // e.g. "SACAP PrArch 12345"
  firmName: string
  clientName: string
  projectName: string
  projectAddress?: string
  selectedStages: string[]
  selectedDisciplines?: string[]
  validityDays?: number // default 30
  paymentTerms?: string
  specialConditions?: string[]
}

export interface ProposalDocument {
  id: string
  createdAt: string
  professional: { name: string; registration: string; firm: string }
  client: { name: string }
  project: { name: string; address?: string }
  scope: string[]
  assumptions: string[]
  exclusions: string[]
  terms: { paymentTerms: string; validityDays: number; cancellationClause: string }
  feeBreakdown: {
    lineItems: Array<{ label: string; amount: number }>
    total: number
    vatAmount: number
    council: string
  }
  platformFeeDisclosure: string
  specialConditions: string[]
  disclaimers: string[]
}

export interface AppointmentDraft {
  professionalId?: string
  clientId?: string
  projectId?: string
  scope: string[]
  feeAmount: number
  feeBreakdown: Record<string, number>
  terms: Record<string, string>
  status: 'draft'
  sourceProposalId: string
  createdFromTool: 'fee_calculator'
}

// ----------------------------------------------------------------------------
// ID generation
// ----------------------------------------------------------------------------

let proposalCounter = 0

/**
 * Generates a unique proposal ID. Uses timestamp + counter for simplicity.
 * In production this would use a UUID or Firestore auto-ID.
 */
export function generateProposalId(): string {
  proposalCounter += 1
  return `prop-${Date.now()}-${proposalCounter}`
}

// ----------------------------------------------------------------------------
// Core: generateProposal
// ----------------------------------------------------------------------------

/**
 * Generates a structured proposal document from a fee calculation result.
 * Enriches the raw calculation with scope, assumptions, exclusions, terms,
 * and the mandatory platform-fee disclosure.
 */
export function generateProposal(
  feeResult: CalculationResult,
  options: ProposalOptions,
): ProposalDocument {
  const {
    professionalName,
    professionalRegistration,
    firmName,
    clientName,
    projectName,
    projectAddress,
    selectedStages,
    selectedDisciplines,
    validityDays = DEFAULT_VALIDITY_DAYS,
    paymentTerms,
    specialConditions = [],
  } = options

  // --- Scope derived from selected stages + disciplines ---
  const scope = deriveScope(selectedStages, selectedDisciplines)

  // --- Fee breakdown extracted from CalculationResult ---
  const feeBreakdown = extractFeeBreakdown(feeResult)

  // --- Exclusions: filter out items that ARE included ---
  const exclusions = deriveExclusions(selectedStages, selectedDisciplines)

  // --- Assemble ---
  const proposal: ProposalDocument = {
    id: generateProposalId(),
    createdAt: new Date().toISOString(),
    professional: {
      name: professionalName,
      registration: professionalRegistration,
      firm: firmName,
    },
    client: { name: clientName },
    project: { name: projectName, address: projectAddress },
    scope,
    assumptions: [...STANDARD_ASSUMPTIONS],
    exclusions,
    terms: {
      paymentTerms: paymentTerms ?? DEFAULT_PAYMENT_TERMS,
      validityDays,
      cancellationClause: DEFAULT_CANCELLATION_CLAUSE,
    },
    feeBreakdown,
    platformFeeDisclosure: getPlatformFeeDisclosure(),
    specialConditions,
    disclaimers: [...PROPOSAL_DISCLAIMERS],
  }

  return proposal
}

// ----------------------------------------------------------------------------
// Core: convertToAppointment
// ----------------------------------------------------------------------------

/**
 * Converts a proposal document to an appointment draft compatible with
 * `appointmentService.createAppointmentFromAcceptedProposal()`.
 */
export function convertToAppointment(proposal: ProposalDocument): AppointmentDraft {
  // Build fee breakdown as a flat record
  const feeBreakdown: Record<string, number> = {}
  for (const item of proposal.feeBreakdown.lineItems) {
    feeBreakdown[item.label] = item.amount
  }

  // Build terms record
  const terms: Record<string, string> = {
    paymentTerms: proposal.terms.paymentTerms,
    validityDays: String(proposal.terms.validityDays),
    cancellationClause: proposal.terms.cancellationClause,
    platformFeeDisclosure: proposal.platformFeeDisclosure,
  }

  return {
    scope: [...proposal.scope],
    feeAmount: proposal.feeBreakdown.total,
    feeBreakdown,
    terms,
    status: 'draft',
    sourceProposalId: proposal.id,
    createdFromTool: 'fee_calculator',
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Derives scope of work items from selected stages and disciplines.
 */
function deriveScope(selectedStages: string[], selectedDisciplines?: string[]): string[] {
  const scope: string[] = []

  if (selectedStages.length === 0) {
    scope.push('Full professional services across all work stages.')
  } else {
    for (const stage of selectedStages) {
      scope.push(`Professional services for ${stage}.`)
    }
  }

  if (selectedDisciplines && selectedDisciplines.length > 0) {
    for (const discipline of selectedDisciplines) {
      scope.push(`${discipline} services included.`)
    }
  }

  return scope
}

/**
 * Derives exclusions by filtering standard exclusions — items that overlap with
 * included disciplines/stages stay excluded unless explicitly covered.
 */
function deriveExclusions(selectedStages: string[], selectedDisciplines?: string[]): string[] {
  const includedLower = [
    ...(selectedStages ?? []).map((s) => s.toLowerCase()),
    ...(selectedDisciplines ?? []).map((d) => d.toLowerCase()),
  ]

  return STANDARD_EXCLUSIONS.filter((exclusion) => {
    // Keep exclusion unless the discipline/stage explicitly covers it
    const exclusionLower = exclusion.toLowerCase()
    if (includedLower.some((inc) => exclusionLower.includes(inc.split(':')[0]?.trim() ?? ''))) {
      return false
    }
    return true
  })
}

/**
 * Extracts a structured fee breakdown from the CalculationResult aggregates and lineResults.
 */
function extractFeeBreakdown(result: CalculationResult): ProposalDocument['feeBreakdown'] {
  // Extract line items from lineResults (filter to numeric amounts)
  const lineItems: Array<{ label: string; amount: number }> = result.lineResults
    .filter((row) => typeof row['amount'] === 'number' && typeof row['label'] === 'string')
    .map((row) => ({
      label: String(row['label']),
      amount: Number(row['amount']),
    }))

  // Extract totals from aggregates
  const total = typeof result.aggregates['total'] === 'number' ? result.aggregates['total'] : 0
  const vatAmount =
    typeof result.aggregates['vatAmount'] === 'number' ? result.aggregates['vatAmount'] : 0
  const council =
    typeof result.aggregates['council'] === 'string' ? result.aggregates['council'] : 'Unknown'

  return { lineItems, total, vatAmount, council }
}
