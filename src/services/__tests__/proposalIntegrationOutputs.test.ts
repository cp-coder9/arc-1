import {
  projectRecordsFromProposal,
  documentOutputFromProposal,
  workflowEventsFromProposal,
  recommendationsFromProposal,
  type ProjectRecord,
  type DocumentOutput,
  type WorkflowEvent,
  type AgentRecommendation,
  type ProposalContext,
} from '../proposalIntegrationOutputs';
import type { ProposalBuilderResult } from '../../types/proposalBuilder';

function mockProposal(overrides: Partial<ProposalBuilderResult> = {}): ProposalBuilderResult {
  return {
    idSeed: 'test-prop-001',
    status: 'calculator_completed',
    title: 'Architectural professional services proposal',
    feeBeforeDiscountExVat: 200000,
    discountAmount: 0,
    feeAfterDiscountExVat: 200000,
    vatAmount: 30000,
    feeAfterDiscountIncVat: 230000,
    platformFee: {
      configVersion: 'architex-platform-fee-2026.1',
      chargeableBase: 200000,
      payerSharePercent: 0.5,
      payeeSharePercent: 0.5,
      payerPlatformFee: 1000,
      payeePlatformFee: 1000,
      totalPlatformFee: 2000,
      payerTotalIntoEscrow: 201000,
      payeeGrossRelease: 200000,
      payeeNetRelease: 199000,
      disclosure: 'Test disclosure.',
    },
    clientAmountPayableIntoEscrow: 231000,
    payeeNetReleaseAmount: 229000,
    architexPlatformRevenue: 2000,
    visibleLineItems: [
      { id: 'fee1', description: 'Professional fee', category: 'professional_fee', quantity: 1, unitPrice: 200000, total: 200000, chargeableForPlatformFee: true },
      { id: 'pf1', description: 'Platform fee (client)', category: 'platform_fee', quantity: 1, unitPrice: 1000, total: 1000, chargeableForPlatformFee: false },
    ],
    auditSnapshot: {
      calculatorId: 'architect_sacap_fee',
      calculatorVersion: '0.1-draft',
      issuingUserId: 'arch-1',
      payerUserId: 'client-1',
      payeeUserId: 'arch-1',
      payeeRole: 'architect',
      platformFeeConfigVersion: 'architex-platform-fee-2026.1',
      discount: null,
      termsTemplateId: 'architex-standard-professional-services',
      termsTemplateVersion: '2026.1',
      createdAt: new Date().toISOString(),
      scopeSummary: 'Fee estimate from calculator.',
    },
    ...overrides,
  };
}

const context: ProposalContext = {
  proposalId: 'test-prop-001',
  tenantId: 'tenant-demo',
  projectId: 'project-demo',
  professionalName: 'J. Smith PrArch',
  professionalRole: 'architect',
  clientName: 'Demo Client',
};

describe('proposalIntegrationOutputs', () => {
  describe('projectRecordsFromProposal', () => {
    it('generates 5 ProjectRecord outputs', () => {
      const proposal = mockProposal();
      const records = projectRecordsFromProposal(proposal, context);

      expect(records).toHaveLength(5);

      const types = records.map((r) => r.recordType);
      expect(types).toContain('proposal');
      expect(types).toContain('scope_baseline');
      expect(types).toContain('fee_calculation_snapshot');
      expect(types).toContain('terms_snapshot');
      expect(types).toContain('professional_appointment_draft');
    });

    it('all records have required fields', () => {
      const proposal = mockProposal();
      const records = projectRecordsFromProposal(proposal, context);

      records.forEach((record) => {
        expect(record.id).toBeTruthy();
        expect(record.tenantId).toBe(context.tenantId);
        expect(record.projectId).toBe(context.projectId);
        expect(record.recordType).toBeTruthy();
        expect(record.title).toBeTruthy();
        expect(record.status).toBeTruthy();
        expect(record.payload).toBeDefined();
        expect(record.approvals).toBeDefined();
        expect(typeof record.approvals.required).toBe('boolean');
        expect(record.audit).toBeDefined();
        expect(record.audit.createdBy).toBeTruthy();
        expect(record.audit.createdAt).toBeTruthy();
        expect(Array.isArray(record.linkedRecordIds)).toBe(true);
      });
    });

    it('marks records as issued when proposal is issued', () => {
      const proposal = mockProposal({ status: 'issued' });
      const records = projectRecordsFromProposal(proposal, context);

      const proposalRecord = records.find((r) => r.recordType === 'proposal');
      expect(proposalRecord!.status).toBe('issued');

      const scopeRecord = records.find((r) => r.recordType === 'scope_baseline');
      expect(scopeRecord!.status).toBe('issued');
    });

    it('marks records as draft when proposal is draft', () => {
      const proposal = mockProposal({ status: 'draft' });
      const records = projectRecordsFromProposal(proposal, context);

      const proposalRecord = records.find((r) => r.recordType === 'proposal');
      expect(proposalRecord!.status).toBe('draft');
    });

    it('appointment draft record always starts as draft', () => {
      const proposal = mockProposal({ status: 'issued' });
      const records = projectRecordsFromProposal(proposal, context);

      const apptRecord = records.find((r) => r.recordType === 'professional_appointment_draft');
      expect(apptRecord!.status).toBe('draft');
      expect(apptRecord!.approvals.required).toBe(true);
      expect(apptRecord!.approvals.pendingRoles).toContain('client');
      expect(apptRecord!.approvals.pendingRoles).toContain('architect');
    });

    it('includes platform fee details in proposal record payload', () => {
      const proposal = mockProposal();
      const records = projectRecordsFromProposal(proposal, context);

      const proposalRecord = records.find((r) => r.recordType === 'proposal');
      const payload = proposalRecord!.payload as Record<string, unknown>;
      expect(payload.totalExVat).toBe(200000);
      expect(payload.vatAmount).toBe(30000);
      expect(payload.clientPaysIntoEscrow).toBe(231000);
    });

    it('fee calculation snapshot includes discount info', () => {
      const proposal = mockProposal({
        discountAmount: 10000,
        auditSnapshot: {
          ...mockProposal().auditSnapshot,
          discount: { percentage: 5, amount: 10000, reason: 'Promo', appliedBy: 'arch-1', appliedAt: new Date().toISOString() },
        },
      });
      const records = projectRecordsFromProposal(proposal, context);

      const feeRecord = records.find((r) => r.recordType === 'fee_calculation_snapshot');
      const payload = feeRecord!.payload as Record<string, unknown>;
      expect(payload.discount).toBeDefined();
      expect(payload.feeBeforeDiscount).toBe(200000);
      expect(payload.discountAmount).toBe(10000);
    });
  });

  describe('documentOutputFromProposal', () => {
    it('generates document output placeholder', () => {
      const proposal = mockProposal();
      const doc = documentOutputFromProposal(proposal, 'prop-1', 'project-1', 'J. Smith PrArch');

      expect(doc.documentId).toBe('doc-prop-1');
      expect(doc.projectId).toBe('project-1');
      expect(doc.title).toContain('J. Smith PrArch');
      expect(doc.documentType).toBe('proposal_pdf');
      expect(doc.revision).toBe('rev A');
      expect(doc.status).toBe('draft');
      expect(doc.placeholderNote).toBeTruthy();
    });

    it('uses revision B when superseding', () => {
      const proposal = mockProposal();
      const doc = documentOutputFromProposal(proposal, 'prop-2', 'project-1', 'J. Smith PrArch', 'prop-1');

      expect(doc.documentId).toBe('doc-prop-2');
      expect(doc.revision).toBe('rev B');
      expect(doc.status).toBe('draft');
    });

    it('marks issued status for issued proposals', () => {
      const proposal = mockProposal({ status: 'issued' });
      const doc = documentOutputFromProposal(proposal, 'prop-3', 'project-1', 'J. Smith PrArch');

      expect(doc.status).toBe('issued');
    });
  });

  describe('workflowEventsFromProposal', () => {
    it('generates terms review event for calculator_completed proposals', () => {
      const proposal = mockProposal({ status: 'calculator_completed' });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');

      const termsEvent = events.find((e) => e.type === 'terms_review_required');
      expect(termsEvent).toBeDefined();
      expect(termsEvent!.priority).toBe('medium');
      expect(termsEvent!.assignedRoles).toContain('architect');
    });

    it('generates proposal_ready_for_review when professionally approved', () => {
      const proposal = mockProposal({ status: 'professional_approved' });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');

      const reviewEvent = events.find((e) => e.type === 'proposal_ready_for_review');
      expect(reviewEvent).toBeDefined();
      expect(reviewEvent!.priority).toBe('high');
    });

    it('generates proposal_issued and acceptance events for issued proposals', () => {
      const proposal = mockProposal({
        status: 'issued',
        terms: { validityPeriodDays: 14 },
        auditSnapshot: { ...mockProposal().auditSnapshot, createdAt: new Date().toISOString() },
      });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');

      const issuedEvent = events.find((e) => e.type === 'proposal_issued');
      expect(issuedEvent).toBeDefined();
      expect(issuedEvent!.assignedRoles).toContain('client');

      const acceptanceEvent = events.find((e) => e.type === 'proposal_accepted');
      expect(acceptanceEvent).toBeDefined();
    });

    it('generates expiry warning for proposals about to expire', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 12); // With 14 day validity, 2 days remain
      const proposal = mockProposal({
        status: 'issued',
        terms: { validityPeriodDays: 14 },
        auditSnapshot: { ...mockProposal().auditSnapshot, createdAt: threeDaysAgo.toISOString() },
      });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');

      const expiryEvent = events.find((e) => e.type === 'proposal_expiring');
      expect(expiryEvent).toBeDefined();
    });

    it('generates acceptance conversion event for accepted proposals', () => {
      const proposal = mockProposal({ status: 'accepted' });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');

      const acceptedEvent = events.find(
        (e) => e.type === 'proposal_accepted' && e.detail.includes('Convert'),
      );
      expect(acceptedEvent).toBeDefined();
    });

    it('detects missing discount reason', () => {
      const proposal = mockProposal({
        discountAmount: 10000,
        auditSnapshot: {
          ...mockProposal().auditSnapshot,
          discount: { percentage: 5, amount: 10000, appliedBy: 'arch-1', appliedAt: new Date().toISOString() },
        },
      });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');

      const riskEvent = events.find((e) => e.type === 'risk_detected');
      expect(riskEvent).toBeDefined();
      expect(riskEvent!.detail).toContain('reason');
    });

    it('every event has required fields', () => {
      const proposal = mockProposal({ status: 'issued', terms: { validityPeriodDays: 14 } });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');

      events.forEach((event) => {
        expect(event.id).toBeTruthy();
        expect(event.type).toBeTruthy();
        expect(event.projectId).toBe('project-1');
        expect(event.title).toBeTruthy();
        expect(event.detail).toBeTruthy();
        expect(event.priority).toBeTruthy();
        expect(event.sourceModule).toBe('proposal_builder');
        expect(event.assignedRoles.length).toBeGreaterThan(0);
        expect(event.createdAt).toBeTruthy();
        expect(event.actionUrl).toBeTruthy();
      });
    });
  });

  describe('recommendationsFromProposal', () => {
    it('generates recommendations for draft proposals', () => {
      const proposal = mockProposal({ status: 'calculator_completed' });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');
      const recs = recommendationsFromProposal(proposal, 'prop-1', 'project-1', events, 'architect');

      expect(recs.length).toBeGreaterThan(0);
      // Should have "Attach terms" recommendation for calculator_completed
      const termsRec = recs.find((r) => r.title.includes('terms'));
      expect(termsRec).toBeDefined();
      expect(termsRec!.requiresHumanApproval).toBe(true);
    });

    it('generates recommendations for issued proposals', () => {
      const proposal = mockProposal({ status: 'issued' });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');
      const recs = recommendationsFromProposal(proposal, 'prop-1', 'project-1', events, 'architect');

      const acceptanceRec = recs.find((r) => r.title.includes('acceptance'));
      expect(acceptanceRec).toBeDefined();
    });

    it('generates appointment conversion recommendation for accepted', () => {
      const proposal = mockProposal({ status: 'accepted' });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');
      const recs = recommendationsFromProposal(proposal, 'prop-1', 'project-1', events, 'architect');

      const convRec = recs.find((r) => r.title.includes('appointment'));
      expect(convRec).toBeDefined();
    });

    it('sorts recommendations by priority (highest first)', () => {
      const proposal = mockProposal({ status: 'issued' });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');
      const recs = recommendationsFromProposal(proposal, 'prop-1', 'project-1', events, 'architect');

      const priorityWeights: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
      for (let i = 1; i < recs.length; i++) {
        const prevWeight = priorityWeights[recs[i - 1].priority] || 0;
        const currWeight = priorityWeights[recs[i].priority] || 0;
        expect(prevWeight).toBeGreaterThanOrEqual(currWeight);
      }
    });

    it('every recommendation has required fields', () => {
      const proposal = mockProposal({ status: 'issued', terms: { validityPeriodDays: 14 } });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');
      const recs = recommendationsFromProposal(proposal, 'prop-1', 'project-1', events, 'architect');

      recs.forEach((rec) => {
        expect(rec.id).toBeTruthy();
        expect(rec.title).toBeTruthy();
        expect(rec.rationale).toBeTruthy();
        expect(rec.priority).toBeTruthy();
        expect(rec.recommendedActionLabel).toBeTruthy();
        expect(rec.relatedRoute).toBeTruthy();
        expect(typeof rec.requiresHumanApproval).toBe('boolean');
        expect(['user', 'project']).toContain(rec.scope);
      });
    });

    it('flags discount without reason as high priority', () => {
      const proposal = mockProposal({
        discountAmount: 5000,
        auditSnapshot: {
          ...mockProposal().auditSnapshot,
          discount: { percentage: 5, amount: 5000, appliedBy: 'arch-1', appliedAt: new Date().toISOString() },
        },
      });
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-1', 'architect');
      const recs = recommendationsFromProposal(proposal, 'prop-1', 'project-1', events, 'architect');

      const discountRec = recs.find((r) => r.title.includes('discount'));
      expect(discountRec).toBeDefined();
      expect(discountRec!.priority).toBe('high');
    });
  });

  describe('end-to-end integration output flow', () => {
    it('generates all outputs for an issued proposal', () => {
      const proposal = mockProposal({
        status: 'issued',
        discountAmount: 0,
        terms: { validityPeriodDays: 14 },
      });
      const records = projectRecordsFromProposal(proposal, context);
      const doc = documentOutputFromProposal(proposal, 'prop-1', 'project-demo', 'J. Smith PrArch');
      const events = workflowEventsFromProposal(proposal, 'prop-1', 'project-demo', 'architect');
      const recs = recommendationsFromProposal(proposal, 'prop-1', 'project-demo', events, 'architect');

      // All output types should have data
      expect(records.length).toBe(5);
      expect(doc).toBeDefined();
      expect(events.length).toBeGreaterThan(0);
      expect(recs.length).toBeGreaterThan(0);

      // Events should be relevant to issued state
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('proposal_issued');
    });
  });
});
