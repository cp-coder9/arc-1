import { ProposalPersistenceService } from '../persistence/proposalPersistenceService';
import { InMemoryFirestoreAdapter } from '../persistence/runPersistenceService';
import type { ProposalInput, FeeCalculationResult, ProjectDetails, PartyDetails } from '../types';
import type { FeeProposalRecord } from '../persistence/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestCalculation(overrides?: Partial<FeeCalculationResult>): FeeCalculationResult {
  return {
    profession: 'architect',
    sourceVersionId: 'sv_test_1',
    formulaType: 'slidingScale',
    guidelineProfessionalFee: 350000,
    stageAdjustedFee: 315000,
    professionalFeeBeforeDiscount: 315000,
    discountAmount: 0,
    professionalFeeAfterDiscount: 315000,
    disbursementsTotal: 15000,
    statutoryFeesTotal: 5000,
    vatAmount: 50250,
    totalInclVat: 385250,
    lines: [
      { label: 'Professional Fee', amount: 315000, taxable: true, discountable: true },
      { label: 'Disbursements', amount: 15000, taxable: true, discountable: false },
    ],
    warnings: [],
    ...overrides,
  };
}

function createTestProject(overrides?: Partial<ProjectDetails>): ProjectDetails {
  return {
    name: 'Test Residence',
    clientName: 'John Smith',
    location: '12 Main Road, Cape Town',
    description: 'New residential build',
    ...overrides,
  };
}

function createTestProfessional(overrides?: Partial<PartyDetails>): PartyDetails {
  return {
    name: 'Jane Architect',
    email: 'jane@architects.co.za',
    company: 'JA Architects',
    registrationNumber: 'PrArch 12345',
    ...overrides,
  };
}

function createTestProposalInput(overrides?: Partial<ProposalInput>): ProposalInput {
  return {
    project: createTestProject(),
    professional: createTestProfessional(),
    calculation: createTestCalculation(),
    assumptions: ['Site access available'],
    exclusions: ['Specialist investigations'],
    notes: ['Fee valid for 30 days'],
    validityDays: 30,
    selectedTermsTemplateIds: ['standard-sa-professional'],
    customTerms: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProposalPersistenceService', () => {
  let db: InMemoryFirestoreAdapter;
  let service: ProposalPersistenceService;

  beforeEach(() => {
    db = new InMemoryFirestoreAdapter();
    service = new ProposalPersistenceService(db);
  });

  describe('createDraft', () => {
    it('creates a valid draft proposal with correct fields', async () => {
      const input = createTestProposalInput();
      const record = await service.createDraft(
        'run_123',
        input,
        'user_1',
        'architect',
        'sv_sacap_2021',
      );

      expect(record.id).toBeTruthy();
      expect(record.id.startsWith('proposal_')).toBe(true);
      expect(record.status).toBe('draft');
      expect(record.userId).toBe('user_1');
      expect(record.profession).toBe('architect');
      expect(record.runId).toBe('run_123');
      expect(record.sourceVersionId).toBe('sv_sacap_2021');
      expect(record.validityDays).toBe(30);
      expect(record.validUntil).toBeTruthy();
      expect(record.responsibilityConfirmed).toBe(false);
      expect(record.version).toBe(1);
      expect(record.createdAt).toBeTruthy();
      expect(record.document).toBeDefined();
      expect(record.document.status).toBe('draft');
      expect(record.document.project.name).toBe('Test Residence');
      expect(record.document.professional.name).toBe('Jane Architect');
    });

    it('persists the draft to the store', async () => {
      const input = createTestProposalInput();
      const record = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');

      const stored = await db.get('fee_proposals', record.id);
      expect(stored).not.toBeNull();
      expect((stored as Record<string, unknown>).id).toBe(record.id);
      expect((stored as Record<string, unknown>).status).toBe('draft');
    });
  });

  describe('issueProposal', () => {
    it('sets status to issued and auditHash is non-empty', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');

      const issued = await service.issueProposal(draft.id, true);

      expect(issued.status).toBe('issued');
      expect(issued.auditHash).toBeTruthy();
      expect(issued.auditHash!.length).toBeGreaterThan(0);
      expect(issued.auditHash!.startsWith('proposal-fnv1a32:')).toBe(true);
      expect(issued.issuedAt).toBeTruthy();
      expect(issued.responsibilityConfirmed).toBe(true);
      expect(issued.responsibilityConfirmedAt).toBeTruthy();
      expect(issued.document.status).toBe('issued');
      expect(issued.document.auditHash).toBe(issued.auditHash);
    });

    it('rejects when responsibilityConfirmed is false', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');

      await expect(service.issueProposal(draft.id, false)).rejects.toThrow(
        'Professional responsibility confirmation is required',
      );
    });

    it('throws when proposal not found', async () => {
      await expect(service.issueProposal('nonexistent', true)).rejects.toThrow(
        'Proposal not found',
      );
    });

    it('throws when trying to issue an already issued proposal', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');
      await service.issueProposal(draft.id, true);

      await expect(service.issueProposal(draft.id, true)).rejects.toThrow(
        'already issued and immutable',
      );
    });
  });

  describe('reviseProposal', () => {
    it('creates a new version with previousVersionId', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');
      await service.issueProposal(draft.id, true);

      const revised = await service.reviseProposal(draft.id);

      expect(revised.id).not.toBe(draft.id);
      expect(revised.version).toBe(draft.version + 1);
      expect(revised.previousVersionId).toBe(draft.id);
      expect(revised.status).toBe('draft');
      expect(revised.responsibilityConfirmed).toBe(false);
      expect(revised.auditHash).toBeUndefined();
      expect(revised.issuedAt).toBeUndefined();
      expect(revised.document.status).toBe('draft');
    });

    it('supersedes the original (original status becomes superseded)', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');
      await service.issueProposal(draft.id, true);

      await service.reviseProposal(draft.id);

      const original = await db.get('fee_proposals', draft.id) as unknown as FeeProposalRecord;
      expect(original.status).toBe('superseded');
    });

    it('throws when proposal not found', async () => {
      await expect(service.reviseProposal('nonexistent')).rejects.toThrow(
        'Proposal not found',
      );
    });
  });

  describe('acceptProposal', () => {
    it('sets status to accepted with timestamp', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');
      await service.issueProposal(draft.id, true);

      const accepted = await service.acceptProposal(draft.id);

      expect(accepted.status).toBe('accepted');
      expect(accepted.acceptedAt).toBeTruthy();
    });

    it('throws when proposal is not in issued status', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');

      await expect(service.acceptProposal(draft.id)).rejects.toThrow(
        "Cannot accept proposal with status 'draft'",
      );
    });

    it('throws when proposal not found', async () => {
      await expect(service.acceptProposal('nonexistent')).rejects.toThrow(
        'Proposal not found',
      );
    });
  });

  describe('immutability of issued proposals', () => {
    it('cannot be mutated after issue (attempting update throws)', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');
      await service.issueProposal(draft.id, true);

      await expect(
        service.updateProposal(draft.id, { validityDays: 60 }),
      ).rejects.toThrow("Cannot mutate proposal with status 'issued'");
    });

    it('cannot be mutated after acceptance', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');
      await service.issueProposal(draft.id, true);
      await service.acceptProposal(draft.id);

      await expect(
        service.updateProposal(draft.id, { validityDays: 60 }),
      ).rejects.toThrow("Cannot mutate proposal with status 'accepted'");
    });

    it('draft proposals can still be updated', async () => {
      const input = createTestProposalInput();
      const draft = await service.createDraft('run_1', input, 'user_1', 'architect', 'sv_1');

      // Should not throw
      await expect(
        service.updateProposal(draft.id, { validityDays: 60 }),
      ).resolves.toBeUndefined();

      const stored = await db.get('fee_proposals', draft.id) as Record<string, unknown>;
      expect(stored.validityDays).toBe(60);
    });
  });
});
