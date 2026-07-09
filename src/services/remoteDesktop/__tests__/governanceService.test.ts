/**
 * Remote Desktop Core — Governance Service Tests
 *
 * Validates:
 * - Req 14.1: Token generation only for confirmed bookings
 * - Req 14.3: Booking conflict → token refusal
 * - Req 14.5: No auto-confirm, no auto-generate, no auto-finalise
 * - Req 14.6: Booking cancellation → token revocation within 5 seconds
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateBookingForTokenGeneration,
  handleGovernanceCancellation,
  detectBookingConflict,
  validateGovernanceForTokenGeneration,
  type GovernanceBooking,
} from '../governanceService';
import { generateToken, _clearRevocationList, isTokenRevoked } from '../tokenEngine';
import { createSession, _clearAllSessions } from '../sessionBrokerService';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function makeBooking(overrides: Partial<GovernanceBooking> = {}): GovernanceBooking {
  return {
    id: 'booking-001',
    status: 'confirmed',
    ownerId: 'owner-uid-001',
    consumerId: 'consumer-uid-001',
    startsAt: '2025-01-15T10:00:00Z',
    endsAt: '2025-01-15T12:00:00Z',
    confirmedAt: '2025-01-14T16:00:00Z',
    projectReference: 'project-ref-001',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('governanceService', () => {
  beforeEach(() => {
    _clearRevocationList();
    _clearAllSessions();
  });

  describe('validateBookingForTokenGeneration', () => {
    it('should accept a confirmed booking with confirmedAt timestamp', () => {
      const booking = makeBooking();
      const result = validateBookingForTokenGeneration(booking);

      expect(result.valid).toBe(true);
      expect(result.booking).toEqual(booking);
      expect(result.error).toBeUndefined();
    });

    it('should reject a booking with status "pending_owner_confirmation" (Req 14.1)', () => {
      const booking = makeBooking({ status: 'pending_owner_confirmation' });
      const result = validateBookingForTokenGeneration(booking);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('awaiting_owner_confirmation');
      expect(result.error?.code).toBe('token_generation_failed');
    });

    it('should reject a booking with status "cancelled_by_consumer"', () => {
      const booking = makeBooking({ status: 'cancelled_by_consumer' });
      const result = validateBookingForTokenGeneration(booking);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('booking_cancelled');
    });

    it('should reject a booking with status "expired"', () => {
      const booking = makeBooking({ status: 'expired' });
      const result = validateBookingForTokenGeneration(booking);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('booking_expired');
    });

    it('should reject a booking with status "conflict_expired"', () => {
      const booking = makeBooking({ status: 'conflict_expired' });
      const result = validateBookingForTokenGeneration(booking);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('booking_expired');
    });

    it('should reject a booking with status "declined"', () => {
      const booking = makeBooking({ status: 'declined' });
      const result = validateBookingForTokenGeneration(booking);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('booking_declined');
    });

    it('should reject a confirmed booking without confirmedAt (auto-confirm protection, Req 14.5)', () => {
      const booking = makeBooking({ confirmedAt: undefined });
      const result = validateBookingForTokenGeneration(booking);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('auto_confirm_prohibited');
      expect(result.error?.message).toContain('autoConfirmProhibited');
    });

    it('should reject a booking with status "active" (already in session)', () => {
      const booking = makeBooking({ status: 'active' });
      const result = validateBookingForTokenGeneration(booking);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('auto_confirm_prohibited');
    });

    it('should reject a booking with status "completed"', () => {
      const booking = makeBooking({ status: 'completed' });
      const result = validateBookingForTokenGeneration(booking);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('auto_confirm_prohibited');
    });

    it('should reject null/undefined booking', () => {
      const result = validateBookingForTokenGeneration(null as unknown as GovernanceBooking);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('token_generation_failed');
    });
  });

  describe('detectBookingConflict', () => {
    it('should detect no conflict when no existing bookings overlap', () => {
      const proposed = makeBooking({
        startsAt: '2025-01-15T14:00:00Z',
        endsAt: '2025-01-15T16:00:00Z',
      });
      const existing = [
        makeBooking({
          id: 'existing-001',
          startsAt: '2025-01-15T10:00:00Z',
          endsAt: '2025-01-15T12:00:00Z',
        }),
      ];

      const result = detectBookingConflict(proposed, existing);

      expect(result.hasConflict).toBe(false);
      expect(result.conflictingBookingId).toBeUndefined();
    });

    it('should detect conflict when bookings overlap (Req 14.3)', () => {
      const proposed = makeBooking({
        id: 'proposed-001',
        startsAt: '2025-01-15T11:00:00Z',
        endsAt: '2025-01-15T13:00:00Z',
      });
      const existing = [
        makeBooking({
          id: 'existing-001',
          startsAt: '2025-01-15T10:00:00Z',
          endsAt: '2025-01-15T12:00:00Z',
          status: 'confirmed',
        }),
      ];

      const result = detectBookingConflict(proposed, existing);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingBookingId).toBe('existing-001');
      expect(result.error?.message).toContain('Booking conflict detected');
    });

    it('should not conflict with itself', () => {
      const proposed = makeBooking({ id: 'booking-self' });
      const existing = [makeBooking({ id: 'booking-self' })];

      const result = detectBookingConflict(proposed, existing);

      expect(result.hasConflict).toBe(false);
    });

    it('should ignore cancelled/expired bookings in conflict check', () => {
      const proposed = makeBooking({
        id: 'proposed-001',
        startsAt: '2025-01-15T10:00:00Z',
        endsAt: '2025-01-15T12:00:00Z',
      });
      const existing = [
        makeBooking({
          id: 'existing-001',
          startsAt: '2025-01-15T10:00:00Z',
          endsAt: '2025-01-15T12:00:00Z',
          status: 'cancelled_by_consumer',
        }),
        makeBooking({
          id: 'existing-002',
          startsAt: '2025-01-15T10:00:00Z',
          endsAt: '2025-01-15T12:00:00Z',
          status: 'expired',
        }),
      ];

      const result = detectBookingConflict(proposed, existing);

      expect(result.hasConflict).toBe(false);
    });

    it('should detect conflict with pending_owner_confirmation bookings', () => {
      const proposed = makeBooking({
        id: 'proposed-001',
        startsAt: '2025-01-15T10:00:00Z',
        endsAt: '2025-01-15T12:00:00Z',
      });
      const existing = [
        makeBooking({
          id: 'existing-001',
          startsAt: '2025-01-15T11:00:00Z',
          endsAt: '2025-01-15T13:00:00Z',
          status: 'pending_owner_confirmation',
        }),
      ];

      const result = detectBookingConflict(proposed, existing);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingBookingId).toBe('existing-001');
    });

    it('should handle edge case: adjacent bookings (no overlap)', () => {
      const proposed = makeBooking({
        id: 'proposed-001',
        startsAt: '2025-01-15T12:00:00Z',
        endsAt: '2025-01-15T14:00:00Z',
      });
      const existing = [
        makeBooking({
          id: 'existing-001',
          startsAt: '2025-01-15T10:00:00Z',
          endsAt: '2025-01-15T12:00:00Z',
          status: 'confirmed',
        }),
      ];

      const result = detectBookingConflict(proposed, existing);

      expect(result.hasConflict).toBe(false);
    });
  });

  describe('handleGovernanceCancellation', () => {
    it('should revoke token and terminate session on booking cancellation (Req 14.6)', () => {
      // Create a session to cancel
      const now = Date.now();
      const session = createSession({
        bookingId: 'booking-cancel-001',
        hostId: 'host-001',
        consumerUid: 'consumer-001',
        ownerUid: 'owner-001',
        tokenId: 'token-cancel-001',
        windowStart: now,
        windowEnd: now + 7200000,
        gracePeriodSeconds: 300,
      });

      const result = handleGovernanceCancellation(session.sessionId);

      expect(result.success).toBe(true);
      expect(result.tokenRevoked).toBe(true);
      expect(result.sessionTerminated).toBe(true);
      expect(result.revokedWithinDeadline).toBe(true);
      expect(result.session?.status).toBe('terminated');
      expect(result.session?.disconnectionReason).toBe('governance_cancelled');
    });

    it('should revoke token within 5 seconds deadline', () => {
      const now = Date.now();
      const session = createSession({
        bookingId: 'booking-cancel-002',
        hostId: 'host-002',
        consumerUid: 'consumer-002',
        ownerUid: 'owner-002',
        tokenId: 'token-cancel-002',
        windowStart: now,
        windowEnd: now + 7200000,
        gracePeriodSeconds: 300,
      });

      const result = handleGovernanceCancellation(session.sessionId);

      expect(result.revokedWithinDeadline).toBe(true);
    });

    it('should revoke token directly if tokenId provided without session', () => {
      // Generate a real token first
      const { payload } = generateToken({
        bookingId: 'booking-orphan',
        consumerUid: 'consumer-orphan',
        hostId: 'host-orphan',
        windowStart: Date.now(),
        windowEnd: Date.now() + 7200000,
        gracePeriodSeconds: 300,
      });

      const result = handleGovernanceCancellation('non-existent-session', payload.tid);

      expect(result.success).toBe(true);
      expect(result.tokenRevoked).toBe(true);
      expect(result.sessionTerminated).toBe(false);
      // Verify the token is actually revoked
      expect(isTokenRevoked(payload.tid)).toBe(true);
    });

    it('should return error when session not found and no tokenId provided', () => {
      const result = handleGovernanceCancellation('non-existent-session');

      expect(result.success).toBe(false);
      expect(result.tokenRevoked).toBe(false);
      expect(result.error?.code).toBe('connection_failed');
    });
  });

  describe('validateGovernanceForTokenGeneration (combined gate)', () => {
    it('should pass when booking is confirmed and no conflicts exist', () => {
      const booking = makeBooking();
      const existing: GovernanceBooking[] = [];

      const result = validateGovernanceForTokenGeneration(booking, existing);

      expect(result.valid).toBe(true);
    });

    it('should reject when booking status is not confirmed (Req 14.1)', () => {
      const booking = makeBooking({ status: 'pending_owner_confirmation' });
      const existing: GovernanceBooking[] = [];

      const result = validateGovernanceForTokenGeneration(booking, existing);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('awaiting_owner_confirmation');
    });

    it('should reject when booking has conflict (Req 14.3)', () => {
      const booking = makeBooking({
        id: 'proposed',
        startsAt: '2025-01-15T10:00:00Z',
        endsAt: '2025-01-15T12:00:00Z',
      });
      const existing = [
        makeBooking({
          id: 'existing',
          startsAt: '2025-01-15T11:00:00Z',
          endsAt: '2025-01-15T13:00:00Z',
          status: 'confirmed',
        }),
      ];

      const result = validateGovernanceForTokenGeneration(booking, existing);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('booking_conflict');
    });

    it('should enforce autoConfirmProhibited — no token without human confirmation (Req 14.5)', () => {
      const booking = makeBooking({ confirmedAt: undefined });
      const existing: GovernanceBooking[] = [];

      const result = validateGovernanceForTokenGeneration(booking, existing);

      expect(result.valid).toBe(false);
      expect(result.denialReason).toBe('auto_confirm_prohibited');
    });
  });
});
