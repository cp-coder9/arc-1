/**
 * Tests for platform fee calculation and partial release validation
 *
 * Validates: Requirements 1.7, 1.8
 * - Platform fee: feeAmount = claimedAmount × tariffPercent / 100
 * - Net payable: netPayable = claimedAmount - feeAmount
 * - Partial release: amount ≤ (certifiedAmount - totalReleased - retentionHeld)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin before importing the module under test
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
const mockDoc = vi.fn(() => ({
  get: mockGet,
  update: mockUpdate,
  create: mockCreate,
}));
const mockCollection = vi.fn(() => ({
  doc: mockDoc,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: mockCollection,
  },
}));

vi.mock('../auditTrailService', () => ({
  writeImmutableAuditRecord: vi.fn().mockResolvedValue('audit-123'),
}));

import {
  calculatePlatformFee,
  validatePartialRelease,
} from '../claimGovernanceService';
import type { MoneyAmount, PlatformFeeResult, PartialReleaseError } from '../claimGovernanceService';

describe('calculatePlatformFee', () => {
  it('calculates fee and net payable correctly for a standard tariff', () => {
    const claimedAmount: MoneyAmount = { currency: 'ZAR', amount: 100_000 };
    const tariffPercent = 5;
    const tariffId = 'tariff-001';

    const result = calculatePlatformFee(claimedAmount, tariffPercent, tariffId);

    expect(result.tariffId).toBe('tariff-001');
    expect(result.feePercent).toBe(5);
    expect(result.feeAmount).toEqual({ currency: 'ZAR', amount: 5_000 });
    expect(result.netPayable).toEqual({ currency: 'ZAR', amount: 95_000 });
  });

  it('returns zero fee when tariff is 0%', () => {
    const claimedAmount: MoneyAmount = { currency: 'ZAR', amount: 250_000 };

    const result = calculatePlatformFee(claimedAmount, 0, 'tariff-zero');

    expect(result.feeAmount.amount).toBe(0);
    expect(result.netPayable.amount).toBe(250_000);
  });

  it('calculates correctly with fractional tariff percentage', () => {
    const claimedAmount: MoneyAmount = { currency: 'ZAR', amount: 200_000 };

    const result = calculatePlatformFee(claimedAmount, 2.5, 'tariff-frac');

    expect(result.feeAmount.amount).toBe(5_000);
    expect(result.netPayable.amount).toBe(195_000);
  });

  it('preserves the invariant: feeAmount + netPayable = claimedAmount', () => {
    const claimedAmount: MoneyAmount = { currency: 'ZAR', amount: 333_333 };

    const result = calculatePlatformFee(claimedAmount, 7.3, 'tariff-invariant');

    expect(result.feeAmount.amount + result.netPayable.amount).toBeCloseTo(333_333, 5);
  });

  it('preserves currency from the claimed amount', () => {
    const claimedAmount: MoneyAmount = { currency: 'ZAR', amount: 50_000 };

    const result = calculatePlatformFee(claimedAmount, 10, 'tariff-currency');

    expect(result.feeAmount.currency).toBe('ZAR');
    expect(result.netPayable.currency).toBe('ZAR');
  });

  it('handles very small amounts without losing precision', () => {
    const claimedAmount: MoneyAmount = { currency: 'ZAR', amount: 100 };

    const result = calculatePlatformFee(claimedAmount, 1, 'tariff-small');

    expect(result.feeAmount.amount).toBe(1);
    expect(result.netPayable.amount).toBe(99);
  });
});

describe('validatePartialRelease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockReturnValue({ doc: mockDoc });
    mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate, create: mockCreate });
  });

  it('succeeds when amount is within remaining releasable balance', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        claimantUid: 'user-1',
        claimantRole: 'contractor',
        certifiedAmount: { currency: 'ZAR', amount: 100_000 },
        claimedAmount: { currency: 'ZAR', amount: 100_000 },
        partialReleases: [
          { amount: { currency: 'ZAR', amount: 20_000 }, releasedAtIso: '2025-01-01T00:00:00Z', releaseId: 'rel-1' },
        ],
        retentionRecord: { amount: { currency: 'ZAR', amount: 10_000 } },
      }),
    });
    mockUpdate.mockResolvedValue(undefined);

    const result = await validatePartialRelease('claim-1', { currency: 'ZAR', amount: 50_000 });

    expect(result.claimId).toBe('claim-1');
    expect(result.amount).toEqual({ currency: 'ZAR', amount: 50_000 });
    expect(result.remainingReleasable).toBe(20_000); // 100k - 20k - 10k - 50k = 20k
    expect(result.releaseId).toBeDefined();
    expect(result.releasedAtIso).toBeDefined();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('succeeds when releasing exact remaining balance', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        claimantUid: 'user-2',
        claimantRole: 'subcontractor',
        certifiedAmount: { currency: 'ZAR', amount: 50_000 },
        partialReleases: [],
        retentionRecord: { amount: { currency: 'ZAR', amount: 5_000 } },
      }),
    });
    mockUpdate.mockResolvedValue(undefined);

    const result = await validatePartialRelease('claim-2', { currency: 'ZAR', amount: 45_000 });

    expect(result.remainingReleasable).toBe(0);
  });

  it('throws when amount exceeds remaining releasable balance', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        claimantUid: 'user-3',
        claimantRole: 'contractor',
        certifiedAmount: { currency: 'ZAR', amount: 80_000 },
        partialReleases: [
          { amount: { currency: 'ZAR', amount: 30_000 }, releasedAtIso: '2025-01-01T00:00:00Z', releaseId: 'rel-1' },
          { amount: { currency: 'ZAR', amount: 20_000 }, releasedAtIso: '2025-01-02T00:00:00Z', releaseId: 'rel-2' },
        ],
        retentionRecord: { amount: { currency: 'ZAR', amount: 8_000 } },
      }),
    });

    try {
      await validatePartialRelease('claim-3', { currency: 'ZAR', amount: 30_000 });
      expect.fail('Should have thrown');
    } catch (err) {
      const error = err as PartialReleaseError;
      expect(error.type).toBe('PARTIAL_RELEASE_EXCEEDS_BALANCE');
      expect(error.claimId).toBe('claim-3');
      expect(error.requestedAmount).toBe(30_000);
      expect(error.remainingReleasable).toBe(22_000); // 80k - 50k - 8k = 22k
      expect(error.certifiedAmount).toBe(80_000);
      expect(error.totalReleased).toBe(50_000);
      expect(error.retentionHeld).toBe(8_000);
    }

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('throws when claim does not exist', async () => {
    mockGet.mockResolvedValue({
      exists: false,
      data: () => null,
    });

    try {
      await validatePartialRelease('nonexistent-claim', { currency: 'ZAR', amount: 1_000 });
      expect.fail('Should have thrown');
    } catch (err) {
      const error = err as PartialReleaseError;
      expect(error.type).toBe('PARTIAL_RELEASE_EXCEEDS_BALANCE');
      expect(error.remainingReleasable).toBe(0);
    }
  });

  it('works when claim has no retention record (retention = 0)', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        claimantUid: 'user-4',
        claimantRole: 'contractor',
        certifiedAmount: { currency: 'ZAR', amount: 60_000 },
        partialReleases: [],
        // No retentionRecord
      }),
    });
    mockUpdate.mockResolvedValue(undefined);

    const result = await validatePartialRelease('claim-4', { currency: 'ZAR', amount: 60_000 });

    expect(result.remainingReleasable).toBe(0); // 60k - 0 - 0 - 60k = 0
  });

  it('records the partial release entry with correct structure', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        claimantUid: 'user-5',
        claimantRole: 'lead_professional',
        certifiedAmount: { currency: 'ZAR', amount: 200_000 },
        partialReleases: [],
        retentionRecord: { amount: { currency: 'ZAR', amount: 20_000 } },
      }),
    });
    mockUpdate.mockResolvedValue(undefined);

    await validatePartialRelease('claim-5', { currency: 'ZAR', amount: 100_000 });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        partialReleases: expect.arrayContaining([
          expect.objectContaining({
            amount: { currency: 'ZAR', amount: 100_000 },
            releaseId: expect.any(String),
            releasedAtIso: expect.any(String),
          }),
        ]),
      }),
    );
  });
});
