/**
 * Unit tests for claimGovernanceService (Task 2.1)
 *
 * Tests: validateAndSubmitClaim, rejectDuplicateClaim
 * Covers: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10, 1.11, 1.12
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  validateAndSubmitClaim,
  rejectDuplicateClaim,
} from '../claimGovernanceService';
import type {
  ClaimValidationContext,
  ClaimValidationError,
  ClaimValidationResult,
  GovernedPaymentClaim,
} from '../claimGovernanceService';

// ─── Mock Firebase Admin SDK ─────────────────────────────────────────────────

const mockCreate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockWhere = vi.fn();

// Build chainable query mock
const queryMock = {
  where: mockWhere,
  get: vi.fn().mockResolvedValue({ docs: [] }),
};
// Allow chaining .where().where().where().get()
mockWhere.mockReturnValue(queryMock);

vi.mock('@/lib/firebase-admin', () => {
  const mockDoc = vi.fn().mockReturnValue({
    create: mockCreate,
    get: mockGet,
  });

  const mockCollection = vi.fn().mockImplementation(() => ({
    doc: mockDoc,
    where: mockWhere,
  }));

  // Support subcollection chaining: collection('projects').doc('x').collection('milestones')
  mockDoc.mockReturnValue({
    create: mockCreate,
    get: mockGet,
    collection: mockCollection,
  });

  return {
    adminDb: {
      collection: mockCollection,
    },
  };
});

// Mock audit service
vi.mock('../auditTrailService', () => ({
  writeImmutableAuditRecord: vi.fn().mockResolvedValue('audit-id-mock'),
}));

import { writeImmutableAuditRecord } from '../auditTrailService';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<ClaimValidationContext>): ClaimValidationContext {
  return {
    claimantUid: 'user-001',
    claimantRole: 'lead_professional',
    projectId: 'project-001',
    milestoneId: 'milestone-001',
    claimedAmount: { currency: 'ZAR', amount: 50000 },
    claimType: 'milestone',
    ...overrides,
  };
}

function setupFirestoreMocks(options: {
  projectExists?: boolean;
  teamMembers?: Array<{ uid: string; status: string; role?: string }>;
  clientUid?: string;
  leadProfessionalUid?: string;
  entityExists?: boolean;
  entityData?: Record<string, unknown>;
  duplicateClaims?: Array<{ claimId: string; status: string }>;
}) {
  const {
    projectExists = true,
    teamMembers = [{ uid: 'user-001', status: 'active' }],
    clientUid = 'client-uid',
    leadProfessionalUid = 'lead-uid',
    entityExists = true,
    entityData = { amount: { currency: 'ZAR', amount: 100000 } },
    duplicateClaims = [],
  } = options;

  // Reset mocks
  mockGet.mockReset();
  mockCreate.mockReset().mockResolvedValue(undefined);
  mockWhere.mockReset();

  // Project doc
  const projectDocData = projectExists
    ? { teamMembers, clientUid, leadProfessionalUid }
    : undefined;

  // Entity doc (milestone, stage, etc.)
  const entityDocData = entityExists ? entityData : undefined;

  // Set up mockGet to return different values for different calls
  // 1st call: project doc, 2nd call: entity doc
  mockGet
    .mockResolvedValueOnce({
      exists: projectExists,
      data: () => projectDocData,
    })
    .mockResolvedValueOnce({
      exists: entityExists,
      data: () => entityDocData,
    });

  // Duplicate claim query
  const queryGetResult = {
    docs: duplicateClaims.map((c) => ({
      id: c.claimId,
      data: () => ({ claimId: c.claimId, status: c.status }),
    })),
  };
  const chainableQuery = {
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(queryGetResult),
  };
  mockWhere.mockReturnValue(chainableQuery);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('claimGovernanceService — validateAndSubmitClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful claim submission (Req 1.1, 1.12)', () => {
    it('persists a claim with status approval_required when all validations pass', async () => {
      setupFirestoreMocks({
        entityData: { amount: { currency: 'ZAR', amount: 100000 } },
      });

      const ctx = makeCtx();
      const result = await validateAndSubmitClaim(ctx);

      expect(result.status).toBe('approval_required');
      expect(result.claimType).toBe('milestone');
      expect(result.claimedAmount).toEqual({ currency: 'ZAR', amount: 50000 });
      expect(result.claimId).toBeTruthy();
      expect(result.validationResult.valid).toBe(true);
      expect(result.validationResult.failedConditions).toHaveLength(0);
    });

    it('writes a claim_submitted audit record on success', async () => {
      setupFirestoreMocks({
        entityData: { amount: { currency: 'ZAR', amount: 100000 } },
      });

      const ctx = makeCtx();
      await validateAndSubmitClaim(ctx);

      expect(writeImmutableAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'claim_submitted',
          actorUid: 'user-001',
          actorRole: 'lead_professional',
          monetaryAmount: { currency: 'ZAR', amount: 50000 },
          newState: 'approval_required',
        }),
      );
    });

    it('returns a generated claimId', async () => {
      setupFirestoreMocks({
        entityData: { amount: { currency: 'ZAR', amount: 100000 } },
      });

      const ctx = makeCtx();
      const result = await validateAndSubmitClaim(ctx);

      expect(result.claimId).toMatch(/^[0-9a-f-]+$/);
    });
  });

  describe('Membership validation (Req 1.1)', () => {
    it('rejects claim when project does not exist', async () => {
      setupFirestoreMocks({ projectExists: false });

      const ctx = makeCtx();
      await expect(validateAndSubmitClaim(ctx)).rejects.toMatchObject({
        type: 'CLAIM_VALIDATION_FAILED',
        failedConditions: expect.arrayContaining([
          expect.objectContaining({ conditionId: 'PROJECT_NOT_FOUND' }),
        ]),
      });
    });

    it('rejects claim when claimant has no active membership', async () => {
      setupFirestoreMocks({
        teamMembers: [{ uid: 'other-user', status: 'active' }],
        clientUid: 'client-uid',
        leadProfessionalUid: 'other-lead',
        entityData: { amount: { currency: 'ZAR', amount: 100000 } },
      });

      const ctx = makeCtx();
      await expect(validateAndSubmitClaim(ctx)).rejects.toMatchObject({
        type: 'CLAIM_VALIDATION_FAILED',
        failedConditions: expect.arrayContaining([
          expect.objectContaining({ conditionId: 'MEMBERSHIP_INVALID' }),
        ]),
      });
    });
  });

  describe('Role validation', () => {
    it('rejects claim when role is not permitted for claim type', async () => {
      setupFirestoreMocks({
        entityData: { amount: { currency: 'ZAR', amount: 100000 } },
      });

      // Supplier cannot submit milestone claims
      const ctx = makeCtx({ claimantRole: 'supplier', claimType: 'milestone' });
      await expect(validateAndSubmitClaim(ctx)).rejects.toMatchObject({
        type: 'CLAIM_VALIDATION_FAILED',
        failedConditions: expect.arrayContaining([
          expect.objectContaining({ conditionId: 'ROLE_NOT_PERMITTED' }),
        ]),
      });
    });
  });

  describe('Entity validation — milestone (Req 1.1)', () => {
    it('rejects claim when milestone does not exist', async () => {
      setupFirestoreMocks({ entityExists: false });

      const ctx = makeCtx();
      await expect(validateAndSubmitClaim(ctx)).rejects.toMatchObject({
        type: 'CLAIM_VALIDATION_FAILED',
        failedConditions: expect.arrayContaining([
          expect.objectContaining({ conditionId: 'MILESTONE_NOT_FOUND' }),
        ]),
      });
    });

    it('rejects claim when amount exceeds milestone value', async () => {
      setupFirestoreMocks({
        entityData: { amount: { currency: 'ZAR', amount: 30000 } },
      });

      const ctx = makeCtx({ claimedAmount: { currency: 'ZAR', amount: 50000 } });
      await expect(validateAndSubmitClaim(ctx)).rejects.toMatchObject({
        type: 'CLAIM_VALIDATION_FAILED',
        failedConditions: expect.arrayContaining([
          expect.objectContaining({ conditionId: 'AMOUNT_EXCEEDS_MILESTONE' }),
        ]),
      });
    });
  });

  describe('Duplicate claim detection (Req 1.11)', () => {
    it('rejects claim when a pending claim exists from same claimant', async () => {
      setupFirestoreMocks({
        entityData: { amount: { currency: 'ZAR', amount: 100000 } },
        duplicateClaims: [{ claimId: 'existing-claim-1', status: 'approval_required' }],
      });

      const ctx = makeCtx();
      await expect(validateAndSubmitClaim(ctx)).rejects.toMatchObject({
        type: 'CLAIM_VALIDATION_FAILED',
        failedConditions: expect.arrayContaining([
          expect.objectContaining({ conditionId: 'DUPLICATE_CLAIM' }),
        ]),
      });
    });

    it('rejects claim when a disputed claim exists from same claimant', async () => {
      setupFirestoreMocks({
        entityData: { amount: { currency: 'ZAR', amount: 100000 } },
        duplicateClaims: [{ claimId: 'existing-claim-2', status: 'disputed' }],
      });

      const ctx = makeCtx();
      await expect(validateAndSubmitClaim(ctx)).rejects.toMatchObject({
        type: 'CLAIM_VALIDATION_FAILED',
        failedConditions: expect.arrayContaining([
          expect.objectContaining({ conditionId: 'DUPLICATE_CLAIM' }),
        ]),
      });
    });
  });

  describe('Structured error response (Req 1.10)', () => {
    it('collects ALL failed conditions before returning', async () => {
      // Both membership fails and entity not found
      setupFirestoreMocks({
        teamMembers: [{ uid: 'other-user', status: 'active' }],
        clientUid: 'client-uid',
        leadProfessionalUid: 'other-lead',
        entityExists: false,
      });

      // Also use a role not permitted for milestone
      const ctx = makeCtx({ claimantRole: 'supplier' });
      try {
        await validateAndSubmitClaim(ctx);
        expect.fail('Should have thrown');
      } catch (err) {
        const error = err as ClaimValidationError;
        expect(error.type).toBe('CLAIM_VALIDATION_FAILED');
        // Should have at least 3 conditions: ROLE_NOT_PERMITTED, MEMBERSHIP_INVALID, MILESTONE_NOT_FOUND
        expect(error.failedConditions.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('writes a claim_rejected audit record on failure', async () => {
      setupFirestoreMocks({ entityExists: false });

      const ctx = makeCtx();
      try {
        await validateAndSubmitClaim(ctx);
      } catch {
        // expected
      }

      expect(writeImmutableAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'claim_rejected',
          actorUid: 'user-001',
          newState: 'rejected',
        }),
      );
    });
  });
});

describe('claimGovernanceService — rejectDuplicateClaim', () => {
  it('returns a validation result with valid: false', () => {
    const result = rejectDuplicateClaim('new-claim-1', 'existing-claim-1');
    expect(result.valid).toBe(false);
  });

  it('includes DUPLICATE_CLAIM condition with both claim IDs', () => {
    const result = rejectDuplicateClaim('new-claim-1', 'existing-claim-1');
    expect(result.failedConditions).toHaveLength(1);
    expect(result.failedConditions[0].conditionId).toBe('DUPLICATE_CLAIM');
    expect(result.failedConditions[0].description).toContain('new-claim-1');
    expect(result.failedConditions[0].description).toContain('existing-claim-1');
  });

  it('is a pure function with no side effects', () => {
    const result1 = rejectDuplicateClaim('a', 'b');
    const result2 = rejectDuplicateClaim('a', 'b');
    expect(result1).toEqual(result2);
  });
});
