/**
 * Session Gate Service — Unit Tests & Property-Based Tests
 *
 * Tests the multi-condition session start gate:
 * - All conditions passing → canStart: true
 * - Each condition failing individually → canStart: false with correct error
 * - Multiple conditions failing simultaneously → multiple errors
 * - Edge cases: boundary values for time window and heartbeat
 * - App isolation invariant: appCount=0 → always fails
 * - Property: canStart === true iff ALL conditions pass (biconditional)
 *
 * **Validates: Requirements 4.1, 4.2, 1.1, 12.1, 12.6**
 */

import { describe, it, expect } from 'vitest';
// Note: vitest globals are enabled but explicit imports work too
import * as fc from 'fast-check';
import { evaluateSessionGate } from '../sessionGateService';
import { GATE_ERROR_CODES, REMOTE_DESKTOP_DEFAULTS } from '../types';
import type { SessionGateInput, HostStatus } from '../types';
import type { ResourceBookingStatus } from '@/services/resourceBookingService';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

const NOW = '2025-06-15T10:00:00.000Z';
const NOW_MS = new Date(NOW).getTime();

function createValidInput(overrides?: Partial<SessionGateInput>): SessionGateInput {
  return {
    bookingId: 'booking-123',
    consumerUid: 'consumer-abc',
    hostId: 'host-xyz',
    currentTime: NOW,
    booking: {
      status: 'confirmed',
      approvedBy: 'owner-uid-456',
      startsAt: '2025-06-15T10:00:00.000Z', // starts now
      endsAt: '2025-06-15T12:00:00.000Z',   // ends in 2 hours
      resourceId: 'resource-001',
    },
    host: {
      status: 'online',
      lastHeartbeat: new Date(NOW_MS - 30_000).toISOString(), // 30s ago
      resourceListingId: 'listing-001',
      agentVersion: '1.2.0',
    },
    appCount: 3,
    ...overrides,
  };
}

// ─── Unit Tests ─────────────────────────────────────────────────────────────────

describe('Session Gate Service', () => {
  describe('All conditions passing', () => {
    it('should return canStart: true when all conditions are met', () => {
      const input = createValidInput();
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(true);
      expect(result.conditions.bookingConfirmed).toBe(true);
      expect(result.conditions.ownerApproved).toBe(true);
      expect(result.conditions.withinTimeWindow).toBe(true);
      expect(result.conditions.hostOnline).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass when current time is exactly at window start minus 15 minutes', () => {
      const startsAt = '2025-06-15T10:15:00.000Z';
      const earlyJoinTime = new Date(new Date(startsAt).getTime() - REMOTE_DESKTOP_DEFAULTS.EARLY_JOIN_BUFFER_MS).toISOString();
      const input = createValidInput({
        currentTime: earlyJoinTime,
        booking: {
          ...createValidInput().booking,
          startsAt,
          endsAt: '2025-06-15T12:00:00.000Z',
        },
        host: {
          ...createValidInput().host,
          lastHeartbeat: new Date(new Date(earlyJoinTime).getTime() - 30_000).toISOString(),
        },
      });

      const result = evaluateSessionGate(input);
      expect(result.canStart).toBe(true);
      expect(result.conditions.withinTimeWindow).toBe(true);
    });

    it('should pass when current time is exactly at window end', () => {
      const endsAt = '2025-06-15T12:00:00.000Z';
      const input = createValidInput({
        currentTime: endsAt,
        host: {
          ...createValidInput().host,
          lastHeartbeat: new Date(new Date(endsAt).getTime() - 30_000).toISOString(),
        },
        booking: {
          ...createValidInput().booking,
          endsAt,
        },
      });

      const result = evaluateSessionGate(input);
      expect(result.canStart).toBe(true);
      expect(result.conditions.withinTimeWindow).toBe(true);
    });

    it('should pass with idle host status', () => {
      const input = createValidInput({
        host: {
          ...createValidInput().host,
          status: 'idle' as HostStatus,
        },
      });

      const result = evaluateSessionGate(input);
      expect(result.canStart).toBe(true);
      expect(result.conditions.hostOnline).toBe(true);
    });
  });

  describe('Booking not confirmed', () => {
    it('should fail when booking status is pending', () => {
      const input = createValidInput({
        booking: { ...createValidInput().booking, status: 'pending' },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.bookingConfirmed).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: GATE_ERROR_CODES.BOOKING_NOT_CONFIRMED }),
      );
    });

    it('should fail when booking status is cancelled', () => {
      const input = createValidInput({
        booking: { ...createValidInput().booking, status: 'cancelled' },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.bookingConfirmed).toBe(false);
    });

    it('should fail when booking status is completed', () => {
      const input = createValidInput({
        booking: { ...createValidInput().booking, status: 'completed' },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.bookingConfirmed).toBe(false);
    });
  });

  describe('Owner not approved', () => {
    it('should fail when approvedBy is undefined', () => {
      const booking = { ...createValidInput().booking };
      delete (booking as Record<string, unknown>).approvedBy;
      const input = createValidInput({ booking });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.ownerApproved).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: GATE_ERROR_CODES.OWNER_NOT_APPROVED }),
      );
    });
  });

  describe('Outside time window', () => {
    it('should fail when current time is before window start minus 15 minutes', () => {
      const startsAt = '2025-06-15T10:00:00.000Z';
      const tooEarly = new Date(new Date(startsAt).getTime() - REMOTE_DESKTOP_DEFAULTS.EARLY_JOIN_BUFFER_MS - 1).toISOString();
      const input = createValidInput({
        currentTime: tooEarly,
        host: {
          ...createValidInput().host,
          lastHeartbeat: new Date(new Date(tooEarly).getTime() - 30_000).toISOString(),
        },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.withinTimeWindow).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: GATE_ERROR_CODES.OUTSIDE_TIME_WINDOW }),
      );
    });

    it('should fail when current time is after window end', () => {
      const endsAt = '2025-06-15T12:00:00.000Z';
      const tooLate = new Date(new Date(endsAt).getTime() + 1).toISOString();
      const input = createValidInput({
        currentTime: tooLate,
        booking: { ...createValidInput().booking, endsAt },
        host: {
          ...createValidInput().host,
          lastHeartbeat: new Date(new Date(tooLate).getTime() - 30_000).toISOString(),
        },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.withinTimeWindow).toBe(false);
    });
  });

  describe('Host offline', () => {
    it('should fail when host status is offline', () => {
      const input = createValidInput({
        host: { ...createValidInput().host, status: 'offline' },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.hostOnline).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: GATE_ERROR_CODES.HOST_OFFLINE }),
      );
    });

    it('should fail when host status is in_session', () => {
      const input = createValidInput({
        host: { ...createValidInput().host, status: 'in_session' },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.hostOnline).toBe(false);
    });

    it('should fail when host status is maintenance', () => {
      const input = createValidInput({
        host: { ...createValidInput().host, status: 'maintenance' },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.hostOnline).toBe(false);
    });

    it('should fail when heartbeat is exactly 90 seconds old', () => {
      const heartbeat = new Date(NOW_MS - 90_000).toISOString();
      const input = createValidInput({
        host: { ...createValidInput().host, lastHeartbeat: heartbeat },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.hostOnline).toBe(false);
    });

    it('should pass when heartbeat is 89 seconds old', () => {
      const heartbeat = new Date(NOW_MS - 89_000).toISOString();
      const input = createValidInput({
        host: { ...createValidInput().host, lastHeartbeat: heartbeat },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(true);
      expect(result.conditions.hostOnline).toBe(true);
    });

    it('should fail when heartbeat is older than 90 seconds even with valid status', () => {
      const heartbeat = new Date(NOW_MS - 91_000).toISOString();
      const input = createValidInput({
        host: { ...createValidInput().host, lastHeartbeat: heartbeat },
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.hostOnline).toBe(false);
    });
  });

  describe('No apps configured (App Isolation Invariant)', () => {
    it('should fail when appCount is 0', () => {
      const input = createValidInput({ appCount: 0 });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: GATE_ERROR_CODES.NO_APPS_CONFIGURED }),
      );
    });

    it('should pass when appCount is 1', () => {
      const input = createValidInput({ appCount: 1 });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(true);
    });
  });

  describe('Multiple conditions failing simultaneously', () => {
    it('should report all failing conditions', () => {
      const input = createValidInput({
        booking: {
          status: 'pending',
          startsAt: '2025-06-15T11:00:00.000Z',
          endsAt: '2025-06-15T12:00:00.000Z',
          resourceId: 'resource-001',
          // no approvedBy
        },
        host: {
          status: 'offline',
          lastHeartbeat: new Date(NOW_MS - 200_000).toISOString(),
          resourceListingId: 'listing-001',
          agentVersion: '1.2.0',
        },
        appCount: 0,
      });
      const result = evaluateSessionGate(input);

      expect(result.canStart).toBe(false);
      expect(result.conditions.bookingConfirmed).toBe(false);
      expect(result.conditions.ownerApproved).toBe(false);
      expect(result.conditions.withinTimeWindow).toBe(false);
      expect(result.conditions.hostOnline).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);

      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes).toContain(GATE_ERROR_CODES.BOOKING_NOT_CONFIRMED);
      expect(errorCodes).toContain(GATE_ERROR_CODES.OWNER_NOT_APPROVED);
      expect(errorCodes).toContain(GATE_ERROR_CODES.OUTSIDE_TIME_WINDOW);
      expect(errorCodes).toContain(GATE_ERROR_CODES.HOST_OFFLINE);
      expect(errorCodes).toContain(GATE_ERROR_CODES.NO_APPS_CONFIGURED);
    });
  });

  // ─── Property-Based Tests ───────────────────────────────────────────────────

  describe('Property 1 — Session Gate Completeness', () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 1.1, 12.1**
     *
     * ∀ request: SessionGateInput,
     *   evaluateSessionGate(request).canStart === true
     *   ⟺
     *   request.booking.status === 'confirmed'
     *   ∧ request.booking.approvedBy !== undefined
     *   ∧ request.currentTime >= (request.booking.startsAt - 15min)
     *   ∧ request.currentTime <= request.booking.endsAt
     *   ∧ request.host.status ∈ {'online', 'idle'}
     *   ∧ (request.currentTime - request.host.lastHeartbeat) < 90s
     *   ∧ request.appCount > 0
     */
    it('canStart === true iff ALL conditions pass (biconditional)', () => {
      const bookingStatuses: ResourceBookingStatus[] = ['pending', 'confirmed', 'cancelled', 'completed'];
      const hostStatuses: (HostStatus | 'idle')[] = ['online', 'offline', 'in_session', 'maintenance', 'idle'];

      const sessionGateInputArb = fc.record({
        bookingStatus: fc.constantFrom(...bookingStatuses),
        hasApprover: fc.boolean(),
        hostStatus: fc.constantFrom(...hostStatuses),
        // Heartbeat age in ms: 0 to 180s
        heartbeatAgeMs: fc.integer({ min: 0, max: 180_000 }),
        // Time offset from window start in ms: -20min to +3hr
        timeOffsetMs: fc.integer({ min: -20 * 60 * 1000, max: 3 * 60 * 60 * 1000 }),
        // Window duration: 30min to 4hr
        windowDurationMs: fc.integer({ min: 30 * 60 * 1000, max: 4 * 60 * 60 * 1000 }),
        appCount: fc.integer({ min: 0, max: 20 }),
      });

      fc.assert(
        fc.property(sessionGateInputArb, (params) => {
          const baseTime = 1750000000000; // fixed reference point
          const windowStartMs = baseTime;
          const windowEndMs = baseTime + params.windowDurationMs;
          const currentTimeMs = windowStartMs + params.timeOffsetMs;
          const lastHeartbeatMs = currentTimeMs - params.heartbeatAgeMs;

          const input: SessionGateInput = {
            bookingId: 'booking-pbt',
            consumerUid: 'consumer-pbt',
            hostId: 'host-pbt',
            currentTime: new Date(currentTimeMs).toISOString(),
            booking: {
              status: params.bookingStatus,
              ...(params.hasApprover ? { approvedBy: 'owner-pbt' } : {}),
              startsAt: new Date(windowStartMs).toISOString(),
              endsAt: new Date(windowEndMs).toISOString(),
              resourceId: 'resource-pbt',
            },
            host: {
              status: params.hostStatus as HostStatus,
              lastHeartbeat: new Date(lastHeartbeatMs).toISOString(),
              resourceListingId: 'listing-pbt',
              agentVersion: '1.0.0',
            },
            appCount: params.appCount,
          };

          const result = evaluateSessionGate(input);

          // Compute expected conditions manually
          const expectedBookingConfirmed = params.bookingStatus === 'confirmed';
          const expectedOwnerApproved = params.hasApprover;
          const expectedWithinWindow =
            currentTimeMs >= (windowStartMs - REMOTE_DESKTOP_DEFAULTS.EARLY_JOIN_BUFFER_MS) &&
            currentTimeMs <= windowEndMs;
          const expectedHostValid =
            (params.hostStatus === 'online' || params.hostStatus === 'idle') &&
            params.heartbeatAgeMs < REMOTE_DESKTOP_DEFAULTS.HEARTBEAT_TIMEOUT_MS;
          const expectedHasApps = params.appCount > 0;

          const expectedCanStart =
            expectedBookingConfirmed &&
            expectedOwnerApproved &&
            expectedWithinWindow &&
            expectedHostValid &&
            expectedHasApps;

          // Biconditional: canStart iff all conditions
          return result.canStart === expectedCanStart;
        }),
        { numRuns: 500 },
      );
    });
  });

  describe('Property 5 — App Isolation Invariant', () => {
    /**
     * **Validates: Requirements 1.1, 1.2**
     *
     * ∀ gateInput where gateInput.appCount === 0,
     *   evaluateSessionGate(gateInput).canStart === false
     */
    it('appCount === 0 always results in canStart: false regardless of other conditions', () => {
      const bookingStatuses: ResourceBookingStatus[] = ['pending', 'confirmed', 'cancelled', 'completed'];
      const hostStatuses: (HostStatus | 'idle')[] = ['online', 'offline', 'in_session', 'maintenance', 'idle'];

      const inputArb = fc.record({
        bookingStatus: fc.constantFrom(...bookingStatuses),
        hasApprover: fc.boolean(),
        hostStatus: fc.constantFrom(...hostStatuses),
        heartbeatAgeMs: fc.integer({ min: 0, max: 180_000 }),
        timeOffsetMs: fc.integer({ min: -20 * 60 * 1000, max: 3 * 60 * 60 * 1000 }),
        windowDurationMs: fc.integer({ min: 30 * 60 * 1000, max: 4 * 60 * 60 * 1000 }),
      });

      fc.assert(
        fc.property(inputArb, (params) => {
          const baseTime = 1750000000000;
          const windowStartMs = baseTime;
          const windowEndMs = baseTime + params.windowDurationMs;
          const currentTimeMs = windowStartMs + params.timeOffsetMs;
          const lastHeartbeatMs = currentTimeMs - params.heartbeatAgeMs;

          const input: SessionGateInput = {
            bookingId: 'booking-isolation',
            consumerUid: 'consumer-isolation',
            hostId: 'host-isolation',
            currentTime: new Date(currentTimeMs).toISOString(),
            booking: {
              status: params.bookingStatus,
              ...(params.hasApprover ? { approvedBy: 'owner-isolation' } : {}),
              startsAt: new Date(windowStartMs).toISOString(),
              endsAt: new Date(windowEndMs).toISOString(),
              resourceId: 'resource-isolation',
            },
            host: {
              status: params.hostStatus as HostStatus,
              lastHeartbeat: new Date(lastHeartbeatMs).toISOString(),
              resourceListingId: 'listing-isolation',
              agentVersion: '1.0.0',
            },
            appCount: 0, // always zero for this property
          };

          const result = evaluateSessionGate(input);
          return result.canStart === false;
        }),
        { numRuns: 200 },
      );
    });
  });
});
