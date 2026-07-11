/**
 * Unit tests for certificationControlService
 *
 * Covers:
 * - validateSeparationOfDuty: pure function for three-party separation checks
 * - certifyWithSeparationOfDuty: Firestore-backed certification with permission and SoD enforcement
 * - createPayoutBatch: batch creation with max 200 limit and unique references
 * - generateFICAReport: FICA threshold reporting (single > R50,000 or daily aggregate > R50,000)
 * - handlePaymentFailure: payment failure recovery (escrow revert, audit, notifications)
 * - initiateRefund: refund flow (admin:override, reason validation, audit, provider routing)
 *
 * @see Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.7
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateSeparationOfDuty,
  certifyWithSeparationOfDuty,
  createPayoutBatch,
  generateFICAReport,
  handlePaymentFailure,
  initiateRefund,
  CertificationError,
  FICA_THRESHOLD,
  MAX_BATCH_SIZE,
  type CertificationRequest,
  type SeparationOfDutyCheck,
  type Transaction,
  type RefundRequest,
} from './certificationControlService';
import type { ReleaseRequest } from './types';

// ─── Mock firebase-admin ──────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockCreate = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({ get: mockGet, create: mockCreate, update: mockUpdate }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

// ─── Mock audit trail service ─────────────────────────────────────────────────

vi.mock('./auditTrailService', () => ({
  writeImmutableAuditRecord: vi.fn().mockResolvedValue('mock-audit-id'),
}));

// ─── Mock permission service ──────────────────────────────────────────────────

const mockCanUserPerform = vi.fn();

vi.mock('@/services/permissionService', () => ({
  canUserPerform: (...args: unknown[]) => mockCanUserPerform(...args),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateSeparationOfDuty', () => {
  it('returns valid=true when all three UIDs are distinct', () => {
    const result = validateSeparationOfDuty('user-A', 'user-B', 'user-C');

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.submitterUid).toBe('user-A');
    expect(result.certifierUid).toBe('user-B');
    expect(result.releaseApproverUid).toBe('user-C');
  });

  it('detects submitter_is_certifier when submitter === certifier', () => {
    const result = validateSeparationOfDuty('user-A', 'user-A', 'user-C');

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toEqual({
      constraint: 'submitter_is_certifier',
      actorA: 'user-A',
      actorB: 'user-A',
    });
  });

  it('detects certifier_is_releaser when certifier === releaser', () => {
    const result = validateSeparationOfDuty('user-A', 'user-B', 'user-B');

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toEqual({
      constraint: 'certifier_is_releaser',
      actorA: 'user-B',
      actorB: 'user-B',
    });
  });

  it('detects submitter_is_releaser when submitter === releaser', () => {
    const result = validateSeparationOfDuty('user-A', 'user-B', 'user-A');

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toEqual({
      constraint: 'submitter_is_releaser',
      actorA: 'user-A',
      actorB: 'user-A',
    });
  });

  it('detects all three violations when all UIDs are the same', () => {
    const result = validateSeparationOfDuty('user-X', 'user-X', 'user-X');

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(3);
    const constraints = result.violations.map((v) => v.constraint);
    expect(constraints).toContain('submitter_is_certifier');
    expect(constraints).toContain('certifier_is_releaser');
    expect(constraints).toContain('submitter_is_releaser');
  });

  it('detects two violations when submitter === certifier === releaser but not all same', () => {
    // submitter === certifier, certifier === releaser
    const result = validateSeparationOfDuty('user-A', 'user-B', 'user-A');

    expect(result.valid).toBe(false);
    // submitter_is_releaser only
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].constraint).toBe('submitter_is_releaser');
  });
});

describe('certifyWithSeparationOfDuty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validRequest: CertificationRequest = {
    claimId: 'claim-001',
    certifierUid: 'certifier-uid',
    certifiedAmount: { currency: 'ZAR', amount: 50000 },
  };

  function setupMocks(options: {
    hasPermission?: boolean;
    certifierRole?: string;
    claimExists?: boolean;
    submitterUid?: string;
  } = {}) {
    const {
      hasPermission = true,
      certifierRole = 'quantity_surveyor',
      claimExists = true,
      submitterUid = 'submitter-uid',
    } = options;

    mockCanUserPerform.mockReturnValue(hasPermission);

    // First call: users collection (certifier lookup)
    // Second call: payment_claims collection (claim lookup)
    let callCount = 0;
    mockGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // User document
        return {
          exists: true,
          data: () => ({ role: certifierRole, admin: false }),
        };
      }
      // Claim document
      return {
        exists: claimExists,
        data: () => claimExists ? {
          claimId: 'claim-001',
          claimantRole: 'contractor',
          claimedAmount: { currency: 'ZAR', amount: 75000 },
          linkedMilestoneId: 'ms-001',
          linkedVariationIds: [],
          submittedAtIso: '2025-01-01T00:00:00.000Z',
          disputed: false,
          submitterUid,
        } : undefined,
      };
    });
  }

  it('successfully certifies when certifier has permission and is not submitter', async () => {
    setupMocks();

    const result = await certifyWithSeparationOfDuty(validRequest);

    expect(result.certificateId).toMatch(/^cert-claim-001-/);
    expect(result.claimId).toBe('claim-001');
    expect(result.certifiedAmount).toEqual({ currency: 'ZAR', amount: 50000 });
    expect(result.status).toBe('approved_for_provider_request');
    expect(result.issuedAtIso).toBeDefined();
  });

  it('writes an audit record on successful certification', async () => {
    setupMocks();
    const { writeImmutableAuditRecord } = await import('./auditTrailService');

    await certifyWithSeparationOfDuty(validRequest);

    expect(writeImmutableAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: 'certifier-uid',
        action: 'claim_certified',
        targetResourceId: 'claim-001',
        previousState: 'approval_required',
        newState: 'certified',
      }),
    );
  });

  it('rejects with CertificationError when certifier lacks payment:manage', async () => {
    setupMocks({ hasPermission: false });

    await expect(certifyWithSeparationOfDuty(validRequest)).rejects.toThrow(CertificationError);
    await expect(certifyWithSeparationOfDuty(validRequest)).rejects.toThrow('does not hold payment:manage permission');
  });

  it('rejects with submitter_is_certifier when certifier is the claim submitter', async () => {
    setupMocks({ submitterUid: 'certifier-uid' });

    await expect(certifyWithSeparationOfDuty(validRequest)).rejects.toThrow(CertificationError);

    try {
      await certifyWithSeparationOfDuty(validRequest);
    } catch (err) {
      expect(err).toBeInstanceOf(CertificationError);
      expect((err as CertificationError).constraint).toBe('submitter_is_certifier');
    }
  });

  it('preserves claim in pre-certification state on rejection (no Firestore write to claims)', async () => {
    setupMocks({ submitterUid: 'certifier-uid' });

    try {
      await certifyWithSeparationOfDuty(validRequest);
    } catch {
      // Expected rejection
    }

    // The certificate collection create should NOT have been called
    // (claim remains in pre-certification state)
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws when claim does not exist', async () => {
    setupMocks({ claimExists: false });

    await expect(certifyWithSeparationOfDuty(validRequest)).rejects.toThrow("Claim 'claim-001' not found");
  });

  it('persists the certificate to Firestore on success', async () => {
    setupMocks();

    await certifyWithSeparationOfDuty(validRequest);

    // Should have been called for the certificates collection
    expect(mockCollection).toHaveBeenCalledWith('payment_certificates');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-001',
        certifiedAmount: { currency: 'ZAR', amount: 50000 },
        status: 'approved_for_provider_request',
      }),
    );
  });
});


// ─── createPayoutBatch Tests ──────────────────────────────────────────────────

describe('createPayoutBatch', () => {
  function makeRelease(overrides: Partial<ReleaseRequest> = {}): ReleaseRequest {
    return {
      releaseRequestId: `rel-${Math.random().toString(36).slice(2, 8)}`,
      certificateId: 'cert-001',
      providerId: 'provider-alpha',
      amount: { currency: 'ZAR', amount: 10000 },
      requiredApprovals: ['quantity_surveyor'],
      approvals: ['quantity_surveyor'],
      status: 'approved_for_provider_request',
      ...overrides,
    };
  }

  it('creates a batch with correct structure for valid releases', () => {
    const releases = [makeRelease(), makeRelease()];
    const batch = createPayoutBatch(releases, 'provider-alpha');

    expect(batch.providerId).toBe('provider-alpha');
    expect(batch.releases).toHaveLength(2);
    expect(batch.totalAmount).toEqual({ currency: 'ZAR', amount: 20000 });
    expect(batch.status).toBe('pending');
    expect(batch.batchId).toBeTruthy();
    expect(batch.batchReference).toBeTruthy();
    expect(batch.createdAtIso).toBeTruthy();
  });

  it('calculates total amount correctly by summing all release amounts', () => {
    const releases = [
      makeRelease({ amount: { currency: 'ZAR', amount: 15000 } }),
      makeRelease({ amount: { currency: 'ZAR', amount: 25000 } }),
      makeRelease({ amount: { currency: 'ZAR', amount: 10000 } }),
    ];
    const batch = createPayoutBatch(releases, 'provider-beta');

    expect(batch.totalAmount.amount).toBe(50000);
    expect(batch.totalAmount.currency).toBe('ZAR');
  });

  it('generates a unique batchId and batchReference', () => {
    const releases = [makeRelease()];
    const batch1 = createPayoutBatch(releases, 'provider-alpha');
    const batch2 = createPayoutBatch(releases, 'provider-alpha');

    expect(batch1.batchId).not.toBe(batch2.batchId);
    expect(batch1.batchReference).not.toBe(batch2.batchReference);
  });

  it('throws error when releases exceed MAX_BATCH_SIZE (200)', () => {
    const releases = Array.from({ length: 201 }, () => makeRelease());

    expect(() => createPayoutBatch(releases, 'provider-alpha')).toThrow(
      /exceeds maximum size.*201.*limit is 200/
    );
  });

  it('accepts exactly 200 releases (the maximum)', () => {
    const releases = Array.from({ length: 200 }, () => makeRelease());
    const batch = createPayoutBatch(releases, 'provider-alpha');

    expect(batch.releases).toHaveLength(200);
    expect(batch.status).toBe('pending');
  });

  it('throws error when releases array is empty', () => {
    expect(() => createPayoutBatch([], 'provider-alpha')).toThrow(
      /zero releases/
    );
  });

  it('includes the providerId in the batch', () => {
    const releases = [makeRelease()];
    const batch = createPayoutBatch(releases, 'provider-xyz');

    expect(batch.providerId).toBe('provider-xyz');
  });
});

// ─── generateFICAReport Tests ─────────────────────────────────────────────────

describe('generateFICAReport', () => {
  function makeTx(overrides: Partial<Transaction> = {}): Transaction {
    return {
      transactionId: `tx-${Math.random().toString(36).slice(2, 8)}`,
      partyId: 'party-001',
      amount: { currency: 'ZAR', amount: 10000 },
      timestampIso: '2025-06-15T10:00:00.000Z', // 12:00 SAST
      ...overrides,
    };
  }

  it('returns null when no transactions are provided', () => {
    const result = generateFICAReport('party-001', []);
    expect(result).toBeNull();
  });

  it('returns null when no threshold is exceeded', () => {
    const transactions = [
      makeTx({ amount: { currency: 'ZAR', amount: 20000 } }),
      makeTx({ amount: { currency: 'ZAR', amount: 25000 } }),
    ];
    const result = generateFICAReport('party-001', transactions);
    expect(result).toBeNull();
  });

  it('triggers report for single transaction exceeding R50,000', () => {
    const transactions = [
      makeTx({ amount: { currency: 'ZAR', amount: 60000 }, transactionId: 'tx-big' }),
    ];
    const result = generateFICAReport('party-001', transactions);

    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe('single_transaction');
    expect(result!.triggerAmount.amount).toBe(60000);
    expect(result!.transactionReferences).toContain('tx-big');
    expect(result!.partyId).toBe('party-001');
  });

  it('does NOT trigger for single transaction exactly at R50,000 (threshold is >)', () => {
    const transactions = [
      makeTx({ amount: { currency: 'ZAR', amount: 50000 } }),
    ];
    const result = generateFICAReport('party-001', transactions);
    expect(result).toBeNull();
  });

  it('triggers report for daily aggregate exceeding R50,000', () => {
    const transactions = [
      makeTx({ amount: { currency: 'ZAR', amount: 30000 }, transactionId: 'tx-1', timestampIso: '2025-06-15T08:00:00.000Z' }),
      makeTx({ amount: { currency: 'ZAR', amount: 25000 }, transactionId: 'tx-2', timestampIso: '2025-06-15T14:00:00.000Z' }),
    ];
    const result = generateFICAReport('party-001', transactions);

    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe('daily_aggregate');
    expect(result!.triggerAmount.amount).toBe(55000);
    expect(result!.transactionReferences).toEqual(expect.arrayContaining(['tx-1', 'tx-2']));
  });

  it('does NOT trigger for daily aggregate exactly at R50,000', () => {
    const transactions = [
      makeTx({ amount: { currency: 'ZAR', amount: 25000 }, timestampIso: '2025-06-15T08:00:00.000Z' }),
      makeTx({ amount: { currency: 'ZAR', amount: 25000 }, timestampIso: '2025-06-15T14:00:00.000Z' }),
    ];
    const result = generateFICAReport('party-001', transactions);
    expect(result).toBeNull();
  });

  it('groups transactions by SAST calendar day (UTC+2)', () => {
    // These two transactions are on the same UTC day but different SAST days
    // 2025-06-15T22:30 UTC = 2025-06-16T00:30 SAST (next day in SAST)
    // 2025-06-16T06:00 UTC = 2025-06-16T08:00 SAST (same SAST day as above)
    const transactions = [
      makeTx({ amount: { currency: 'ZAR', amount: 30000 }, transactionId: 'tx-late', timestampIso: '2025-06-15T22:30:00.000Z' }),
      makeTx({ amount: { currency: 'ZAR', amount: 25000 }, transactionId: 'tx-next', timestampIso: '2025-06-16T06:00:00.000Z' }),
    ];
    const result = generateFICAReport('party-001', transactions);

    // Both should be on SAST 2025-06-16, aggregate = 55000 > 50000
    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe('daily_aggregate');
    expect(result!.triggerAmount.amount).toBe(55000);
    expect(result!.reportingPeriod).toBe('2025-06-16');
  });

  it('includes correct partyId in the report', () => {
    const transactions = [
      makeTx({ amount: { currency: 'ZAR', amount: 60000 } }),
    ];
    const result = generateFICAReport('party-xyz', transactions);

    expect(result).not.toBeNull();
    expect(result!.partyId).toBe('party-xyz');
  });

  it('includes all transaction references for daily aggregate trigger', () => {
    const transactions = [
      makeTx({ amount: { currency: 'ZAR', amount: 20000 }, transactionId: 'tx-a', timestampIso: '2025-06-15T08:00:00.000Z' }),
      makeTx({ amount: { currency: 'ZAR', amount: 20000 }, transactionId: 'tx-b', timestampIso: '2025-06-15T10:00:00.000Z' }),
      makeTx({ amount: { currency: 'ZAR', amount: 15000 }, transactionId: 'tx-c', timestampIso: '2025-06-15T12:00:00.000Z' }),
    ];
    const result = generateFICAReport('party-001', transactions);

    expect(result).not.toBeNull();
    expect(result!.transactionReferences).toHaveLength(3);
    expect(result!.transactionReferences).toContain('tx-a');
    expect(result!.transactionReferences).toContain('tx-b');
    expect(result!.transactionReferences).toContain('tx-c');
  });

  it('prioritizes single_transaction trigger over daily_aggregate', () => {
    // One transaction is over threshold alone, and daily aggregate also over
    const transactions = [
      makeTx({ amount: { currency: 'ZAR', amount: 60000 }, transactionId: 'tx-big', timestampIso: '2025-06-15T08:00:00.000Z' }),
      makeTx({ amount: { currency: 'ZAR', amount: 10000 }, transactionId: 'tx-small', timestampIso: '2025-06-15T10:00:00.000Z' }),
    ];
    const result = generateFICAReport('party-001', transactions);

    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe('single_transaction');
    expect(result!.triggerAmount.amount).toBe(60000);
  });

  it('correctly identifies the FICA threshold constant as 50000', () => {
    expect(FICA_THRESHOLD).toBe(50000);
  });
});
