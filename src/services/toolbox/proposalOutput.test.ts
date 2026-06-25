// Proposal Output Service — Unit Tests (Task 8.3)
//
// Validates: Requirements 5.4
// Design Property 5 (advisory invariant — every output carries disclaimers)

import { describe, it, expect, beforeEach } from 'vitest'
import type { CalculationResult } from '@/services/toolbox/types'
import {
  generateProposal,
  convertToAppointment,
  getPlatformFeeDisclosure,
  PLATFORM_FEE_PERCENT,
  DEFAULT_VALIDITY_DAYS,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_CANCELLATION_CLAUSE,
  STANDARD_ASSUMPTIONS,
  STANDARD_EXCLUSIONS,
  PROPOSAL_DISCLAIMERS,
  type ProposalOptions,
  type ProposalDocument,
} from './proposalOutput'

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

function createMockCalculationResult(overrides?: Partial<CalculationResult>): CalculationResult {
  return {
    lineResults: [
      { label: 'Base professional fee (bracket)', amount: 150000, category: 'professional_fee' },
      { label: 'Stage apportionment (60%)', amount: 90000, category: 'professional_fee' },
      { label: 'Complexity factor (×1.2)', amount: 108000, category: 'professional_fee' },
      { label: 'Professional fee after discount', amount: 108000, category: 'professional_fee' },
      { label: 'VAT (15%)', amount: 16200, category: 'vat' },
      { label: 'Total', amount: 124200, category: 'total' },
    ],
    aggregates: {
      baseFee: 150000,
      stageShare: 60,
      professionalFee: 108000,
      additionalServices: 0,
      discountAmount: 0,
      feeAfterDiscount: 108000,
      disbursements: 0,
      statutoryFees: 0,
      vatAmount: 16200,
      total: 124200,
      council: 'SACAP',
      bracketRate: 8,
    },
    clauseResults: [
      {
        clauseRef: 'FEE-GUIDELINE-RANGE',
        label: 'Fee within council guideline percentage range',
        outcome: 'pass',
        threshold: '8% (SACAP guideline)',
        actual: '8%',
      },
    ],
    sourceVersions: [
      { guideline: 'sacap_fee_brackets', version: '2024.1' },
      { guideline: 'fee_stages', version: '2024.1' },
    ],
    disclaimers: [
      'Fee estimate based on SACAP (South African Council for the Architectural Profession) fee guideline.',
      'Bracket table version: 2024.1, effective from 2024-01-01.',
      'This is an indicative fee estimate — not a binding quotation. Professional confirmation and sign-off required before issue.',
    ],
    warnings: [],
    ...overrides,
  }
}

function createMockProposalOptions(overrides?: Partial<ProposalOptions>): ProposalOptions {
  return {
    professionalName: 'John Architect',
    professionalRegistration: 'SACAP PrArch 12345',
    firmName: 'Smith & Associates Architects',
    clientName: 'Jane Client',
    projectName: 'Residential Extension — 42 Oak Road',
    projectAddress: '42 Oak Road, Sandton, Gauteng',
    selectedStages: ['Stage 1: Inception', 'Stage 2: Concept', 'Stage 3: Design Development'],
    selectedDisciplines: ['Architecture', 'Interior Design'],
    validityDays: 30,
    paymentTerms: 'Payment within 14 days of invoice',
    specialConditions: ['Client to provide geotechnical report before Stage 3'],
    ...overrides,
  }
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('ProposalOutput', () => {
  let feeResult: CalculationResult
  let options: ProposalOptions

  beforeEach(() => {
    feeResult = createMockCalculationResult()
    options = createMockProposalOptions()
  })

  describe('generateProposal', () => {
    it('generates a proposal with all fields populated', () => {
      const proposal = generateProposal(feeResult, options)

      expect(proposal.id).toBeTruthy()
      expect(proposal.createdAt).toBeTruthy()
      expect(proposal.professional.name).toBe('John Architect')
      expect(proposal.professional.registration).toBe('SACAP PrArch 12345')
      expect(proposal.professional.firm).toBe('Smith & Associates Architects')
      expect(proposal.client.name).toBe('Jane Client')
      expect(proposal.project.name).toBe('Residential Extension — 42 Oak Road')
      expect(proposal.project.address).toBe('42 Oak Road, Sandton, Gauteng')
      expect(proposal.scope.length).toBeGreaterThan(0)
      expect(proposal.assumptions.length).toBeGreaterThan(0)
      expect(proposal.exclusions.length).toBeGreaterThan(0)
      expect(proposal.terms.paymentTerms).toBe('Payment within 14 days of invoice')
      expect(proposal.terms.validityDays).toBe(30)
      expect(proposal.terms.cancellationClause).toBe(DEFAULT_CANCELLATION_CLAUSE)
      expect(proposal.feeBreakdown.total).toBe(124200)
      expect(proposal.feeBreakdown.vatAmount).toBe(16200)
      expect(proposal.feeBreakdown.council).toBe('SACAP')
      expect(proposal.platformFeeDisclosure).toBeTruthy()
      expect(proposal.specialConditions).toEqual(['Client to provide geotechnical report before Stage 3'])
      expect(proposal.disclaimers.length).toBeGreaterThan(0)
    })

    it('derives scope from selected stages', () => {
      const proposal = generateProposal(feeResult, options)

      expect(proposal.scope).toContain('Professional services for Stage 1: Inception.')
      expect(proposal.scope).toContain('Professional services for Stage 2: Concept.')
      expect(proposal.scope).toContain('Professional services for Stage 3: Design Development.')
    })

    it('derives scope from selected disciplines', () => {
      const proposal = generateProposal(feeResult, options)

      expect(proposal.scope).toContain('Architecture services included.')
      expect(proposal.scope).toContain('Interior Design services included.')
    })

    it('derives scope as full services when no stages selected', () => {
      const proposal = generateProposal(feeResult, { ...options, selectedStages: [] })

      expect(proposal.scope).toContain('Full professional services across all work stages.')
    })

    it('includes default assumptions', () => {
      const proposal = generateProposal(feeResult, options)

      for (const assumption of STANDARD_ASSUMPTIONS) {
        expect(proposal.assumptions).toContain(assumption)
      }
    })

    it('includes standard exclusions', () => {
      const proposal = generateProposal(feeResult, options)

      // Exclusions should be present (some may be filtered if disciplines overlap)
      expect(proposal.exclusions.length).toBeGreaterThan(0)
    })

    it('platform-fee disclosure is always present (Design Property 5)', () => {
      const proposal = generateProposal(feeResult, options)

      expect(proposal.platformFeeDisclosure).toBeTruthy()
      expect(proposal.platformFeeDisclosure).toContain('Architex platform')
      expect(proposal.platformFeeDisclosure).toContain(`${PLATFORM_FEE_PERCENT}%`)
      expect(proposal.platformFeeDisclosure).toContain('platform service fee')
      expect(proposal.platformFeeDisclosure).toContain('escrow system')
    })

    it('platform-fee disclosure present even with minimal options', () => {
      const minimalOptions: ProposalOptions = {
        professionalName: 'A Pro',
        professionalRegistration: 'REG-1',
        firmName: 'Firm',
        clientName: 'Client',
        projectName: 'Project',
        selectedStages: [],
      }
      const proposal = generateProposal(feeResult, minimalOptions)

      expect(proposal.platformFeeDisclosure).toContain('Architex platform')
      expect(proposal.platformFeeDisclosure).toContain(`${PLATFORM_FEE_PERCENT}%`)
    })

    it('validity period defaults to 30 days', () => {
      const proposalNoValidity = generateProposal(feeResult, {
        ...options,
        validityDays: undefined,
      })

      expect(proposalNoValidity.terms.validityDays).toBe(DEFAULT_VALIDITY_DAYS)
    })

    it('uses custom validity days when provided', () => {
      const proposal = generateProposal(feeResult, { ...options, validityDays: 60 })

      expect(proposal.terms.validityDays).toBe(60)
    })

    it('uses default payment terms when not provided', () => {
      const proposal = generateProposal(feeResult, { ...options, paymentTerms: undefined })

      expect(proposal.terms.paymentTerms).toBe(DEFAULT_PAYMENT_TERMS)
    })

    it('extracts fee breakdown correctly from CalculationResult', () => {
      const proposal = generateProposal(feeResult, options)

      expect(proposal.feeBreakdown.lineItems.length).toBeGreaterThan(0)
      expect(proposal.feeBreakdown.total).toBe(124200)
      expect(proposal.feeBreakdown.vatAmount).toBe(16200)
      expect(proposal.feeBreakdown.council).toBe('SACAP')

      // Verify individual line items extracted
      const labels = proposal.feeBreakdown.lineItems.map((li) => li.label)
      expect(labels).toContain('Base professional fee (bracket)')
      expect(labels).toContain('Total')
    })

    it('generates unique proposal IDs', () => {
      const p1 = generateProposal(feeResult, options)
      const p2 = generateProposal(feeResult, options)

      expect(p1.id).not.toBe(p2.id)
    })

    it('includes disclaimers (Design Property 5 — advisory invariant)', () => {
      const proposal = generateProposal(feeResult, options)

      expect(proposal.disclaimers.length).toBeGreaterThan(0)
      for (const disclaimer of PROPOSAL_DISCLAIMERS) {
        expect(proposal.disclaimers).toContain(disclaimer)
      }
    })

    it('handles empty special conditions', () => {
      const proposal = generateProposal(feeResult, { ...options, specialConditions: undefined })

      expect(proposal.specialConditions).toEqual([])
    })
  })

  describe('convertToAppointment', () => {
    let proposal: ProposalDocument

    beforeEach(() => {
      proposal = generateProposal(feeResult, options)
    })

    it('produces a valid appointment draft with status draft', () => {
      const draft = convertToAppointment(proposal)

      expect(draft.status).toBe('draft')
      expect(draft.createdFromTool).toBe('fee_calculator')
      expect(draft.sourceProposalId).toBe(proposal.id)
    })

    it('includes scope from proposal', () => {
      const draft = convertToAppointment(proposal)

      expect(draft.scope).toEqual(proposal.scope)
      expect(draft.scope.length).toBeGreaterThan(0)
    })

    it('includes fee amount from proposal total', () => {
      const draft = convertToAppointment(proposal)

      expect(draft.feeAmount).toBe(124200)
    })

    it('includes fee breakdown as record', () => {
      const draft = convertToAppointment(proposal)

      expect(Object.keys(draft.feeBreakdown).length).toBeGreaterThan(0)
      expect(draft.feeBreakdown['Base professional fee (bracket)']).toBe(150000)
      expect(draft.feeBreakdown['Total']).toBe(124200)
    })

    it('includes terms with platform-fee disclosure', () => {
      const draft = convertToAppointment(proposal)

      expect(draft.terms['paymentTerms']).toBeTruthy()
      expect(draft.terms['validityDays']).toBe('30')
      expect(draft.terms['cancellationClause']).toBeTruthy()
      expect(draft.terms['platformFeeDisclosure']).toContain('Architex platform')
    })

    it('does not mutate the original proposal scope array', () => {
      const originalScope = [...proposal.scope]
      const draft = convertToAppointment(proposal)
      draft.scope.push('extra item')

      expect(proposal.scope).toEqual(originalScope)
    })

    it('leaves professionalId/clientId/projectId undefined (to be filled by caller)', () => {
      const draft = convertToAppointment(proposal)

      expect(draft.professionalId).toBeUndefined()
      expect(draft.clientId).toBeUndefined()
      expect(draft.projectId).toBeUndefined()
    })
  })

  describe('getPlatformFeeDisclosure', () => {
    it('returns disclosure with default percentage', () => {
      const disclosure = getPlatformFeeDisclosure()

      expect(disclosure).toContain(`${PLATFORM_FEE_PERCENT}%`)
      expect(disclosure).toContain('Architex platform')
      expect(disclosure).toContain('escrow system')
      expect(disclosure).toContain('transparency')
    })

    it('returns disclosure with custom percentage', () => {
      const disclosure = getPlatformFeeDisclosure(7)

      expect(disclosure).toContain('7%')
      expect(disclosure).not.toContain(`${PLATFORM_FEE_PERCENT}%`)
    })
  })
})
