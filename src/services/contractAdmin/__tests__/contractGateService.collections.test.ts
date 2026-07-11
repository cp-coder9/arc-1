/**
 * Unit tests for writeContractActionToCollections (Task 6.3)
 *
 * Tests that contract actions (generation, signature, lock, variation) are
 * written to ProjectRecord, Passport, Inbox, and Audit collections.
 *
 * Requirements: 4.4, 4.5, 4.8
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock Firebase Admin SDK ─────────────────────────────────────────────────

const mockCreate = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDocGet = vi.fn();
const mockQueryGet = vi.fn();

const queryMock = {
  where: vi.fn(),
  get: mockQueryGet,
};
queryMock.where.mockReturnValue(queryMock);

const mockDoc = vi.fn().mockReturnValue({
  get: mockDocGet,
  create: mockCreate,
  set: mockSet,
});

const collectionCalls: string[] = [];
const mockCollection = vi.fn().mockImplementation((path: string) => {
  collectionCalls.push(path);
  return {
    doc: mockDoc,
    where: queryMock.where,
    get: mockQueryGet,
  };
});

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (path: string) => mockCollection(path),
  },
}));

vi.mock('@/services/finance/auditTrailService', () => ({
  writeImmutableAuditRecord: vi.fn().mockResolvedValue('audit-id-mock'),
}));

import {
  writeContractActionToCollections,
  generateContractFromProposal,
  signContract,
  lockContract,
  createContractVariation,
} from '../contractGateService';
import type { ContractActionRecord, ContractInstance, ContractTemplate, SignatureAuthority, ContractGateVariationInput } from '../contractGateService';

// ── Test Data ───────────────────────────────────────────────────────────────

const mockProposal = {
  projectId: 'project-1',
  parties: [
    { uid: 'user-a', role: 'client', signatureRequired: true },
    { uid: 'user-b', role: 'contractor', signatureRequired: true },
  ],
  specialConditions: [],
  redlineAnnotations: [],
  status: 'accepted',
};

const mockTemplate: ContractTemplate = {
  templateId: 'template-1',
  version: 3,
  documentType: 'construction_contract',
  body: 'Contract body template...',
  specialConditionSlots: 50,
  active: true,
};

const mockAuthority: SignatureAuthority = {
  authorityId: 'auth-1',
  uid: 'user-a',
  documentTypes: ['construction_contract'],
  representingParty: 'client',
  validFrom: '2024-01-01T00:00:00.000Z',
  validTo: '2030-12-31T23:59:59.999Z',
  active: true,
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('writeContractActionToCollections (Requirement 4.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionCalls.length = 0;
  });

  describe('writeContractActionToCollections', () => {
    it('writes to all four collections: project_records, project_passports, inbox_items, audit_logs', async () => {
      const action: ContractActionRecord = {
        actionId: 'action-1',
        projectId: 'project-1',
        contractId: 'contract-1',
        actionType: 'contract_generated',
        actorUid: 'system',
        actorRole: 'system',
        timestampIso: '2026-01-15T10:00:00.000Z',
        description: 'Contract generated from proposal',
      };

      await writeContractActionToCollections(action);

      // Should create 4 documents (one per collection)
      expect(mockCreate).toHaveBeenCalledTimes(4);

      // Check all four collections were targeted
      expect(collectionCalls).toContain('project_records');
      expect(collectionCalls).toContain('project_passports');
      expect(collectionCalls).toContain('inbox_items');
      expect(collectionCalls).toContain('audit_logs');
    });

    it('includes correct fields in project_records entry', async () => {
      const action: ContractActionRecord = {
        actionId: 'action-2',
        projectId: 'project-2',
        contractId: 'contract-2',
        actionType: 'contract_locked',
        actorUid: 'user-a',
        actorRole: 'client',
        timestampIso: '2026-02-01T12:00:00.000Z',
        description: 'Contract locked',
        metadata: { lockedVersion: 3 },
      };

      await writeContractActionToCollections(action);

      // The first create call should contain project record data
      const createCalls = mockCreate.mock.calls;
      expect(createCalls.length).toBe(4);

      // Verify at least one call has the project record structure
      const allArgs = createCalls.map((call) => call[0]);
      const projectRecordArg = allArgs.find((arg) => arg.recordType === 'contract_action');
      expect(projectRecordArg).toBeDefined();
      expect(projectRecordArg).toMatchObject({
        id: 'action-2',
        projectId: 'project-2',
        recordType: 'contract_action',
        contractId: 'contract-2',
        actionType: 'contract_locked',
        actorUid: 'user-a',
        actorRole: 'client',
        status: 'locked',
        metadata: { lockedVersion: 3 },
      });
    });

    it('includes correct fields in passport entry', async () => {
      const action: ContractActionRecord = {
        actionId: 'action-3',
        projectId: 'project-3',
        contractId: 'contract-3',
        actionType: 'contract_signed',
        actorUid: 'user-b',
        actorRole: 'contractor',
        timestampIso: '2026-03-01T08:00:00.000Z',
        description: 'Contract signed by contractor',
      };

      await writeContractActionToCollections(action);

      const allArgs = mockCreate.mock.calls.map((call) => call[0]);
      const passportArg = allArgs.find((arg) => arg.entryType === 'contract_action');
      expect(passportArg).toBeDefined();
      expect(passportArg).toMatchObject({
        id: 'action-3',
        projectId: 'project-3',
        entryType: 'contract_action',
        contractId: 'contract-3',
        actionType: 'contract_signed',
        actorUid: 'user-b',
        actorRole: 'contractor',
      });
    });

    it('includes correct fields in inbox entry', async () => {
      const action: ContractActionRecord = {
        actionId: 'action-4',
        projectId: 'project-4',
        contractId: 'contract-4',
        actionType: 'contract_varied',
        actorUid: 'system',
        actorRole: 'system',
        timestampIso: '2026-04-01T14:00:00.000Z',
        description: 'Contract variation created',
      };

      await writeContractActionToCollections(action);

      const allArgs = mockCreate.mock.calls.map((call) => call[0]);
      const inboxArg = allArgs.find((arg) => arg.type === 'contract_action');
      expect(inboxArg).toBeDefined();
      expect(inboxArg).toMatchObject({
        id: 'action-4',
        projectId: 'project-4',
        type: 'contract_action',
        contractId: 'contract-4',
        actionType: 'contract_varied',
        title: 'Contract variation created',
        read: false,
      });
    });

    it('marks audit entry as immutable', async () => {
      const action: ContractActionRecord = {
        actionId: 'action-5',
        projectId: 'project-5',
        contractId: 'contract-5',
        actionType: 'contract_generated',
        actorUid: 'system',
        actorRole: 'system',
        timestampIso: '2026-05-01T09:00:00.000Z',
        description: 'Contract generated',
      };

      await writeContractActionToCollections(action);

      const allArgs = mockCreate.mock.calls.map((call) => call[0]);
      const auditArg = allArgs.find((arg) => arg.immutable === true);
      expect(auditArg).toBeDefined();
      expect(auditArg).toMatchObject({
        projectId: 'project-5',
        contractId: 'contract-5',
        actionType: 'contract_generated',
        immutable: true,
      });
    });

    it('sets status to "locked" for contract_locked action type', async () => {
      const action: ContractActionRecord = {
        actionId: 'action-6',
        projectId: 'project-6',
        contractId: 'contract-6',
        actionType: 'contract_locked',
        actorUid: 'user-a',
        actorRole: 'client',
        timestampIso: '2026-06-01T10:00:00.000Z',
        description: 'Contract locked',
      };

      await writeContractActionToCollections(action);

      const allArgs = mockCreate.mock.calls.map((call) => call[0]);
      const projectRecordArg = allArgs.find((arg) => arg.recordType === 'contract_action');
      expect(projectRecordArg!.status).toBe('locked');
    });

    it('sets status to "active" for non-lock action types', async () => {
      const action: ContractActionRecord = {
        actionId: 'action-7',
        projectId: 'project-7',
        contractId: 'contract-7',
        actionType: 'contract_signed',
        actorUid: 'user-b',
        actorRole: 'contractor',
        timestampIso: '2026-07-01T10:00:00.000Z',
        description: 'Contract signed',
      };

      await writeContractActionToCollections(action);

      const allArgs = mockCreate.mock.calls.map((call) => call[0]);
      const projectRecordArg = allArgs.find((arg) => arg.recordType === 'contract_action');
      expect(projectRecordArg!.status).toBe('active');
    });
  });

  describe('generateContractFromProposal writes to collections', () => {
    it('writes contract_generated action to all collections after generating', async () => {
      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => mockProposal })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      await generateContractFromProposal('proposal-1', 'template-1');

      // Should have writes to: contracts (create) + 4 collection writes
      // The mockCreate is called for: contract persist + 4 collection writes = 5 total
      expect(mockCreate).toHaveBeenCalledTimes(5);
      expect(collectionCalls).toContain('project_records');
      expect(collectionCalls).toContain('project_passports');
      expect(collectionCalls).toContain('inbox_items');
    });
  });

  describe('signContract writes to collections', () => {
    it('writes contract_signed action to all collections after signing', async () => {
      const mockContract: ContractInstance = {
        contractId: 'contract-1',
        templateId: 'template-1',
        templateVersion: 3,
        projectId: 'project-1',
        parties: [
          { uid: 'user-a', role: 'client', signatureRequired: true },
          { uid: 'user-b', role: 'contractor', signatureRequired: true },
        ],
        specialConditions: [],
        redlineAnnotations: [],
        signatures: [],
        locked: false,
        variations: [],
      };

      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => ({ ...mockContract }) })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      mockQueryGet
        .mockResolvedValueOnce({ empty: false, docs: [{ data: () => mockAuthority }] })
        .mockResolvedValueOnce({ empty: false, docs: [{ data: () => mockAuthority }] });

      await signContract('contract-1', 'user-a');

      // Writes: contract set + 4 collection writes for signature action
      expect(collectionCalls).toContain('project_records');
      expect(collectionCalls).toContain('project_passports');
      expect(collectionCalls).toContain('inbox_items');
    });

    it('writes both contract_signed and contract_locked actions when auto-locking', async () => {
      const partiallySigned: ContractInstance = {
        contractId: 'contract-1',
        templateId: 'template-1',
        templateVersion: 3,
        projectId: 'project-1',
        parties: [
          { uid: 'user-a', role: 'client', signatureRequired: true },
          { uid: 'user-b', role: 'contractor', signatureRequired: true },
        ],
        specialConditions: [],
        redlineAnnotations: [],
        signatures: [
          { uid: 'user-a', role: 'client', signedAtIso: '2026-01-01T00:00:00.000Z', authorityRecordId: 'auth-1' },
        ],
        locked: false,
        variations: [],
      };

      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => ({ ...partiallySigned }) })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      const contractorAuthority = { ...mockAuthority, uid: 'user-b', authorityId: 'auth-2', representingParty: 'contractor' };
      mockQueryGet
        .mockResolvedValueOnce({ empty: false, docs: [{ data: () => contractorAuthority }] })
        .mockResolvedValueOnce({ empty: false, docs: [{ data: () => contractorAuthority }] });

      await signContract('contract-1', 'user-b');

      // Should write 8 collection docs: 4 for signed + 4 for locked
      // Plus the contract set itself
      expect(mockCreate).toHaveBeenCalledTimes(8);
    });
  });

  describe('lockContract writes to collections', () => {
    it('writes contract_locked action to all collections', async () => {
      const fullySigned: ContractInstance = {
        contractId: 'contract-1',
        templateId: 'template-1',
        templateVersion: 3,
        projectId: 'project-1',
        parties: [
          { uid: 'user-a', role: 'client', signatureRequired: true },
        ],
        specialConditions: [],
        redlineAnnotations: [],
        signatures: [
          { uid: 'user-a', role: 'client', signedAtIso: '2026-01-01T00:00:00.000Z', authorityRecordId: 'auth-1' },
        ],
        locked: false,
        variations: [],
      };

      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => fullySigned });

      await lockContract('contract-1');

      expect(collectionCalls).toContain('project_records');
      expect(collectionCalls).toContain('project_passports');
      expect(collectionCalls).toContain('inbox_items');
      expect(collectionCalls.filter((c) => c === 'audit_logs').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createContractVariation writes to collections', () => {
    it('writes contract_varied action to all collections', async () => {
      const parentContract: ContractInstance = {
        contractId: 'parent-1',
        templateId: 'template-1',
        templateVersion: 3,
        projectId: 'project-1',
        parties: [
          { uid: 'user-a', role: 'client', signatureRequired: true },
        ],
        specialConditions: [],
        redlineAnnotations: [],
        signatures: [
          { uid: 'user-a', role: 'client', signedAtIso: '2026-01-01T00:00:00.000Z', authorityRecordId: 'auth-1' },
        ],
        locked: true,
        lockedAtIso: '2026-01-01T00:00:00.000Z',
        lockedVersion: 3,
        variations: [],
      };

      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...parentContract }) });

      const variation: ContractGateVariationInput = {
        description: 'Payment schedule change',
        modifiedFields: ['paymentSchedule'],
        requiresFreshSignatures: true,
      };

      await createContractVariation('parent-1', variation);

      expect(collectionCalls).toContain('project_records');
      expect(collectionCalls).toContain('project_passports');
      expect(collectionCalls).toContain('inbox_items');
    });
  });
});
