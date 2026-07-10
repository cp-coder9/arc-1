/**
 * Governance Bridge Service — Unit Tests
 *
 * Tests the bridge between remote desktop sessions and existing booking governance.
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 *
 * Correctness Property 7 — Governance Preservation:
 * ∀ session where session.status === 'completed',
 *   ∃ ledgerEntry: ResourceUsageLedgerEntry
 *     where ledgerEntry.bookingId === session.bookingId
 *   ∧ session.ownerApproved === false → billingNotFinalised(session)
 */

import {
  validateBookingGovernance,
  checkBookingConflicts,
  createUsageRecord,
  extendBookingLifecycle,
  detectUnfinalisedBilling,
  isAutoPayoutProhibited,
  isHumanApprovalRequired,
  _clearAllState,
  _getLifecycleTransitions,
  _getUnfinalisedFlags,
  type GovernanceBridgeInput,
  type SessionUsageInput,
  type BillingDetectionInput,
} from '../governanceBridgeService';

import type {
  ResourceBookingWindow,
  ResourceBookingRequest,
  ResourceUsageBillingPolicy,
} from '@/services/resourceBookingService';

import type { SessionRecord } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function makeBookingRequest(overrides?: Partial<ResourceBookingRequest>): ResourceBookingRequest {
  return {
    resourceId: 'resource-1',
    startsAt: '2026-01-15T09:00:00.000Z',
    endsAt: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

function makeExistingBooking(overrides?: Partial<ResourceBookingWindow>): ResourceBookingWindow {
  return {
    id: 'booking-existing',
    resourceId: 'resource-1',
    startsAt: '2026-01-15T14:00:00.000Z',
    endsAt: '2026-01-15T17:00:00.000Z',
    status: 'confirmed',
    ...overrides,
  };
}

function makeGovernanceInput(overrides?: Partial<GovernanceBridgeInput>): GovernanceBridgeInput {
  return {
    bookingId: 'booking-1',
    request: makeBookingRequest(),
    existingBookings: [],
    requestedBy: 'consumer-1',
    ownerId: 'owner-1',
    approvedBy: 'owner-1',
    checkedAt: '2026-01-15T08:30:00.000Z',
    ...overrides,
  };
}

function makeCompletedSession(overrides?: Partial<SessionRecord>): SessionRecord {
  return {
    sessionId: 'session-1',
    bookingId: 'booking-1',
    hostId: 'host-1',
    consumerUid: 'consumer-1',
    ownerUid: 'owner-1',
    projectRef: null,
    status: 'completed',
    connectionType: 'peer_to_peer',
    startedAt: '2026-01-15T09:00:00.000Z',
    endedAt: '2026-01-15T11:30:00.000Z',
    totalConnectedSeconds: 9000,
    totalDisconnectionGapSeconds: 0,
    applicationsUsed: ['AutoCAD', 'Revit'],
    filesProducedCount: 3,
    disconnectionReason: 'user_ended',
    billedDurationMinutes: 150,
    ownerApproved: false,
    recordingConsentGranted: true,
  };
}

function makeBillingPolicy(overrides?: Partial<ResourceUsageBillingPolicy>): ResourceUsageBillingPolicy {
  return {
    billingMode: 'hourly',
    hourlyRateCents: 5000,
    platformFeeBps: 1000,
    currency: 'ZAR',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('GovernanceBridgeService', () => {
  beforeEach(() => {
    _clearAllState();
  });

  // ═══ validateBookingGovernance (Req 12.1) ═══════════════════════════════════

  describe('validateBookingGovernance', () => {
    it('should approve a valid booking with owner approval', () => {
      const input = makeGovernanceInput({ approvedBy: 'owner-1' });
      const result = validateBookingGovernance(input);

      expect(result.canProceed).toBe(true);
      expect(result.decision.status).toBe('approved');
      expect(result.humanApprovalRequired).toBe(true);
      expect(result.autoConfirmProhibited).toBe(true);
    });

    it('should block a booking without owner approval', () => {
      const input = makeGovernanceInput({ approvedBy: undefined });
      const result = validateBookingGovernance(input);

      expect(result.canProceed).toBe(false);
      expect(result.decision.status).toBe('ready_for_owner_approval');
      expect(result.humanApprovalRequired).toBe(true);
    });

    it('should block a booking with conflicts', () => {
      const request = makeBookingRequest({
        startsAt: '2026-01-15T14:30:00.000Z',
        endsAt: '2026-01-15T16:00:00.000Z',
      });
      const conflicting = makeExistingBooking();

      const input = makeGovernanceInput({
        request,
        existingBookings: [conflicting],
        approvedBy: 'owner-1',
      });

      const result = validateBookingGovernance(input);
      expect(result.canProceed).toBe(false);
      expect(result.decision.status).toBe('blocked_conflict');
    });

    it('should always enforce humanApprovalRequired invariant', () => {
      const input = makeGovernanceInput();
      const result = validateBookingGovernance(input);
      expect(result.decision.humanApprovalRequired).toBe(true);
    });

    it('should always enforce autoConfirmProhibited invariant', () => {
      const input = makeGovernanceInput();
      const result = validateBookingGovernance(input);
      expect(result.decision.autoConfirmProhibited).toBe(true);
    });

    it('should handle cancelled booking correctly', () => {
      const input = makeGovernanceInput({ cancellationReason: 'No longer needed' });
      const result = validateBookingGovernance(input);
      expect(result.canProceed).toBe(false);
      expect(result.decision.status).toBe('cancelled');
    });
  });

  // ═══ checkBookingConflicts (Req 12.6) ═══════════════════════════════════════

  describe('checkBookingConflicts', () => {
    it('should return no conflicts when bookings do not overlap', () => {
      const request = makeBookingRequest({
        startsAt: '2026-01-15T09:00:00.000Z',
        endsAt: '2026-01-15T12:00:00.000Z',
      });
      const existing = [makeExistingBooking({
        startsAt: '2026-01-15T14:00:00.000Z',
        endsAt: '2026-01-15T17:00:00.000Z',
      })];

      const result = checkBookingConflicts(request, existing);
      expect(result.canConfirm).toBe(true);
      expect(result.conflicts).toHaveLength(0);
      expect(result.tokenBlocked).toBe(false);
    });

    it('should detect conflict when bookings overlap', () => {
      const request = makeBookingRequest({
        startsAt: '2026-01-15T13:00:00.000Z',
        endsAt: '2026-01-15T15:00:00.000Z',
      });
      const existing = [makeExistingBooking({
        startsAt: '2026-01-15T14:00:00.000Z',
        endsAt: '2026-01-15T17:00:00.000Z',
      })];

      const result = checkBookingConflicts(request, existing);
      expect(result.canConfirm).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.tokenBlocked).toBe(true);
    });

    it('should block token generation when conflict exists', () => {
      const request = makeBookingRequest({
        resourceId: 'resource-1',
        startsAt: '2026-01-15T14:30:00.000Z',
        endsAt: '2026-01-15T16:00:00.000Z',
      });
      const existing = [makeExistingBooking({
        resourceId: 'resource-1',
        startsAt: '2026-01-15T14:00:00.000Z',
        endsAt: '2026-01-15T17:00:00.000Z',
      })];

      const result = checkBookingConflicts(request, existing);
      expect(result.tokenBlocked).toBe(true);
    });

    it('should not flag conflicts for different resources', () => {
      const request = makeBookingRequest({
        resourceId: 'resource-1',
        startsAt: '2026-01-15T14:00:00.000Z',
        endsAt: '2026-01-15T17:00:00.000Z',
      });
      const existing = [makeExistingBooking({
        resourceId: 'resource-2',
        startsAt: '2026-01-15T14:00:00.000Z',
        endsAt: '2026-01-15T17:00:00.000Z',
      })];

      const result = checkBookingConflicts(request, existing);
      expect(result.canConfirm).toBe(true);
      expect(result.tokenBlocked).toBe(false);
    });
  });

  // ═══ createUsageRecord (Req 12.3) ═══════════════════════════════════════════

  describe('createUsageRecord', () => {
    it('should create a usage ledger entry for a completed session', () => {
      const session = makeCompletedSession();
      const input: SessionUsageInput = {
        session,
        usageLogId: 'usage-log-1',
        billingPolicy: makeBillingPolicy(),
        occurredAt: '2026-01-15T11:35:00.000Z',
      };

      const result = createUsageRecord(input);

      expect(result.ledgerEntry).toBeDefined();
      expect(result.ledgerEntry.bookingId).toBe('booking-1');
      expect(result.ledgerEntry.usageLogId).toBe('usage-log-1');
      expect(result.ledgerEntry.currency).toBe('ZAR');
      expect(result.ledgerEntry.occurredAt).toBe('2026-01-15T11:35:00.000Z');
    });

    it('should never auto-finalise billing (autoPayoutProhibited invariant)', () => {
      const input: SessionUsageInput = {
        session: makeCompletedSession(),
        usageLogId: 'usage-log-2',
        billingPolicy: makeBillingPolicy(),
        occurredAt: '2026-01-15T11:35:00.000Z',
      };

      const result = createUsageRecord(input);

      expect(result.billingFinalised).toBe(false);
      expect(result.autoPayoutProhibited).toBe(true);
      expect(result.humanApprovalRequired).toBe(true);
    });

    it('should compute billing based on session duration', () => {
      const session = makeCompletedSession({
        startedAt: '2026-01-15T09:00:00.000Z',
        endedAt: '2026-01-15T11:30:00.000Z',
      });
      const input: SessionUsageInput = {
        session,
        usageLogId: 'usage-log-3',
        billingPolicy: makeBillingPolicy({ hourlyRateCents: 10000 }),
        occurredAt: '2026-01-15T11:35:00.000Z',
      };

      const result = createUsageRecord(input);

      // 2.5 hours at 10000 cents/hour = 25000 cents gross
      expect(result.ledgerEntry.grossAmountCents).toBeGreaterThan(0);
      expect(result.ledgerEntry.billableMinutes).toBe(150);
    });

    it('should include session notes in the ledger entry', () => {
      const session = makeCompletedSession({ applicationsUsed: ['AutoCAD'] });
      const input: SessionUsageInput = {
        session,
        usageLogId: 'usage-log-4',
        billingPolicy: makeBillingPolicy(),
        occurredAt: '2026-01-15T11:35:00.000Z',
      };

      const result = createUsageRecord(input);
      expect(result.ledgerEntry.notes).toContain('AutoCAD');
      expect(result.ledgerEntry.notes).toContain(session.sessionId);
    });

    it('should preserve bookingId linkage (Property 7)', () => {
      const session = makeCompletedSession();
      session.bookingId = 'booking-xyz';
      const input: SessionUsageInput = {
        session,
        usageLogId: 'usage-log-5',
        billingPolicy: makeBillingPolicy(),
        occurredAt: '2026-01-15T11:35:00.000Z',
      };

      const result = createUsageRecord(input);
      expect(result.ledgerEntry.bookingId).toBe('booking-xyz');
    });
  });

  // ═══ extendBookingLifecycle (Req 12.5) ═══════════════════════════════════════

  describe('extendBookingLifecycle', () => {
    it('should transition confirmed → session_active', () => {
      const transition = extendBookingLifecycle(
        'booking-1',
        'confirmed',
        'session_active',
        'system',
        'session-1',
      );

      expect(transition.bookingId).toBe('booking-1');
      expect(transition.previousStatus).toBe('confirmed');
      expect(transition.newStatus).toBe('session_active');
      expect(transition.sessionId).toBe('session-1');
      expect(transition.transitionedAt).toBeDefined();
    });

    it('should transition session_active → session_completed', () => {
      const transition = extendBookingLifecycle(
        'booking-1',
        'session_active',
        'session_completed',
        'system',
        'session-1',
      );

      expect(transition.previousStatus).toBe('session_active');
      expect(transition.newStatus).toBe('session_completed');
    });

    it('should transition session_completed → completed', () => {
      const transition = extendBookingLifecycle(
        'booking-1',
        'session_completed',
        'completed',
        'owner-1',
      );

      expect(transition.previousStatus).toBe('session_completed');
      expect(transition.newStatus).toBe('completed');
      expect(transition.triggeredBy).toBe('owner-1');
    });

    it('should reject invalid transitions', () => {
      expect(() =>
        extendBookingLifecycle('booking-1', 'pending', 'session_active', 'system'),
      ).toThrow('Invalid booking lifecycle transition');
    });

    it('should reject transitions from terminal states', () => {
      expect(() =>
        extendBookingLifecycle('booking-1', 'completed', 'session_active', 'system'),
      ).toThrow('Invalid booking lifecycle transition');
    });

    it('should allow cancellation from confirmed state', () => {
      const transition = extendBookingLifecycle(
        'booking-1',
        'confirmed',
        'cancelled',
        'owner-1',
      );
      expect(transition.newStatus).toBe('cancelled');
    });

    it('should allow cancellation from session_active state', () => {
      const transition = extendBookingLifecycle(
        'booking-1',
        'session_active',
        'cancelled',
        'system',
        'session-1',
      );
      expect(transition.newStatus).toBe('cancelled');
    });

    it('should store transitions in memory for audit', () => {
      extendBookingLifecycle('booking-1', 'confirmed', 'session_active', 'system', 'session-1');
      extendBookingLifecycle('booking-1', 'session_active', 'session_completed', 'system', 'session-1');

      const transitions = _getLifecycleTransitions();
      expect(transitions).toHaveLength(2);
      expect(transitions[0].newStatus).toBe('session_active');
      expect(transitions[1].newStatus).toBe('session_completed');
    });
  });

  // ═══ detectUnfinalisedBilling (Req 12.4) ═══════════════════════════════════

  describe('detectUnfinalisedBilling', () => {
    it('should flag sessions unfinalised beyond 14 days', () => {
      const sessions: BillingDetectionInput[] = [
        {
          bookingId: 'booking-1',
          sessionId: 'session-1',
          completedAt: '2026-01-01T12:00:00.000Z',
          ownerApproved: false,
          billingFinalised: false,
        },
      ];

      const result = detectUnfinalisedBilling(
        sessions,
        14,
        '2026-01-20T12:00:00.000Z', // 19 days later
      );

      expect(result).toHaveLength(1);
      expect(result[0].bookingId).toBe('booking-1');
      expect(result[0].daysSinceCompletion).toBe(19);
      expect(result[0].requiresAdminReview).toBe(true);
    });

    it('should not flag sessions within the threshold', () => {
      const sessions: BillingDetectionInput[] = [
        {
          bookingId: 'booking-1',
          sessionId: 'session-1',
          completedAt: '2026-01-15T12:00:00.000Z',
          ownerApproved: false,
          billingFinalised: false,
        },
      ];

      const result = detectUnfinalisedBilling(
        sessions,
        14,
        '2026-01-20T12:00:00.000Z', // only 5 days later
      );

      expect(result).toHaveLength(0);
    });

    it('should not flag already-finalised billing', () => {
      const sessions: BillingDetectionInput[] = [
        {
          bookingId: 'booking-1',
          sessionId: 'session-1',
          completedAt: '2026-01-01T12:00:00.000Z',
          ownerApproved: true,
          billingFinalised: true,
        },
      ];

      const result = detectUnfinalisedBilling(
        sessions,
        14,
        '2026-01-20T12:00:00.000Z',
      );

      expect(result).toHaveLength(0);
    });

    it('should use 14 days as the default threshold', () => {
      const sessions: BillingDetectionInput[] = [
        {
          bookingId: 'booking-1',
          sessionId: 'session-1',
          completedAt: '2026-01-01T12:00:00.000Z',
          ownerApproved: false,
          billingFinalised: false,
        },
      ];

      // Exactly 14 days + 1ms later
      const result = detectUnfinalisedBilling(
        sessions,
        undefined,
        '2026-01-15T12:00:01.000Z',
      );

      expect(result).toHaveLength(1);
    });

    it('should support custom threshold days', () => {
      const sessions: BillingDetectionInput[] = [
        {
          bookingId: 'booking-1',
          sessionId: 'session-1',
          completedAt: '2026-01-01T12:00:00.000Z',
          ownerApproved: false,
          billingFinalised: false,
        },
      ];

      // 8 days later with 7-day threshold → should flag
      const result = detectUnfinalisedBilling(
        sessions,
        7,
        '2026-01-09T12:00:00.000Z',
      );

      expect(result).toHaveLength(1);
    });

    it('should flag multiple sessions individually', () => {
      const sessions: BillingDetectionInput[] = [
        {
          bookingId: 'booking-1',
          sessionId: 'session-1',
          completedAt: '2026-01-01T12:00:00.000Z',
          ownerApproved: false,
          billingFinalised: false,
        },
        {
          bookingId: 'booking-2',
          sessionId: 'session-2',
          completedAt: '2026-01-02T12:00:00.000Z',
          ownerApproved: false,
          billingFinalised: false,
        },
        {
          bookingId: 'booking-3',
          sessionId: 'session-3',
          completedAt: '2026-01-10T12:00:00.000Z',
          ownerApproved: false,
          billingFinalised: false,
        },
      ];

      const result = detectUnfinalisedBilling(
        sessions,
        14,
        '2026-01-20T12:00:00.000Z',
      );

      // booking-1 (19 days) and booking-2 (18 days) should be flagged
      // booking-3 (10 days) should not
      expect(result).toHaveLength(2);
      expect(result.map(r => r.bookingId)).toContain('booking-1');
      expect(result.map(r => r.bookingId)).toContain('booking-2');
    });

    it('should store flagged records in memory', () => {
      const sessions: BillingDetectionInput[] = [
        {
          bookingId: 'booking-1',
          sessionId: 'session-1',
          completedAt: '2026-01-01T12:00:00.000Z',
          ownerApproved: false,
          billingFinalised: false,
        },
      ];

      detectUnfinalisedBilling(sessions, 14, '2026-01-20T12:00:00.000Z');
      const flags = _getUnfinalisedFlags();
      expect(flags).toHaveLength(1);
    });
  });

  // ═══ Governance Invariants (Req 12.1, 12.2, 12.3) ═════════════════════════

  describe('Governance invariants', () => {
    it('isAutoPayoutProhibited should always return true', () => {
      expect(isAutoPayoutProhibited()).toBe(true);
    });

    it('isHumanApprovalRequired should always return true', () => {
      expect(isHumanApprovalRequired()).toBe(true);
    });
  });

  // ═══ Property 7 — Governance Preservation Integration ════════════════════════

  describe('Property 7 — Governance Preservation', () => {
    it('completed session produces ledger entry with matching bookingId', () => {
      const session = makeCompletedSession({
        status: 'completed',
        bookingId: 'booking-prop7',
      });

      const result = createUsageRecord({
        session,
        usageLogId: 'usage-prop7',
        billingPolicy: makeBillingPolicy(),
        occurredAt: new Date().toISOString(),
      });

      expect(result.ledgerEntry.bookingId).toBe(session.bookingId);
    });

    it('when ownerApproved is false, billing is not finalised', () => {
      const session = makeCompletedSession({
        status: 'completed',
        ownerApproved: false,
      });

      const result = createUsageRecord({
        session,
        usageLogId: 'usage-prop7-b',
        billingPolicy: makeBillingPolicy(),
        occurredAt: new Date().toISOString(),
      });

      // billingNotFinalised(session) ≡ result.billingFinalised === false
      expect(result.billingFinalised).toBe(false);
      expect(result.autoPayoutProhibited).toBe(true);
    });

    it('even when ownerApproved is true, auto-payout is still prohibited', () => {
      const session = makeCompletedSession({
        status: 'completed',
        ownerApproved: true,
      });

      const result = createUsageRecord({
        session,
        usageLogId: 'usage-prop7-c',
        billingPolicy: makeBillingPolicy(),
        occurredAt: new Date().toISOString(),
      });

      // Auto-payout never happens regardless of owner approval
      expect(result.autoPayoutProhibited).toBe(true);
    });
  });
});
