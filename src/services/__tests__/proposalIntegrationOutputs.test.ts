import { projectRecordsFromProposal, documentOutputFromProposal, workflowEventsFromProposal, recommendationsFromProposal, type ProposalContext } from '../proposalIntegrationOutputs';
import type { ProposalBuilderResult } from '../../types/proposalBuilder';

function mockProposal(overrides: Partial<ProposalBuilderResult> = {}): ProposalBuilderResult {
  return {
    idSeed: 'test-prop-001', status: 'calculator_completed', title: 'Test Proposal',
    feeBeforeDiscountExVat: 200000, discountAmount: 0, feeAfterDiscountExVat: 200000,
    vatAmount: 30000, feeAfterDiscountIncVat: 230000,
    platformFee: { configVersion: '2026.1', chargeableBase: 200000, payerSharePercent: 0.5, payeeSharePercent: 0.5, payerPlatformFee: 1000, payeePlatformFee: 1000, totalPlatformFee: 2000, payerTotalIntoEscrow: 201000, payeeGrossRelease: 200000, payeeNetRelease: 199000, disclosure: 'Test.' },
    clientAmountPayableIntoEscrow: 231000, payeeNetReleaseAmount: 229000, architexPlatformRevenue: 2000,
    visibleLineItems: [{ id: 'f1', description: 'Fee', category: 'professional_fee', quantity: 1, unitPrice: 200000, total: 200000, chargeableForPlatformFee: true }],
    auditSnapshot: { calculatorId: 'calc1', calculatorVersion: 'v1', issuingUserId: 'u1', payerUserId: 'c1', payeeUserId: 'p1', payeeRole: 'architect', platformFeeConfigVersion: '2026.1', discount: null, termsTemplateId: 't1', termsTemplateVersion: 'v1', createdAt: new Date().toISOString() },
    ...overrides,
  };
}

const ctx: ProposalContext = { proposalId: 'test-prop-001', tenantId: 't1', projectId: 'p1', professionalName: 'J. Smith', professionalRole: 'architect', clientName: 'Demo' };

describe('proposalIntegrationOutputs', () => {
  it('generates 5 ProjectRecords', () => {
    const records = projectRecordsFromProposal(mockProposal(), ctx);
    expect(records.length).toBe(5);
    const types = records.map(r => r.recordType);
    expect(types).toContain('proposal');
    expect(types).toContain('scope_baseline');
    expect(types).toContain('fee_calculation_snapshot');
    expect(types).toContain('terms_snapshot');
    expect(types).toContain('professional_appointment_draft');
  });

  it('marks issued when proposal is issued', () => {
    const records = projectRecordsFromProposal(mockProposal({ status: 'issued' }), ctx);
    expect(records[0].status).toBe('issued');
  });

  it('generates document output', () => {
    const doc = documentOutputFromProposal(mockProposal(), 'p1', 'proj1', 'Smith');
    expect(doc.documentId).toBe('doc-p1');
    expect(doc.revision).toBe('rev A');
    expect(doc.documentType).toBe('proposal_pdf');
  });

  it('generates revision B when superseding', () => {
    const doc = documentOutputFromProposal(mockProposal(), 'p2', 'proj1', 'Smith', 'p1');
    expect(doc.revision).toBe('rev B');
  });

  it('generates terms review event for calculator_completed', () => {
    const events = workflowEventsFromProposal(mockProposal({ status: 'calculator_completed' }), 'p1', 'proj1', 'architect');
    expect(events.some(e => e.type === 'terms_review_required')).toBe(true);
  });

  it('generates issued event for issued proposals', () => {
    const events = workflowEventsFromProposal(mockProposal({ status: 'issued' }), 'p1', 'proj1', 'architect');
    expect(events.some(e => e.type === 'proposal_issued')).toBe(true);
  });

  it('generates recommendations', () => {
    const events = workflowEventsFromProposal(mockProposal({ status: 'calculator_completed' }), 'p1', 'proj1', 'architect');
    const recs = recommendationsFromProposal(mockProposal({ status: 'calculator_completed' }), 'p1', 'proj1', events, 'architect');
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].requiresHumanApproval).toBeDefined();
  });

  it('sorts recommendations by priority', () => {
    const events = workflowEventsFromProposal(mockProposal({ status: 'issued' }), 'p1', 'proj1', 'architect');
    const recs = recommendationsFromProposal(mockProposal({ status: 'issued' }), 'p1', 'proj1', events, 'architect');
    const weights: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    for (let i = 1; i < recs.length; i++) expect(weights[recs[i - 1].priority]).toBeGreaterThanOrEqual(weights[recs[i].priority]);
  });

  it('generates acceptance recommendation for accepted proposals', () => {
    const events = workflowEventsFromProposal(mockProposal({ status: 'accepted' }), 'p1', 'proj1', 'architect');
    const recs = recommendationsFromProposal(mockProposal({ status: 'accepted' }), 'p1', 'proj1', events, 'architect');
    expect(recs.some(r => r.title.includes('appointment'))).toBe(true);
  });
});
