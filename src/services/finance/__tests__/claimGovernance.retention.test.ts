/**
 * Tests for applyRetention — retention application logic
 *
 * Validates: Requirement 1.9
 * - Retention calculated as claimedAmount × retentionPercent / 100
 * - retentionPercent must be in [0, 10]
 * - Creates RetentionRecord linked to claim and defects liability period
 * - Reads retentionPercent from project's CommercialBaseline
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Firebase Admin SDK ─────────────────────────────────────────────────

const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockDoc = vi.fn(() => ({
  get: mockGet,
  update: mockUpdate,
  create: mockCreate,
}));
const mockCollection = vi.fn();

// Set up chainable query mocks
function setupQueryChain(queryResult: { empty: boolean; docs: any[] }) {
  const limitFn = vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(queryResult) });
  const whereFn = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: limitFn }), limit: limitFn });
  return whereFn;
}

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (...args: any[]) => mockCollection(...args),
  },
}));

vi.mock('../auditTrailService', () => ({
  writeImmutableAuditRecord: vi.fn().mockResolvedValue('audit-retention-123'),
}));

import { applyRetention } from '../claimGovernanceService';
import type { RetentionApplicationError } from '../claimGovernanceService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockBaselineQueryResult(retentionPercent: number) {
  return {
    empty: false,
    docs: [{
      data: () => ({
        baselineId: 'base-001',
        retentionPercent,
        status: 'active',
        award: { projectId: 'project-1' },
      }),
    }],
  };
}

function createMockClaimDoc(claimedAmount: number, claimantUid = 'user-1', claimantRole = 'contractor') {
  return {
    exists: true,
    data: () => ({
      claimId: 'claim-1',
      claimantUid,
      claimantRole,
      claimedAmount: { currency: 'ZAR', amount: claimedAmount },
      status: 'approval_required',
    }),
  };
}

function createMockLiabilityQueryResult(endDate?: string) {
  if (!endDate) {
    return { empty: true, docs: [] };
  }
  return {
    empty: false,
    docs: [{
      data: () => ({
        projectId: 'project-1',
        endDate,
      }),
    }],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('applyRetention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMocks(options: {
    retentionPercent: number;
    claimedAmount: number;
    liabilityEndDate?: string;
    baselineEmpty?: boolean;
    claimExists?: boolean;
  }) {
    const {
      retentionPercent,
      claimedAmount,
      liabilityEndDate,
      baselineEmpty = false,
      claimExists = true,
    } = options;

    // commercial_baselines query chain
    const baselineResult = baselineEmpty
      ? { empty: true, docs: [] }
      : createMockBaselineQueryResult(retentionPercent);
    const baselineLimitGet = vi.fn().mockResolvedValue(baselineResult);
    const baselineLimit = vi.fn().mockReturnValue({ get: baselineLimitGet });
    const baselineWhere2 = vi.fn().mockReturnValue({ limit: baselineLimit });
    const baselineWhere1 = vi.fn().mockReturnValue({ where: baselineWhere2 });

    // payment_claims doc
    const claimDocResult = claimExists
      ? createMockClaimDoc(claimedAmount)
      : { exists: false, data: () => null };
    const claimDocGet = vi.fn().mockResolvedValue(claimDocResult);
    const claimDocUpdate = vi.fn().mockResolvedValue(undefined);
    const claimDocMock = vi.fn().mockReturnValue({ get: claimDocGet, update: claimDocUpdate });

    // defects_liability query chain
    const liabilityResult = createMockLiabilityQueryResult(liabilityEndDate);
    const liabilityLimitGet = vi.fn().mockResolvedValue(liabilityResult);
    const liabilityLimit = vi.fn().mockReturnValue({ get: liabilityLimitGet });
    const liabilityWhere = vi.fn().mockReturnValue({ limit: liabilityLimit });

    // retention_records doc
    const retentionDocCreate = vi.fn().mockResolvedValue(undefined);
    const retentionDocMock = vi.fn().mockReturnValue({ create: retentionDocCreate });

    mockCollection.mockImplementation((collectionName: string) => {
      switch (collectionName) {
        case 'commercial_baselines':
          return { where: baselineWhere1 };
        case 'payment_claims':
          return { doc: claimDocMock };
        case 'defects_liability':
          return { where: liabilityWhere };
        case 'retention_records':
          return { doc: retentionDocMock };
        default:
          return { doc: vi.fn().mockReturnValue({ create: vi.fn() }) };
      }
    });

    return { claimDocUpdate, retentionDocCreate };
  }

  it('calculates retention correctly for 5% on R100,000 claim', async () => {
    setupMocks({
      retentionPercent: 5,
      claimedAmount: 100_000,
      liabilityEndDate: '2027-06-01T00:00:00.000Z',
    });

    const result = await applyRetention('claim-1', 'project-1');

    expect(result.percent).toBe(5);
    expect(result.amountHeld).toEqual({ currency: 'ZAR', amount: 5_000 });
    expect(result.projectId).toBe('project-1');
    expect(result.certificateId).toBe('claim-1');
    expect(result.status).toBe('held');
    expect(result.releasedAmount).toEqual({ currency: 'ZAR', amount: 0 });
    expect(result.scheduledReleaseDate).toBe('2027-06-01T00:00:00.000Z');
    expect(result.retentionId).toBeDefined();
  });

  it('calculates retention correctly for 10% (maximum)', async () => {
    setupMocks({
      retentionPercent: 10,
      claimedAmount: 250_000,
      liabilityEndDate: '2028-01-15T00:00:00.000Z',
    });

    const result = await applyRetention('claim-1', 'project-1');

    expect(result.percent).toBe(10);
    expect(result.amountHeld).toEqual({ currency: 'ZAR', amount: 25_000 });
  });

  it('calculates retention correctly for 0% (no retention)', async () => {
    setupMocks({
      retentionPercent: 0,
      claimedAmount: 500_000,
    });

    const result = await applyRetention('claim-1', 'project-1');

    expect(result.percent).toBe(0);
    expect(result.amountHeld).toEqual({ currency: 'ZAR', amount: 0 });
  });

  it('persists RetentionRecord to Firestore', async () => {
    const { retentionDocCreate } = setupMocks({
      retentionPercent: 7,
      claimedAmount: 200_000,
      liabilityEndDate: '2027-12-31T00:00:00.000Z',
    });

    await applyRetention('claim-1', 'project-1');

    expect(retentionDocCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        certificateId: 'claim-1',
        percent: 7,
        amountHeld: { currency: 'ZAR', amount: 14_000 },
        status: 'held',
        releasedAmount: { currency: 'ZAR', amount: 0 },
        scheduledReleaseDate: '2027-12-31T00:00:00.000Z',
      }),
    );
  });

  it('updates the claim document with retention record reference', async () => {
    const { claimDocUpdate } = setupMocks({
      retentionPercent: 5,
      claimedAmount: 100_000,
    });

    const result = await applyRetention('claim-1', 'project-1');

    expect(claimDocUpdate).toHaveBeenCalledWith({
      retentionRecord: {
        retentionId: result.retentionId,
        percent: 5,
        amount: { currency: 'ZAR', amount: 5_000 },
      },
    });
  });

  it('sets scheduledReleaseDate to undefined when no liability period exists', async () => {
    setupMocks({
      retentionPercent: 5,
      claimedAmount: 80_000,
      liabilityEndDate: undefined, // no liability period
    });

    const result = await applyRetention('claim-1', 'project-1');

    expect(result.scheduledReleaseDate).toBeUndefined();
  });

  it('throws when no active CommercialBaseline exists for the project', async () => {
    setupMocks({
      retentionPercent: 5,
      claimedAmount: 100_000,
      baselineEmpty: true,
    });

    try {
      await applyRetention('claim-1', 'project-1');
      expect.fail('Should have thrown');
    } catch (err) {
      const error = err as RetentionApplicationError;
      expect(error.type).toBe('RETENTION_APPLICATION_FAILED');
      expect(error.reason).toContain('No active CommercialBaseline');
      expect(error.claimId).toBe('claim-1');
      expect(error.projectId).toBe('project-1');
    }
  });

  it('throws when payment claim does not exist', async () => {
    setupMocks({
      retentionPercent: 5,
      claimedAmount: 100_000,
      claimExists: false,
    });

    try {
      await applyRetention('claim-nonexistent', 'project-1');
      expect.fail('Should have thrown');
    } catch (err) {
      const error = err as RetentionApplicationError;
      expect(error.type).toBe('RETENTION_APPLICATION_FAILED');
      expect(error.reason).toContain('does not exist');
    }
  });

  it('throws when retentionPercent exceeds 10', async () => {
    setupMocks({
      retentionPercent: 15,
      claimedAmount: 100_000,
    });

    try {
      await applyRetention('claim-1', 'project-1');
      expect.fail('Should have thrown');
    } catch (err) {
      const error = err as RetentionApplicationError;
      expect(error.type).toBe('RETENTION_APPLICATION_FAILED');
      expect(error.reason).toContain('outside valid range');
    }
  });

  it('throws when retentionPercent is negative', async () => {
    setupMocks({
      retentionPercent: -2,
      claimedAmount: 100_000,
    });

    try {
      await applyRetention('claim-1', 'project-1');
      expect.fail('Should have thrown');
    } catch (err) {
      const error = err as RetentionApplicationError;
      expect(error.type).toBe('RETENTION_APPLICATION_FAILED');
      expect(error.reason).toContain('outside valid range');
    }
  });

  it('handles fractional retention percentages correctly', async () => {
    setupMocks({
      retentionPercent: 7.5,
      claimedAmount: 400_000,
    });

    const result = await applyRetention('claim-1', 'project-1');

    expect(result.percent).toBe(7.5);
    expect(result.amountHeld).toEqual({ currency: 'ZAR', amount: 30_000 });
  });
});
