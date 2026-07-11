/**
 * Unit tests for escrowStateMachine.transitionEscrow, handleFundingTimeout,
 * raiseDispute, and resolveDispute.
 *
 * Covers:
 * - Valid state transitions with proper evidence
 * - Invalid state transitions (rejected with current state and allowed targets)
 * - Evidence-specific validation for each transition path
 * - Audit record generation for every transition (success and failure)
 * - Timeout handling, dispute raising, and dispute resolution
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  transitionEscrow,
  handleFundingTimeout,
  raiseDispute,
  resolveDispute,
  VALID_TRANSITIONS,
  type EscrowWallet,
  type TransitionEvidence,
  type EscrowState,
  type DisputeResolution,
} from './escrowStateMachine';

// Mock the audit trail service to avoid Firestore dependencies
vi.mock('./auditTrailService', () => ({
  writeImmutableAuditRecord: vi.fn().mockResolvedValue('mock-audit-id'),
  createAuditEntry: vi.fn((auditId, action, notes, actorRole, timestampIso) => ({
    auditId,
    action,
    notes,
    actorRole,
    timestampIso,
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createWallet(overrides: Partial<EscrowWallet> = {}): EscrowWallet {
  return {
    walletId: 'wallet-001',
    projectId: 'proj-001',
    state: 'Unfunded',
    providerId: 'provider-001',
    createdAtIso: '2025-01-01T00:00:00.000Z',
    lastTransitionAtIso: '2025-01-01T00:00:00.000Z',
    ownerId: 'owner-uid-001',
    ...overrides,
  };
}

function createEvidence(overrides: Partial<TransitionEvidence> = {}): TransitionEvidence {
  return {
    type: 'provider_webhook',
    referenceId: 'ref-001',
    actorUid: 'actor-uid-001',
    timestampIso: '2025-01-01T00:01:00.000Z',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('transitionEscrow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Invalid state transitions', () => {
    it('should reject transition from Released (terminal state)', () => {
      const wallet = createWallet({ state: 'Released' });
      const evidence = createEvidence();

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.currentState).toBe('Released');
      expect(result.error!.allowedTargets).toEqual([]);
      expect(result.error!.reason).toContain('Invalid state transition');
    });

    it('should reject Unfunded → Released (not allowed)', () => {
      const wallet = createWallet({ state: 'Unfunded' });
      const evidence = createEvidence();

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.currentState).toBe('Unfunded');
      expect(result.error!.allowedTargets).toEqual(['FundedHeld']);
    });

    it('should reject Unfunded → Disputed (not allowed)', () => {
      const wallet = createWallet({ state: 'Unfunded' });
      const evidence = createEvidence();

      const result = transitionEscrow(wallet, 'Disputed', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.allowedTargets).toEqual(['FundedHeld']);
    });

    it('should reject FundedHeld → Unfunded (not allowed)', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence();

      const result = transitionEscrow(wallet, 'Unfunded', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.allowedTargets).toEqual(['Released', 'Disputed']);
    });

    it('should always return the original wallet on failure', () => {
      const wallet = createWallet({ state: 'Released' });
      const evidence = createEvidence();

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.wallet).toBe(wallet);
    });

    it('should include an audit record on failure', () => {
      const wallet = createWallet({ state: 'Released' });
      const evidence = createEvidence({ actorUid: 'bad-actor-uid' });

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('escrow_transition_rejected');
      expect(result.auditRecord.notes).toContain('bad-actor-uid');
    });
  });

  describe('Unfunded → FundedHeld', () => {
    it('should accept valid provider webhook within 300s', () => {
      const wallet = createWallet({
        state: 'Unfunded',
        lastTransitionAtIso: '2025-01-01T00:00:00.000Z',
      });
      const evidence = createEvidence({
        type: 'provider_webhook',
        timestampIso: '2025-01-01T00:04:00.000Z', // 240s later — within 300s
      });

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.success).toBe(true);
      expect(result.wallet.state).toBe('FundedHeld');
      expect(result.wallet.lastTransitionAtIso).toBe('2025-01-01T00:04:00.000Z');
    });

    it('should reject if webhook arrives after 300s', () => {
      const wallet = createWallet({
        state: 'Unfunded',
        lastTransitionAtIso: '2025-01-01T00:00:00.000Z',
      });
      const evidence = createEvidence({
        type: 'provider_webhook',
        timestampIso: '2025-01-01T00:06:00.000Z', // 360s later — exceeds 300s
      });

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('300s');
    });

    it('should reject if evidence type is not provider_webhook', () => {
      const wallet = createWallet({ state: 'Unfunded' });
      const evidence = createEvidence({ type: 'payment_certificate' });

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('provider_webhook');
    });
  });

  describe('FundedHeld → Released', () => {
    it('should accept valid payment certificate with all requirements met', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'payment_certificate',
        metadata: {
          signedCertificateId: 'cert-001',
          allMilestonesApproved: true,
          hasEscrowReleasePermission: true,
          isClaimInitiator: false,
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(true);
      expect(result.wallet.state).toBe('Released');
    });

    it('should reject if signed certificate is missing', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'payment_certificate',
        metadata: {
          allMilestonesApproved: true,
          hasEscrowReleasePermission: true,
          isClaimInitiator: false,
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('signed payment certificate');
    });

    it('should reject if not all milestones approved', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'payment_certificate',
        metadata: {
          signedCertificateId: 'cert-001',
          allMilestonesApproved: false,
          hasEscrowReleasePermission: true,
          isClaimInitiator: false,
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('milestones');
    });

    it('should reject if actor lacks escrow:release permission', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'payment_certificate',
        metadata: {
          signedCertificateId: 'cert-001',
          allMilestonesApproved: true,
          hasEscrowReleasePermission: false,
          isClaimInitiator: false,
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('escrow:release');
    });

    it('should reject if actor is the claim initiator (separation of duty)', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'payment_certificate',
        metadata: {
          signedCertificateId: 'cert-001',
          allMilestonesApproved: true,
          hasEscrowReleasePermission: true,
          isClaimInitiator: true,
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('claim initiator');
    });
  });

  describe('FundedHeld → Disputed', () => {
    it('should accept valid dispute filing within 5s', () => {
      const now = new Date();
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'dispute_filing',
        timestampIso: now.toISOString(), // now — within 5s
      });

      const result = transitionEscrow(wallet, 'Disputed', evidence);

      expect(result.success).toBe(true);
      expect(result.wallet.state).toBe('Disputed');
    });

    it('should reject if evidence type is not dispute_filing', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'provider_webhook',
        timestampIso: new Date().toISOString(),
      });

      const result = transitionEscrow(wallet, 'Disputed', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('dispute_filing');
    });

    it('should reject if dispute filing is older than 5s', () => {
      const oldTime = new Date(Date.now() - 10000); // 10s ago
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'dispute_filing',
        timestampIso: oldTime.toISOString(),
      });

      const result = transitionEscrow(wallet, 'Disputed', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('5s');
    });
  });

  describe('Disputed → Released (claimant wins)', () => {
    it('should accept valid resolution in favour of claimant', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const evidence = createEvidence({
        type: 'dispute_resolution',
        metadata: {
          outcome: 'in_favour_of_claimant',
          hasDisputeResolvePermission: true,
          isPartyToDispute: false,
          signatureReference: 'sig-001',
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(true);
      expect(result.wallet.state).toBe('Released');
    });

    it('should reject if outcome is not in_favour_of_claimant', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const evidence = createEvidence({
        type: 'dispute_resolution',
        metadata: {
          outcome: 'in_favour_of_funder',
          hasDisputeResolvePermission: true,
          isPartyToDispute: false,
          signatureReference: 'sig-001',
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('in_favour_of_claimant');
    });

    it('should reject if resolver lacks dispute:resolve permission', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const evidence = createEvidence({
        type: 'dispute_resolution',
        metadata: {
          outcome: 'in_favour_of_claimant',
          hasDisputeResolvePermission: false,
          isPartyToDispute: false,
          signatureReference: 'sig-001',
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('dispute:resolve');
    });

    it('should reject if resolver is a party to the dispute', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const evidence = createEvidence({
        type: 'dispute_resolution',
        metadata: {
          outcome: 'in_favour_of_claimant',
          hasDisputeResolvePermission: true,
          isPartyToDispute: true,
          signatureReference: 'sig-001',
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('not be a party');
    });

    it('should reject if signature reference is missing', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const evidence = createEvidence({
        type: 'dispute_resolution',
        metadata: {
          outcome: 'in_favour_of_claimant',
          hasDisputeResolvePermission: true,
          isPartyToDispute: false,
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('Digital signature');
    });
  });

  describe('Disputed → Unfunded (funder wins)', () => {
    it('should accept valid resolution in favour of funder (refund)', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const evidence = createEvidence({
        type: 'dispute_resolution',
        metadata: {
          outcome: 'in_favour_of_funder',
          hasDisputeResolvePermission: true,
          isPartyToDispute: false,
          signatureReference: 'sig-002',
        },
      });

      const result = transitionEscrow(wallet, 'Unfunded', evidence);

      expect(result.success).toBe(true);
      expect(result.wallet.state).toBe('Unfunded');
    });

    it('should reject if outcome is not in_favour_of_funder', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const evidence = createEvidence({
        type: 'dispute_resolution',
        metadata: {
          outcome: 'in_favour_of_claimant',
          hasDisputeResolvePermission: true,
          isPartyToDispute: false,
          signatureReference: 'sig-002',
        },
      });

      const result = transitionEscrow(wallet, 'Unfunded', evidence);

      expect(result.success).toBe(false);
      expect(result.error!.reason).toContain('in_favour_of_funder');
    });
  });

  describe('Audit records', () => {
    it('should include audit record on successful transition', () => {
      const wallet = createWallet({
        state: 'Unfunded',
        lastTransitionAtIso: '2025-01-01T00:00:00.000Z',
      });
      const evidence = createEvidence({
        type: 'provider_webhook',
        timestampIso: '2025-01-01T00:01:00.000Z',
      });

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.success).toBe(true);
      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('escrow_funded');
      expect(result.auditRecord.notes).toContain('Unfunded → FundedHeld');
      expect(result.auditRecord.notes).toContain(evidence.actorUid);
    });

    it('should include audit record on rejected transition', () => {
      const wallet = createWallet({ state: 'Released' });
      const evidence = createEvidence({ actorUid: 'attacker-uid' });

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.success).toBe(false);
      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.notes).toContain('attacker-uid');
    });

    it('should use escrow_released action for Released target', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'payment_certificate',
        metadata: {
          signedCertificateId: 'cert-001',
          allMilestonesApproved: true,
          hasEscrowReleasePermission: true,
          isClaimInitiator: false,
        },
      });

      const result = transitionEscrow(wallet, 'Released', evidence);

      expect(result.auditRecord.action).toBe('escrow_released');
    });

    it('should use escrow_disputed action for Disputed target', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const evidence = createEvidence({
        type: 'dispute_filing',
        timestampIso: new Date().toISOString(),
      });

      const result = transitionEscrow(wallet, 'Disputed', evidence);

      expect(result.auditRecord.action).toBe('escrow_disputed');
    });

    it('should use refund_initiated action for Unfunded target (refund)', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const evidence = createEvidence({
        type: 'dispute_resolution',
        metadata: {
          outcome: 'in_favour_of_funder',
          hasDisputeResolvePermission: true,
          isPartyToDispute: false,
          signatureReference: 'sig-003',
        },
      });

      const result = transitionEscrow(wallet, 'Unfunded', evidence);

      expect(result.auditRecord.action).toBe('refund_initiated');
    });
  });

  describe('Wallet state update', () => {
    it('should update lastTransitionAtIso on successful transition', () => {
      const wallet = createWallet({
        state: 'Unfunded',
        lastTransitionAtIso: '2025-01-01T00:00:00.000Z',
      });
      const evidence = createEvidence({
        type: 'provider_webhook',
        timestampIso: '2025-01-01T00:02:00.000Z',
      });

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.wallet.lastTransitionAtIso).toBe('2025-01-01T00:02:00.000Z');
    });

    it('should update providerReference on successful transition', () => {
      const wallet = createWallet({
        state: 'Unfunded',
        lastTransitionAtIso: '2025-01-01T00:00:00.000Z',
      });
      const evidence = createEvidence({
        type: 'provider_webhook',
        referenceId: 'webhook-ref-xyz',
        timestampIso: '2025-01-01T00:01:00.000Z',
      });

      const result = transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(result.wallet.providerReference).toBe('webhook-ref-xyz');
    });

    it('should not mutate the original wallet object', () => {
      const wallet = createWallet({
        state: 'Unfunded',
        lastTransitionAtIso: '2025-01-01T00:00:00.000Z',
      });
      const evidence = createEvidence({
        type: 'provider_webhook',
        timestampIso: '2025-01-01T00:01:00.000Z',
      });

      transitionEscrow(wallet, 'FundedHeld', evidence);

      expect(wallet.state).toBe('Unfunded'); // original unchanged
    });
  });

  describe('VALID_TRANSITIONS map', () => {
    it('should define exactly 4 states', () => {
      expect(Object.keys(VALID_TRANSITIONS)).toHaveLength(4);
    });

    it('Released should be a terminal state with no targets', () => {
      expect(VALID_TRANSITIONS.Released).toEqual([]);
    });

    it('Unfunded should only allow FundedHeld', () => {
      expect(VALID_TRANSITIONS.Unfunded).toEqual(['FundedHeld']);
    });

    it('FundedHeld should allow Released and Disputed', () => {
      expect(VALID_TRANSITIONS.FundedHeld).toEqual(['Released', 'Disputed']);
    });

    it('Disputed should allow Released and Unfunded', () => {
      expect(VALID_TRANSITIONS.Disputed).toEqual(['Released', 'Unfunded']);
    });
  });
});

// ─── handleFundingTimeout Tests ───────────────────────────────────────────────

describe('handleFundingTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed on Unfunded wallet and keep state as Unfunded', () => {
    const wallet = createWallet({ state: 'Unfunded' });

    const result = handleFundingTimeout(wallet);

    expect(result.success).toBe(true);
    expect(result.wallet.state).toBe('Unfunded');
  });

  it('should return the same wallet reference (state unchanged)', () => {
    const wallet = createWallet({ state: 'Unfunded' });

    const result = handleFundingTimeout(wallet);

    expect(result.wallet).toBe(wallet);
  });

  it('should write an audit record with escrow_timeout action', () => {
    const wallet = createWallet({ state: 'Unfunded', walletId: 'timeout-wallet-001' });

    const result = handleFundingTimeout(wallet);

    expect(result.auditRecord).toBeDefined();
    expect(result.auditRecord.action).toBe('escrow_timeout');
    expect(result.auditRecord.notes).toContain('timeout-wallet-001');
    expect(result.auditRecord.notes).toContain('timed out');
  });

  it('should include owner info in audit record', () => {
    const wallet = createWallet({ state: 'Unfunded', ownerId: 'owner-xyz' });

    const result = handleFundingTimeout(wallet);

    expect(result.auditRecord.notes).toContain('owner-xyz');
  });

  it('should reject if wallet is in FundedHeld state', () => {
    const wallet = createWallet({ state: 'FundedHeld' });

    const result = handleFundingTimeout(wallet);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.currentState).toBe('FundedHeld');
    expect(result.error!.reason).toContain('Unfunded');
  });

  it('should reject if wallet is in Released state', () => {
    const wallet = createWallet({ state: 'Released' });

    const result = handleFundingTimeout(wallet);

    expect(result.success).toBe(false);
    expect(result.error!.currentState).toBe('Released');
  });

  it('should reject if wallet is in Disputed state', () => {
    const wallet = createWallet({ state: 'Disputed' });

    const result = handleFundingTimeout(wallet);

    expect(result.success).toBe(false);
    expect(result.error!.currentState).toBe('Disputed');
  });
});

// ─── raiseDispute Tests ───────────────────────────────────────────────────────

describe('raiseDispute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should transition FundedHeld wallet to Disputed', () => {
    const wallet = createWallet({ state: 'FundedHeld' });

    const result = raiseDispute(wallet, 'Non-delivery of materials');

    expect(result.success).toBe(true);
    expect(result.wallet.state).toBe('Disputed');
  });

  it('should write an audit record with escrow_disputed action', () => {
    const wallet = createWallet({ state: 'FundedHeld' });

    const result = raiseDispute(wallet, 'Quality issue');

    expect(result.auditRecord).toBeDefined();
    expect(result.auditRecord.action).toBe('escrow_disputed');
  });

  it('should not mutate the original wallet', () => {
    const wallet = createWallet({ state: 'FundedHeld' });

    raiseDispute(wallet, 'Dispute reason');

    expect(wallet.state).toBe('FundedHeld');
  });

  it('should reject if wallet is in Unfunded state', () => {
    const wallet = createWallet({ state: 'Unfunded' });

    const result = raiseDispute(wallet, 'Some reason');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.currentState).toBe('Unfunded');
    expect(result.error!.reason).toContain('FundedHeld');
  });

  it('should reject if wallet is in Released state', () => {
    const wallet = createWallet({ state: 'Released' });

    const result = raiseDispute(wallet, 'Too late');

    expect(result.success).toBe(false);
    expect(result.error!.currentState).toBe('Released');
  });

  it('should reject if wallet is already Disputed', () => {
    const wallet = createWallet({ state: 'Disputed' });

    const result = raiseDispute(wallet, 'Another dispute');

    expect(result.success).toBe(false);
    expect(result.error!.currentState).toBe('Disputed');
  });

  it('should update lastTransitionAtIso on success', () => {
    const wallet = createWallet({
      state: 'FundedHeld',
      lastTransitionAtIso: '2025-01-01T00:00:00.000Z',
    });

    const result = raiseDispute(wallet, 'Dispute reason');

    expect(result.success).toBe(true);
    // Should have a new timestamp (not the original)
    expect(result.wallet.lastTransitionAtIso).not.toBe('2025-01-01T00:00:00.000Z');
  });
});

// ─── resolveDispute Tests ─────────────────────────────────────────────────────

describe('resolveDispute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createResolution(overrides: Partial<DisputeResolution> = {}): DisputeResolution {
    return {
      outcome: 'in_favour_of_claimant',
      resolverUid: 'resolver-uid-001',
      reason: 'Evidence supports the claimant position',
      signatureReference: 'sig-ref-001',
      resolvedAtIso: new Date().toISOString(),
      ...overrides,
    };
  }

  describe('in_favour_of_claimant (release)', () => {
    it('should transition Disputed wallet to Released', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const resolution = createResolution({ outcome: 'in_favour_of_claimant' });

      const result = resolveDispute(wallet, resolution);

      expect(result.success).toBe(true);
      expect(result.wallet.state).toBe('Released');
    });

    it('should write an audit record with escrow_released action', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const resolution = createResolution({ outcome: 'in_favour_of_claimant' });

      const result = resolveDispute(wallet, resolution);

      expect(result.auditRecord.action).toBe('escrow_released');
    });

    it('should not mutate the original wallet', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const resolution = createResolution({ outcome: 'in_favour_of_claimant' });

      resolveDispute(wallet, resolution);

      expect(wallet.state).toBe('Disputed');
    });
  });

  describe('in_favour_of_funder (refund)', () => {
    it('should transition Disputed wallet to Unfunded (refund)', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const resolution = createResolution({ outcome: 'in_favour_of_funder' });

      const result = resolveDispute(wallet, resolution);

      expect(result.success).toBe(true);
      expect(result.wallet.state).toBe('Unfunded');
    });

    it('should write an audit record with refund_initiated action', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const resolution = createResolution({ outcome: 'in_favour_of_funder' });

      const result = resolveDispute(wallet, resolution);

      expect(result.auditRecord.action).toBe('refund_initiated');
    });
  });

  describe('invalid state', () => {
    it('should reject if wallet is in Unfunded state', () => {
      const wallet = createWallet({ state: 'Unfunded' });
      const resolution = createResolution();

      const result = resolveDispute(wallet, resolution);

      expect(result.success).toBe(false);
      expect(result.error!.currentState).toBe('Unfunded');
      expect(result.error!.reason).toContain('Disputed');
    });

    it('should reject if wallet is in FundedHeld state', () => {
      const wallet = createWallet({ state: 'FundedHeld' });
      const resolution = createResolution();

      const result = resolveDispute(wallet, resolution);

      expect(result.success).toBe(false);
      expect(result.error!.currentState).toBe('FundedHeld');
    });

    it('should reject if wallet is in Released state', () => {
      const wallet = createWallet({ state: 'Released' });
      const resolution = createResolution();

      const result = resolveDispute(wallet, resolution);

      expect(result.success).toBe(false);
      expect(result.error!.currentState).toBe('Released');
    });
  });

  describe('evidence validation (delegates to transitionEscrow)', () => {
    it('should set resolver UID as the actor', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const resolution = createResolution({ resolverUid: 'resolver-abc' });

      const result = resolveDispute(wallet, resolution);

      expect(result.success).toBe(true);
      expect(result.auditRecord.notes).toContain('resolver-abc');
    });

    it('should use the resolution timestamp', () => {
      const wallet = createWallet({ state: 'Disputed' });
      const resolution = createResolution({
        resolvedAtIso: '2025-06-15T12:00:00.000Z',
      });

      const result = resolveDispute(wallet, resolution);

      expect(result.success).toBe(true);
      expect(result.wallet.lastTransitionAtIso).toBe('2025-06-15T12:00:00.000Z');
    });
  });
});
