import type { ProposalDocument } from '../types';
import {
  writeProposalToPassport,
  createProposalInboxEvent,
  createAppointmentFromProposal,
  seedSpecForgeFromProposal,
  writeProposalAuditEntry,
} from '../adapters';
import type { ProjectFacts } from '../adapters';

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function createTestProposal(overrides?: Partial<ProposalDocument>): ProposalDocument {
  return {
    id: 'prop_001',
    title: 'Architectural Fee Proposal — Sandton Office Block',
    status: 'issued',
    project: {
      name: 'Sandton Office Block',
      clientName: 'Acme Developers (Pty) Ltd',
      location: 'Sandton, Gauteng',
      description: 'Mixed-use commercial development',
      reference: 'PRJ-2026-042',
    },
    professional: {
      name: 'John Smith',
      email: 'john@smitharchitects.co.za',
      company: 'Smith Architects',
      registrationNumber: 'SACAP-12345',
    },
    sections: [
      { heading: 'Stage 1 — Inception', body: ['Briefing and site analysis'] },
      { heading: 'Stage 2 — Concept Design', body: ['Concept sketches and massing'] },
      { heading: 'Stage 3 — Design Development', body: ['Detailed design and drawings'] },
      { heading: 'Scope of Work', body: ['Full architectural service'] },
    ],
    totals: {
      profession: 'architect',
      sourceVersionId: 'sv_sacap_2021',
      formulaType: 'slidingScale',
      guidelineProfessionalFee: 500000,
      stageAdjustedFee: 450000,
      professionalFeeBeforeDiscount: 450000,
      discountAmount: 0,
      professionalFeeAfterDiscount: 450000,
      disbursementsTotal: 25000,
      statutoryFeesTotal: 8000,
      vatAmount: 72450,
      totalInclVat: 555450,
      lines: [
        { label: 'Professional Fee', amount: 450000, taxable: true, discountable: true },
        { label: 'Disbursements', amount: 25000, taxable: true, discountable: false },
        { label: 'Statutory Fees', amount: 8000, taxable: false, discountable: false },
      ],
      warnings: [],
    },
    terms: ['Payment within 30 days of invoice', 'SACAP Code of Conduct applies'],
    acceptance: ['Client signature required'],
    auditHash: 'a1b2c3d4',
    createdAt: '2026-06-15T10:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Platform Spine Integration Adapters', () => {
  describe('writeProposalToPassport', () => {
    it('returns a valid ProjectRecord with correct type and recordType', () => {
      const proposal = createTestProposal();
      const result = writeProposalToPassport(proposal, 'project_abc');

      expect(result.type).toBe('PROFESSIONAL_PROPOSAL');
      expect(result.recordType).toBe('fee_proposal');
      expect(result.projectId).toBe('project_abc');
      expect(result.createdAt).toBeTruthy();
    });

    it('includes proposal data in the data field', () => {
      const proposal = createTestProposal();
      const result = writeProposalToPassport(proposal, 'project_abc');

      expect(result.data.proposalId).toBe('prop_001');
      expect(result.data.title).toBe('Architectural Fee Proposal — Sandton Office Block');
      expect(result.data.professionalName).toBe('John Smith');
      expect(result.data.professionalCompany).toBe('Smith Architects');
      expect(result.data.projectName).toBe('Sandton Office Block');
      expect(result.data.totalInclVat).toBe(555450);
      expect(result.data.profession).toBe('architect');
      expect(result.data.formulaType).toBe('slidingScale');
      expect(result.data.status).toBe('issued');
      expect(result.data.auditHash).toBe('a1b2c3d4');
    });

    it('uses the provided projectId', () => {
      const proposal = createTestProposal();
      const result = writeProposalToPassport(proposal, 'project_xyz_456');

      expect(result.projectId).toBe('project_xyz_456');
    });

    it('produces an ISO timestamp for createdAt', () => {
      const proposal = createTestProposal();
      const result = writeProposalToPassport(proposal, 'project_abc');

      // Verify it's a valid ISO date string
      const parsed = new Date(result.createdAt);
      expect(parsed.toISOString()).toBe(result.createdAt);
    });
  });

  describe('createProposalInboxEvent', () => {
    it('returns a valid WorkflowEvent with "Review and accept" action type', () => {
      const proposal = createTestProposal();
      const result = createProposalInboxEvent(proposal, 'client_001');

      expect(result.type).toBe('PROPOSAL_ISSUED');
      expect(result.actionType).toBe('Review and accept');
      expect(result.priority).toBe('high');
      expect(result.recipientId).toBe('client_001');
    });

    it('includes proposal context in data', () => {
      const proposal = createTestProposal();
      const result = createProposalInboxEvent(proposal, 'client_001');

      expect(result.data.proposalId).toBe('prop_001');
      expect(result.data.title).toBe('Architectural Fee Proposal — Sandton Office Block');
      expect(result.data.professionalName).toBe('John Smith');
      expect(result.data.projectName).toBe('Sandton Office Block');
      expect(result.data.totalInclVat).toBe(555450);
    });

    it('includes a human-readable message with formatted amount', () => {
      const proposal = createTestProposal();
      const result = createProposalInboxEvent(proposal, 'client_001');

      expect(result.data.message).toContain('Review and accept');
      expect(result.data.message).toContain('John Smith');
    });

    it('sets the recipientId to the provided clientId', () => {
      const proposal = createTestProposal();
      const result = createProposalInboxEvent(proposal, 'different_client');

      expect(result.recipientId).toBe('different_client');
    });
  });

  describe('createAppointmentFromProposal', () => {
    it('returns an AppointmentDraft with correct source proposal', () => {
      const proposal = createTestProposal();
      const projectFacts: ProjectFacts = {
        municipality: 'City of Johannesburg',
        province: 'Gauteng',
      };

      const result = createAppointmentFromProposal(proposal, projectFacts);

      expect(result.sourceProposalId).toBe('prop_001');
      expect(result.status).toBe('draft');
      expect(result.createdAt).toBeTruthy();
    });

    it('extracts scope stages from proposal sections', () => {
      const proposal = createTestProposal();
      const projectFacts: ProjectFacts = { municipality: 'Cape Town' };

      const result = createAppointmentFromProposal(proposal, projectFacts);

      // Should include sections with "Stage" or "Scope" in heading
      expect(result.scopeStages.length).toBeGreaterThan(0);
      expect(result.scopeStages).toContain('Stage 1 — Inception');
      expect(result.scopeStages).toContain('Stage 2 — Concept Design');
      expect(result.scopeStages).toContain('Stage 3 — Design Development');
      expect(result.scopeStages).toContain('Scope of Work');
    });

    it('includes professional and fee details', () => {
      const proposal = createTestProposal();
      const projectFacts: ProjectFacts = { municipality: 'Tshwane' };

      const result = createAppointmentFromProposal(proposal, projectFacts);

      expect(result.professionalName).toBe('John Smith');
      expect(result.professionalCompany).toBe('Smith Architects');
      expect(result.totalFeeInclVat).toBe(555450);
      expect(result.projectName).toBe('Sandton Office Block');
    });

    it('generates a projectId from project name and municipality', () => {
      const proposal = createTestProposal();
      const projectFacts: ProjectFacts = { municipality: 'Tshwane' };

      const result = createAppointmentFromProposal(proposal, projectFacts);

      expect(result.projectId).toContain('sandton');
      expect(result.projectId).toContain('tshwane');
    });

    it('handles missing municipality in projectFacts', () => {
      const proposal = createTestProposal();
      const projectFacts: ProjectFacts = {};

      const result = createAppointmentFromProposal(proposal, projectFacts);

      expect(result.projectId).toBeTruthy();
      expect(result.status).toBe('draft');
    });
  });

  describe('seedSpecForgeFromProposal', () => {
    it('returns SpecForge items derived from proposal sections', () => {
      const proposal = createTestProposal();
      const result = seedSpecForgeFromProposal(proposal, 'project_abc');

      expect(result.length).toBe(proposal.sections.length);
    });

    it('each item has correct structure', () => {
      const proposal = createTestProposal();
      const result = seedSpecForgeFromProposal(proposal, 'project_abc');

      for (const item of result) {
        expect(item.id).toBeTruthy();
        expect(item.type).toBe('specification_item');
        expect(item.title).toBeTruthy();
        expect(item.sourceProposalId).toBe('prop_001');
        expect(item.status).toBe('pending');
      }
    });

    it('derives titles from proposal section headings', () => {
      const proposal = createTestProposal();
      const result = seedSpecForgeFromProposal(proposal, 'project_abc');

      const titles = result.map((item) => item.title);
      expect(titles).toContain('Stage 1 — Inception');
      expect(titles).toContain('Stage 2 — Concept Design');
      expect(titles).toContain('Stage 3 — Design Development');
      expect(titles).toContain('Scope of Work');
    });

    it('generates unique ids for each item', () => {
      const proposal = createTestProposal();
      const result = seedSpecForgeFromProposal(proposal, 'project_abc');

      const ids = result.map((item) => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('includes sourceProposalId on all items', () => {
      const proposal = createTestProposal();
      const result = seedSpecForgeFromProposal(proposal, 'project_abc');

      for (const item of result) {
        expect(item.sourceProposalId).toBe(proposal.id);
      }
    });

    it('returns empty array for proposal with no sections', () => {
      const proposal = createTestProposal({ sections: [] });
      const result = seedSpecForgeFromProposal(proposal, 'project_abc');

      expect(result).toEqual([]);
    });
  });

  describe('writeProposalAuditEntry', () => {
    it('returns valid audit entry for "create" action', () => {
      const proposal = createTestProposal();
      const result = writeProposalAuditEntry('create', proposal);

      expect(result.action).toBe('create');
      expect(result.entityType).toBe('fee_proposal');
      expect(result.entityId).toBe('prop_001');
      expect(result.performedBy).toBe('John Smith');
      expect(result.timestamp).toBeTruthy();
    });

    it('returns valid audit entry for "issue" action', () => {
      const proposal = createTestProposal();
      const result = writeProposalAuditEntry('issue', proposal);

      expect(result.action).toBe('issue');
      expect(result.entityType).toBe('fee_proposal');
      expect(result.entityId).toBe('prop_001');
    });

    it('returns valid audit entry for "revise" action', () => {
      const proposal = createTestProposal();
      const result = writeProposalAuditEntry('revise', proposal);

      expect(result.action).toBe('revise');
      expect(result.entityType).toBe('fee_proposal');
      expect(result.entityId).toBe('prop_001');
    });

    it('returns valid audit entry for "accept" action', () => {
      const proposal = createTestProposal();
      const result = writeProposalAuditEntry('accept', proposal);

      expect(result.action).toBe('accept');
      expect(result.entityType).toBe('fee_proposal');
      expect(result.entityId).toBe('prop_001');
    });

    it('includes proposal metadata in data field', () => {
      const proposal = createTestProposal();
      const result = writeProposalAuditEntry('issue', proposal);

      expect(result.data).toBeDefined();
      expect(result.data!.proposalTitle).toBe('Architectural Fee Proposal — Sandton Office Block');
      expect(result.data!.projectName).toBe('Sandton Office Block');
      expect(result.data!.status).toBe('issued');
      expect(result.data!.totalInclVat).toBe(555450);
      expect(result.data!.auditHash).toBe('a1b2c3d4');
    });

    it('produces a valid ISO timestamp', () => {
      const proposal = createTestProposal();
      const result = writeProposalAuditEntry('create', proposal);

      const parsed = new Date(result.timestamp);
      expect(parsed.toISOString()).toBe(result.timestamp);
    });

    it('sets performedBy from the professional name', () => {
      const proposal = createTestProposal({
        professional: { name: 'Jane Doe', company: 'Doe Engineers' },
      });
      const result = writeProposalAuditEntry('create', proposal);

      expect(result.performedBy).toBe('Jane Doe');
    });
  });
});
