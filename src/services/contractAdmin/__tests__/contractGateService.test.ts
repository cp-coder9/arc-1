/**
 * Unit tests for contractGateService (Tasks 6.1, 6.5)
 *
 * Tests: generateContractFromProposal, validateSignatureAuthority,
 * signContract, lockContract, isContractGateSatisfiedAsync, createContractVariation,
 * linkClaimOrDisputeToContract, variationRequiresFreshSignatures
 *
 * Requirements: 4.1, 4.2, 4.3, 4.6, 4.7, 4.9
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock Firebase Admin SDK ─────────────────────────────────────────────────

const mockCreate = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDocGet = vi.fn(); // For doc().get() calls
const mockQueryGet = vi.fn(); // For where().get() calls

// Build a chainable query mock (separate from doc-level get)
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

const mockCollection = vi.fn().mockImplementation((path: string) => ({
  doc: mockDoc,
  where: queryMock.where,
  get: mockQueryGet,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (path: string) => mockCollection(path),
  },
}));

// Mock the audit trail service
vi.mock('@/services/finance/auditTrailService', () => ({
  writeImmutableAuditRecord: vi.fn().mockResolvedValue('audit-id-mock'),
}));

import {
  generateContractFromProposal,
  validateSignatureAuthority,
  signContract,
  lockContract,
  isContractGateSatisfied,
  isContractGateSatisfiedAsync,
  createContractVariation,
  linkClaimOrDisputeToContract,
  variationRequiresFreshSignatures,
  FINANCIAL_VARIATION_FIELDS,
} from '../contractGateService';
import type {
  ContractInstance,
  ContractTemplate,
  SignatureAuthority,
  ContractGateVariationInput,
} from '../contractGateService';
import { writeImmutableAuditRecord } from '@/services/finance/auditTrailService';

// ── Test Data ───────────────────────────────────────────────────────────────

const mockProposal = {
  projectId: 'project-1',
  parties: [
    { uid: 'user-a', role: 'client', signatureRequired: true },
    { uid: 'user-b', role: 'contractor', signatureRequired: true },
  ],
  specialConditions: [
    { index: 0, text: 'Penalty clause for late delivery', addedBy: 'user-a' },
  ],
  redlineAnnotations: [
    { field: 'payment_terms', oldValue: '30 days', newValue: '14 days', annotatedBy: 'user-b' },
  ],
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
  documentTypes: ['construction_contract', 'variation_order'],
  representingParty: 'client',
  validFrom: '2024-01-01T00:00:00.000Z',
  validTo: '2030-12-31T23:59:59.999Z',
  active: true,
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('contractGateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateContractFromProposal', () => {
    it('generates a contract from an accepted proposal and active template', async () => {
      // Setup: proposal doc exists and is accepted
      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => mockProposal }) // proposal
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate }); // template

      const result = await generateContractFromProposal('proposal-1', 'template-1');

      expect(result.contractId).toBeTruthy();
      expect(result.templateId).toBe('template-1');
      expect(result.templateVersion).toBe(3);
      expect(result.projectId).toBe('project-1');
      expect(result.parties).toHaveLength(2);
      expect(result.specialConditions).toHaveLength(1);
      expect(result.redlineAnnotations).toHaveLength(1);
      expect(result.signatures).toHaveLength(0);
      expect(result.locked).toBe(false);
      expect(result.variations).toEqual([]);
    });

    it('persists the contract to Firestore', async () => {
      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => mockProposal })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      await generateContractFromProposal('proposal-1', 'template-1');

      expect(mockCreate).toHaveBeenCalled();
    });

    it('writes a contract_generated audit record', async () => {
      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => mockProposal })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      await generateContractFromProposal('proposal-1', 'template-1');

      expect(writeImmutableAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'contract_generated',
          newState: 'contract_generated',
        }),
      );
    });

    it('throws if proposal does not exist', async () => {
      mockDocGet.mockResolvedValueOnce({ exists: false, data: () => undefined });

      await expect(
        generateContractFromProposal('nonexistent', 'template-1'),
      ).rejects.toThrow("Proposal 'nonexistent' not found");
    });

    it('throws if proposal is not in accepted status', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockProposal, status: 'draft' }),
      });

      await expect(
        generateContractFromProposal('proposal-1', 'template-1'),
      ).rejects.toThrow("not in 'accepted' status");
    });

    it('throws if template is not active', async () => {
      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => mockProposal })
        .mockResolvedValueOnce({ exists: true, data: () => ({ ...mockTemplate, active: false }) });

      await expect(
        generateContractFromProposal('proposal-1', 'template-1'),
      ).rejects.toThrow('not active');
    });

    it('throws if special conditions exceed 50', async () => {
      const manyConditions = Array.from({ length: 51 }, (_, i) => ({
        index: i,
        text: `Condition ${i}`,
        addedBy: 'user-a',
      }));

      mockDocGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ ...mockProposal, specialConditions: manyConditions }),
        })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      await expect(
        generateContractFromProposal('proposal-1', 'template-1'),
      ).rejects.toThrow('exceeds maximum of 50');
    });

    it('supports exactly 50 special conditions', async () => {
      const fiftyConditions = Array.from({ length: 50 }, (_, i) => ({
        index: i,
        text: `Condition ${i}`,
        addedBy: 'user-a',
      }));

      mockDocGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ ...mockProposal, specialConditions: fiftyConditions }),
        })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      const result = await generateContractFromProposal('proposal-1', 'template-1');
      expect(result.specialConditions).toHaveLength(50);
    });
  });

  describe('validateSignatureAuthority', () => {
    it('returns true when user has valid, active authority for document type and party', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => mockAuthority }],
      });

      const result = await validateSignatureAuthority(
        'user-a',
        'construction_contract',
        'client',
      );

      expect(result).toBe(true);
    });

    it('returns false when no authority records exist', async () => {
      mockQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await validateSignatureAuthority(
        'user-unknown',
        'construction_contract',
        'client',
      );

      expect(result).toBe(false);
    });

    it('returns false when authority does not include the document type', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            data: () => ({
              ...mockAuthority,
              documentTypes: ['variation_order'], // does NOT include construction_contract
            }),
          },
        ],
      });

      const result = await validateSignatureAuthority(
        'user-a',
        'construction_contract',
        'client',
      );

      expect(result).toBe(false);
    });

    it('returns false when authority has expired (validTo in the past)', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            data: () => ({
              ...mockAuthority,
              validTo: '2020-01-01T00:00:00.000Z', // past
            }),
          },
        ],
      });

      const result = await validateSignatureAuthority(
        'user-a',
        'construction_contract',
        'client',
      );

      expect(result).toBe(false);
    });

    it('returns false when authority validFrom is in the future', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            data: () => ({
              ...mockAuthority,
              validFrom: '2099-01-01T00:00:00.000Z', // future
            }),
          },
        ],
      });

      const result = await validateSignatureAuthority(
        'user-a',
        'construction_contract',
        'client',
      );

      expect(result).toBe(false);
    });

    it('returns true when validTo is undefined (no expiry)', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            data: () => ({
              ...mockAuthority,
              validTo: undefined,
            }),
          },
        ],
      });

      const result = await validateSignatureAuthority(
        'user-a',
        'construction_contract',
        'client',
      );

      expect(result).toBe(true);
    });
  });

  describe('signContract', () => {
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

    it('adds a signature when signer has valid authority', async () => {
      // doc reads: contract, template
      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => ({ ...mockContract }) })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      // query reads: validateSignatureAuthority query, then authority lookup for ID
      mockQueryGet
        .mockResolvedValueOnce({ empty: false, docs: [{ data: () => mockAuthority }] })
        .mockResolvedValueOnce({ empty: false, docs: [{ data: () => mockAuthority }] });

      const result = await signContract('contract-1', 'user-a');

      expect(result.signatures).toHaveLength(1);
      expect(result.signatures[0].uid).toBe('user-a');
      expect(result.signatures[0].role).toBe('client');
      expect(result.signatures[0].authorityRecordId).toBe('auth-1');
    });

    it('rejects signature and writes audit when signer lacks authority', async () => {
      // doc reads: contract, template
      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => ({ ...mockContract }) })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      // No valid authority found
      mockQueryGet.mockResolvedValue({ empty: true, docs: [] });

      await expect(signContract('contract-1', 'user-a')).rejects.toThrow(
        'Signature rejected',
      );

      expect(writeImmutableAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'contract_signed',
          newState: 'signature_rejected',
        }),
      );
    });

    it('throws if contract is already locked', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockContract, locked: true }),
      });

      await expect(signContract('contract-1', 'user-a')).rejects.toThrow(
        'already locked',
      );
    });

    it('throws if signer is not a party to the contract', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockContract }),
      });

      await expect(signContract('contract-1', 'user-unknown')).rejects.toThrow(
        'not a party',
      );
    });

    it('auto-locks when all required signatures are collected', async () => {
      // Contract already has one signature, now the second signs
      const partiallySignedContract = {
        ...mockContract,
        signatures: [
          { uid: 'user-a', role: 'client', signedAtIso: '2026-01-01T00:00:00.000Z', authorityRecordId: 'auth-1' },
        ],
      };

      // doc reads: contract, template
      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => ({ ...partiallySignedContract }) })
        .mockResolvedValueOnce({ exists: true, data: () => mockTemplate });

      // query reads: validateSignatureAuthority, then authority lookup for ID
      mockQueryGet
        .mockResolvedValueOnce({
          empty: false,
          docs: [{ data: () => ({ ...mockAuthority, uid: 'user-b', authorityId: 'auth-2', representingParty: 'contractor' }) }],
        })
        .mockResolvedValueOnce({
          empty: false,
          docs: [{ data: () => ({ ...mockAuthority, uid: 'user-b', authorityId: 'auth-2', representingParty: 'contractor' }) }],
        });

      const result = await signContract('contract-1', 'user-b');

      expect(result.locked).toBe(true);
      expect(result.lockedAtIso).toBeTruthy();
      expect(result.lockedVersion).toBe(3);
    });
  });

  describe('lockContract', () => {
    it('locks a contract when all required signatures are present', async () => {
      const fullySigned: ContractInstance = {
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
          { uid: 'user-b', role: 'contractor', signedAtIso: '2026-01-02T00:00:00.000Z', authorityRecordId: 'auth-2' },
        ],
        locked: false,
        variations: [],
      };

      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => fullySigned });

      const result = await lockContract('contract-1');

      expect(result.locked).toBe(true);
      expect(result.lockedAtIso).toBeTruthy();
      expect(result.lockedVersion).toBe(3);
      expect(mockSet).toHaveBeenCalled();
    });

    it('throws if missing required signatures', async () => {
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

      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => partiallySigned });

      await expect(lockContract('contract-1')).rejects.toThrow(
        'missing signatures',
      );
    });

    it('throws if contract is already locked', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          contractId: 'contract-1',
          locked: true,
        }),
      });

      await expect(lockContract('contract-1')).rejects.toThrow('already locked');
    });

    it('writes a contract_locked audit record', async () => {
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

      expect(writeImmutableAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'contract_locked',
          newState: 'locked',
        }),
      );
    });
  });

  describe('isContractGateSatisfied (sync)', () => {
    it('returns false by default (gate closed without pre-loaded state)', () => {
      const result = isContractGateSatisfied('project-1');
      expect(result).toBe(false);
    });
  });

  describe('isContractGateSatisfiedAsync', () => {
    it('returns true when a locked contract exists for the project', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ contractId: 'c-1', locked: true }) }],
      });

      const result = await isContractGateSatisfiedAsync('project-1');
      expect(result).toBe(true);
    });

    it('returns false when no locked contract exists', async () => {
      mockQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await isContractGateSatisfiedAsync('project-1');
      expect(result).toBe(false);
    });
  });

  describe('createContractVariation', () => {
    const parentContract: ContractInstance = {
      contractId: 'parent-1',
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
        { uid: 'user-b', role: 'contractor', signedAtIso: '2026-01-02T00:00:00.000Z', authorityRecordId: 'auth-2' },
      ],
      locked: true,
      lockedAtIso: '2026-01-02T00:00:00.000Z',
      lockedVersion: 3,
      variations: [],
    };

    it('creates a variation requiring fresh signatures', async () => {
      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...parentContract }) });

      const variation: ContractGateVariationInput = {
        description: 'Increase contract sum by R50,000',
        modifiedFields: ['contractSum'],
        requiresFreshSignatures: true,
      };

      const result = await createContractVariation('parent-1', variation);

      expect(result.contractId).toBeTruthy();
      expect(result.locked).toBe(false);
      expect(result.signatures).toHaveLength(0);
      expect(result.parties[0].signatureRequired).toBe(true);
    });

    it('creates a variation that auto-locks when no fresh signatures needed', async () => {
      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...parentContract }) });

      const variation: ContractGateVariationInput = {
        description: 'Minor admin update',
        modifiedFields: ['contactEmail'],
        requiresFreshSignatures: false,
      };

      const result = await createContractVariation('parent-1', variation);

      expect(result.locked).toBe(true);
      expect(result.lockedAtIso).toBeTruthy();
    });

    it('links the variation to the parent contract', async () => {
      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...parentContract }) });

      const variation: ContractGateVariationInput = {
        description: 'Rate adjustment',
        modifiedFields: ['rates'],
        requiresFreshSignatures: true,
      };

      await createContractVariation('parent-1', variation);

      // Parent should be updated with the new variation ID
      expect(mockSet).toHaveBeenCalled();
    });

    it('throws if variation exceeds 50 special conditions', async () => {
      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...parentContract }) });

      const variation: ContractGateVariationInput = {
        description: 'Too many conditions',
        modifiedFields: ['contractSum'],
        requiresFreshSignatures: true,
        specialConditions: Array.from({ length: 51 }, (_, i) => ({
          index: i,
          text: `Condition ${i}`,
          addedBy: 'user-a',
        })),
      };

      await expect(
        createContractVariation('parent-1', variation),
      ).rejects.toThrow('exceeds maximum of 50');
    });

    it('writes a contract_varied audit record', async () => {
      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...parentContract }) });

      const variation: ContractGateVariationInput = {
        description: 'Payment schedule change',
        modifiedFields: ['paymentSchedule'],
        requiresFreshSignatures: true,
      };

      await createContractVariation('parent-1', variation);

      expect(writeImmutableAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'contract_varied',
          newState: 'variation_pending_signatures',
        }),
      );
    });

    it('throws if parent contract does not exist', async () => {
      mockDocGet.mockResolvedValueOnce({ exists: false, data: () => undefined });

      const variation: ContractGateVariationInput = {
        description: 'Some change',
        modifiedFields: ['rates'],
        requiresFreshSignatures: true,
      };

      await expect(
        createContractVariation('nonexistent', variation),
      ).rejects.toThrow("Parent contract 'nonexistent' not found");
    });

    it('throws if financial fields are modified without requiresFreshSignatures', async () => {
      mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...parentContract }) });

      const variation: ContractGateVariationInput = {
        description: 'Contract sum change without signatures',
        modifiedFields: ['contractSum'],
        requiresFreshSignatures: false,
      };

      await expect(
        createContractVariation('parent-1', variation),
      ).rejects.toThrow('requiresFreshSignatures must be true');
    });

    it('throws for each financial field when requiresFreshSignatures is false', async () => {
      const financialFields = ['contractSum', 'paymentSchedule', 'rates', 'penalties', 'retentionPercentage', 'feeStructure'];

      for (const field of financialFields) {
        mockDocGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...parentContract }) });

        const variation: ContractGateVariationInput = {
          description: `Modify ${field}`,
          modifiedFields: [field],
          requiresFreshSignatures: false,
        };

        await expect(
          createContractVariation('parent-1', variation),
        ).rejects.toThrow('requiresFreshSignatures must be true');
      }
    });
  });

  describe('linkClaimOrDisputeToContract', () => {
    const lockedContract1: ContractInstance = {
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
      locked: true,
      lockedAtIso: '2026-01-15T00:00:00.000Z',
      lockedVersion: 3,
      variations: [],
    };

    const lockedContract2: ContractInstance = {
      contractId: 'contract-2',
      templateId: 'template-1',
      templateVersion: 4,
      projectId: 'project-1',
      parties: [
        { uid: 'user-a', role: 'client', signatureRequired: true },
      ],
      specialConditions: [],
      redlineAnnotations: [],
      signatures: [
        { uid: 'user-a', role: 'client', signedAtIso: '2026-03-01T00:00:00.000Z', authorityRecordId: 'auth-1' },
      ],
      locked: true,
      lockedAtIso: '2026-03-01T00:00:00.000Z',
      lockedVersion: 4,
      variations: [],
    };

    it('links a claim to the latest locked contract effective at event time', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          { data: () => ({ ...lockedContract1 }) },
          { data: () => ({ ...lockedContract2 }) },
        ],
      });

      const result = await linkClaimOrDisputeToContract(
        'claim-123',
        'project-1',
        '2026-04-01T00:00:00.000Z',
      );

      expect(result.contractId).toBe('contract-2');
      expect(result.lockedVersion).toBe(4);
    });

    it('selects the earlier contract when event time is before the later contract lock', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          { data: () => ({ ...lockedContract1 }) },
          { data: () => ({ ...lockedContract2 }) },
        ],
      });

      const result = await linkClaimOrDisputeToContract(
        'claim-456',
        'project-1',
        '2026-02-15T00:00:00.000Z', // Between contract-1 lock and contract-2 lock
      );

      expect(result.contractId).toBe('contract-1');
      expect(result.lockedVersion).toBe(3);
    });

    it('persists the linked claim on the contract record', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          { data: () => ({ ...lockedContract1 }) },
        ],
      });

      await linkClaimOrDisputeToContract(
        'dispute-789',
        'project-1',
        '2026-02-01T00:00:00.000Z',
      );

      expect(mockSet).toHaveBeenCalled();
    });

    it('writes a claim_linked audit record', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          { data: () => ({ ...lockedContract1 }) },
        ],
      });

      await linkClaimOrDisputeToContract(
        'claim-audit',
        'project-1',
        '2026-02-01T00:00:00.000Z',
      );

      expect(writeImmutableAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'claim_linked',
          newState: 'claim_linked',
          targetResourceId: 'contract-1',
        }),
      );
    });

    it('throws when no locked contracts exist for the project', async () => {
      mockQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });

      await expect(
        linkClaimOrDisputeToContract('claim-x', 'project-1', '2026-04-01T00:00:00.000Z'),
      ).rejects.toThrow("No locked contracts found for project 'project-1'");
    });

    it('throws when no locked contract is effective at event time', async () => {
      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          { data: () => ({ ...lockedContract1 }) },
        ],
      });

      // Event time is BEFORE the only locked contract
      await expect(
        linkClaimOrDisputeToContract('claim-y', 'project-1', '2025-12-01T00:00:00.000Z'),
      ).rejects.toThrow("No locked contract found for project 'project-1' effective at");
    });

    it('appends to existing linkedClaims array', async () => {
      const contractWithExistingLinks = {
        ...lockedContract1,
        linkedClaims: ['existing-claim-1'],
      };

      mockQueryGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          { data: () => ({ ...contractWithExistingLinks }) },
        ],
      });

      await linkClaimOrDisputeToContract(
        'new-claim-2',
        'project-1',
        '2026-02-01T00:00:00.000Z',
      );

      // Verify set was called (the contract was persisted with the new claim)
      expect(mockSet).toHaveBeenCalled();
    });
  });

  describe('variationRequiresFreshSignatures', () => {
    it('returns true for contractSum field', () => {
      expect(variationRequiresFreshSignatures(['contractSum'])).toBe(true);
    });

    it('returns true for paymentSchedule field', () => {
      expect(variationRequiresFreshSignatures(['paymentSchedule'])).toBe(true);
    });

    it('returns true for rates field', () => {
      expect(variationRequiresFreshSignatures(['rates'])).toBe(true);
    });

    it('returns true for penalties field', () => {
      expect(variationRequiresFreshSignatures(['penalties'])).toBe(true);
    });

    it('returns true for retentionPercentage field', () => {
      expect(variationRequiresFreshSignatures(['retentionPercentage'])).toBe(true);
    });

    it('returns true for feeStructure field', () => {
      expect(variationRequiresFreshSignatures(['feeStructure'])).toBe(true);
    });

    it('returns false for non-financial fields', () => {
      expect(variationRequiresFreshSignatures(['contactEmail'])).toBe(false);
      expect(variationRequiresFreshSignatures(['description'])).toBe(false);
      expect(variationRequiresFreshSignatures(['projectManager'])).toBe(false);
    });

    it('returns true when mix of financial and non-financial fields', () => {
      expect(variationRequiresFreshSignatures(['contactEmail', 'rates'])).toBe(true);
    });

    it('returns false for empty array', () => {
      expect(variationRequiresFreshSignatures([])).toBe(false);
    });
  });

  describe('FINANCIAL_VARIATION_FIELDS', () => {
    it('contains all required financial fields from Requirement 4.6', () => {
      expect(FINANCIAL_VARIATION_FIELDS.has('contractSum')).toBe(true);
      expect(FINANCIAL_VARIATION_FIELDS.has('paymentSchedule')).toBe(true);
      expect(FINANCIAL_VARIATION_FIELDS.has('rates')).toBe(true);
      expect(FINANCIAL_VARIATION_FIELDS.has('penalties')).toBe(true);
      expect(FINANCIAL_VARIATION_FIELDS.has('retentionPercentage')).toBe(true);
      expect(FINANCIAL_VARIATION_FIELDS.has('feeStructure')).toBe(true);
    });
  });
});
