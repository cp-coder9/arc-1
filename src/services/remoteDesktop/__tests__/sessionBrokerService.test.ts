/**
 * Session Broker Service — Unit Tests
 *
 * Tests session lifecycle state transitions and reconnection logic.
 *
 * Requirements: 9.4, 9.5, 14.4
 *

 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  activateSession,
  endSession,
  failSession,
  handleReconnection,
  recordDisconnect,
  handleBookingCancellation,
  getSession,
  getSessionsByHost,
  getSessionsByConsumer,
  isTerminalState,
  getMaxReconnectionAttempts,
  _clearAllSessions,
  type CreateSessionInput,
  type SessionRecord,
} from '../sessionBrokerService';
import { generateToken, revokeToken, isTokenRevoked, _clearRevocationList } from '../tokenEngine';
import type { GenerateTokenInput } from '../tokenEngine';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createValidSessionInput(): CreateSessionInput {
  const now = Date.now();
  return {
    bookingId: 'booking-123',
    hostId: 'host-xyz',
    consumerUid: 'consumer-abc',
    ownerUid: 'owner-def',
    tokenId: 'token-ghi',
    windowStart: now + 60_000,       // starts in 1 minute
    windowEnd: now + 3_600_000,      // ends in 1 hour
    gracePeriodSeconds: 300,          // 5 minutes grace
  };
}

function createTokenForSession(session: SessionRecord): string {
  const tokenInput: GenerateTokenInput = {
    bookingId: session.bookingId,
    consumerUid: session.consumerUid,
    hostId: session.hostId,
    windowStart: session.windowStart,
    windowEnd: session.windowEnd,
    gracePeriodSeconds: session.gracePeriodSeconds,
  };
  return generateToken(tokenInput).token;
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _clearAllSessions();
  _clearRevocationList();
});

// ─── Session Creation ───────────────────────────────────────────────────────────

describe('createSession', () => {
  it('should create a session with status pending', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    expect(session.status).toBe('pending');
    expect(session.sessionId).toBeDefined();
    expect(session.bookingId).toBe(input.bookingId);
    expect(session.hostId).toBe(input.hostId);
    expect(session.consumerUid).toBe(input.consumerUid);
    expect(session.ownerUid).toBe(input.ownerUid);
    expect(session.tokenId).toBe(input.tokenId);
  });

  it('should initialise all counters to zero', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    expect(session.totalConnectedSeconds).toBe(0);
    expect(session.totalDisconnectionGapSeconds).toBe(0);
    expect(session.reconnectionAttempts).toBe(0);
    expect(session.filesProducedCount).toBe(0);
    expect(session.applicationsUsed).toEqual([]);
  });

  it('should have null timestamps initially', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    expect(session.startTimestamp).toBeNull();
    expect(session.endTimestamp).toBeNull();
    expect(session.lastDisconnectTimestamp).toBeNull();
  });

  it('should store the session and make it retrievable', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    const retrieved = getSession(session.sessionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.sessionId).toBe(session.sessionId);
  });

  it('should generate unique session IDs', () => {
    const input = createValidSessionInput();
    const s1 = createSession(input);
    const s2 = createSession(input);

    expect(s1.sessionId).not.toBe(s2.sessionId);
  });

  it('should reject missing bookingId', () => {
    const input = createValidSessionInput();
    input.bookingId = '';

    expect(() => createSession(input)).toThrow();
  });

  it('should reject missing hostId', () => {
    const input = createValidSessionInput();
    input.hostId = '';

    expect(() => createSession(input)).toThrow();
  });

  it('should reject windowEnd <= windowStart', () => {
    const input = createValidSessionInput();
    input.windowEnd = input.windowStart;

    expect(() => createSession(input)).toThrow();
  });

  it('should store project reference when provided', () => {
    const input = createValidSessionInput();
    input.projectReference = 'project-ref-001';
    const session = createSession(input);

    expect(session.projectReference).toBe('project-ref-001');
  });
});

// ─── Session Activation ─────────────────────────────────────────────────────────

describe('activateSession', () => {
  it('should transition pending → active', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    const activated = activateSession({
      sessionId: session.sessionId,
      connectionType: 'peer-to-peer',
    });

    expect(activated.status).toBe('active');
    expect(activated.connectionType).toBe('peer-to-peer');
    expect(activated.startTimestamp).toBeGreaterThan(0);
  });

  it('should record start timestamp on activation', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    const before = Date.now();

    const activated = activateSession({
      sessionId: session.sessionId,
      connectionType: 'turn-relay',
    });

    expect(activated.startTimestamp).toBeGreaterThanOrEqual(before);
    expect(activated.startTimestamp).toBeLessThanOrEqual(Date.now());
  });

  it('should reject activation of non-existent session', () => {
    expect(() =>
      activateSession({ sessionId: 'non-existent', connectionType: 'peer-to-peer' }),
    ).toThrow();
  });

  it('should reject activation of already active session', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    expect(() =>
      activateSession({ sessionId: session.sessionId, connectionType: 'turn-relay' }),
    ).toThrow();
  });

  it('should reject activation of completed session', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    endSession({ sessionId: session.sessionId, reason: 'user_initiated', terminatedBy: 'consumer' });

    expect(() =>
      activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' }),
    ).toThrow();
  });

  it('should reject empty connection type', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    expect(() =>
      activateSession({ sessionId: session.sessionId, connectionType: '' }),
    ).toThrow();
  });
});

// ─── Session End ────────────────────────────────────────────────────────────────

describe('endSession', () => {
  it('should transition active → completed on voluntary disconnect', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    const ended = endSession({
      sessionId: session.sessionId,
      reason: 'user_initiated',
      terminatedBy: 'consumer',
    });

    expect(ended.status).toBe('completed');
    expect(ended.disconnectionReason).toBe('user_initiated');
    expect(ended.endTimestamp).toBeGreaterThan(0);
  });

  it('should transition active → completed on booking window expired', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    const ended = endSession({
      sessionId: session.sessionId,
      reason: 'booking_window_expired',
      terminatedBy: 'system',
    });

    expect(ended.status).toBe('completed');
  });

  it('should transition active → terminated on UAC', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    const ended = endSession({
      sessionId: session.sessionId,
      reason: 'uac_terminated',
      terminatedBy: 'system',
    });

    expect(ended.status).toBe('terminated');
    expect(ended.disconnectionReason).toBe('uac_terminated');
  });

  it('should transition active → terminated on owner revoke', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    const ended = endSession({
      sessionId: session.sessionId,
      reason: 'owner_revoked',
      terminatedBy: 'owner',
    });

    expect(ended.status).toBe('terminated');
  });

  it('should reject ending a session already in terminal state', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    endSession({ sessionId: session.sessionId, reason: 'user_initiated', terminatedBy: 'consumer' });

    expect(() =>
      endSession({ sessionId: session.sessionId, reason: 'owner_revoked', terminatedBy: 'owner' }),
    ).toThrow();
  });

  it('should reject ending a pending session (use failSession instead)', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    expect(() =>
      endSession({ sessionId: session.sessionId, reason: 'user_initiated', terminatedBy: 'consumer' }),
    ).toThrow();
  });

  it('should calculate total connected seconds', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    // Small delay to measure connected time
    const ended = endSession({
      sessionId: session.sessionId,
      reason: 'user_initiated',
      terminatedBy: 'consumer',
    });

    expect(ended.totalConnectedSeconds).toBeGreaterThanOrEqual(0);
  });
});

// ─── Session Failure ────────────────────────────────────────────────────────────

describe('failSession', () => {
  it('should transition pending → failed', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    const failed = failSession(session.sessionId);

    expect(failed.status).toBe('failed');
    expect(failed.disconnectionReason).toBe('connection_failed');
    expect(failed.endTimestamp).toBeGreaterThan(0);
  });

  it('should reject failing an active session', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    expect(() => failSession(session.sessionId)).toThrow();
  });

  it('should reject failing a non-existent session', () => {
    expect(() => failSession('non-existent')).toThrow();
  });

  it('should accept a custom reason', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    const failed = failSession(session.sessionId, 'host_unreachable');
    expect(failed.disconnectionReason).toBe('host_unreachable');
  });
});

// ─── Reconnection Handling ──────────────────────────────────────────────────────

describe('handleReconnection', () => {
  it('should allow reconnection within booking window + grace period', () => {
    const now = Date.now();
    const input = createValidSessionInput();
    input.windowStart = now - 60_000;     // started 1 min ago
    input.windowEnd = now + 3_600_000;    // ends in 1 hour
    input.gracePeriodSeconds = 300;

    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    recordDisconnect(session.sessionId, now);

    const token = createTokenForSession(session);

    const result = handleReconnection({
      sessionId: session.sessionId,
      token,
      consumerUid: session.consumerUid,
      hostId: session.hostId,
      currentTime: now + 5000, // 5 seconds after disconnect
    });

    expect(result.allowed).toBe(true);
    expect(result.session).toBeDefined();
    expect(result.session!.reconnectionAttempts).toBe(1);
  });

  it('should allow reconnection after window end but within grace period (Req 9.5)', () => {
    const now = Date.now();
    const input = createValidSessionInput();
    input.windowStart = now - 3_600_000;   // started 1 hour ago
    input.windowEnd = now - 60_000;        // ended 1 min ago
    input.gracePeriodSeconds = 300;         // 5 min grace

    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    recordDisconnect(session.sessionId, now - 30_000);

    const token = createTokenForSession(session);

    const result = handleReconnection({
      sessionId: session.sessionId,
      token,
      consumerUid: session.consumerUid,
      hostId: session.hostId,
      currentTime: now, // Within grace period
    });

    expect(result.allowed).toBe(true);
  });

  it('should reject reconnection after grace period expires', () => {
    const now = Date.now();
    const input = createValidSessionInput();
    input.windowStart = now - 7_200_000;   // started 2 hours ago
    input.windowEnd = now - 3_600_000;     // ended 1 hour ago
    input.gracePeriodSeconds = 300;         // 5 min grace (expired)

    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    recordDisconnect(session.sessionId, now - 3_600_000);

    const token = createTokenForSession(session);

    const result = handleReconnection({
      sessionId: session.sessionId,
      token,
      consumerUid: session.consumerUid,
      hostId: session.hostId,
      currentTime: now, // Well past grace period
    });

    expect(result.allowed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('booking_window_expired');
  });

  it('should reject reconnection after 5 attempts (Req 9.4)', () => {
    const now = Date.now();
    const input = createValidSessionInput();
    input.windowStart = now - 60_000;
    input.windowEnd = now + 3_600_000;
    input.gracePeriodSeconds = 300;

    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    const token = createTokenForSession(session);

    // Exhaust all 5 reconnection attempts
    for (let i = 0; i < 5; i++) {
      recordDisconnect(session.sessionId, now + i * 10_000);
      const result = handleReconnection({
        sessionId: session.sessionId,
        token,
        consumerUid: session.consumerUid,
        hostId: session.hostId,
        currentTime: now + i * 10_000 + 5000,
      });
      expect(result.allowed).toBe(true);
    }

    // 6th attempt should be rejected
    recordDisconnect(session.sessionId, now + 60_000);
    const result = handleReconnection({
      sessionId: session.sessionId,
      token,
      consumerUid: session.consumerUid,
      hostId: session.hostId,
      currentTime: now + 65_000,
    });

    expect(result.allowed).toBe(false);
    expect(result.error!.code).toBe('connection_failed');
  });

  it('should reject reconnection for non-existent session', () => {
    const result = handleReconnection({
      sessionId: 'non-existent',
      token: 'any-token',
      consumerUid: 'consumer-abc',
      hostId: 'host-xyz',
      currentTime: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.error!.code).toBe('connection_failed');
  });

  it('should reject reconnection for completed session', () => {
    const now = Date.now();
    const input = createValidSessionInput();
    input.windowStart = now - 60_000;
    input.windowEnd = now + 3_600_000;

    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    endSession({ sessionId: session.sessionId, reason: 'user_initiated', terminatedBy: 'consumer' });

    const token = createTokenForSession(session);

    const result = handleReconnection({
      sessionId: session.sessionId,
      token,
      consumerUid: session.consumerUid,
      hostId: session.hostId,
      currentTime: now,
    });

    expect(result.allowed).toBe(false);
  });

  it('should reject reconnection for pending session', () => {
    const now = Date.now();
    const input = createValidSessionInput();
    input.windowStart = now - 60_000;
    input.windowEnd = now + 3_600_000;

    const session = createSession(input);
    const token = createTokenForSession(session);

    const result = handleReconnection({
      sessionId: session.sessionId,
      token,
      consumerUid: session.consumerUid,
      hostId: session.hostId,
      currentTime: now,
    });

    expect(result.allowed).toBe(false);
  });

  it('should reject reconnection with revoked token', () => {
    const now = Date.now();
    const input = createValidSessionInput();
    input.windowStart = now - 60_000;
    input.windowEnd = now + 3_600_000;
    input.gracePeriodSeconds = 300;

    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    recordDisconnect(session.sessionId, now);

    // Generate a token and immediately revoke it
    const tokenInput: GenerateTokenInput = {
      bookingId: session.bookingId,
      consumerUid: session.consumerUid,
      hostId: session.hostId,
      windowStart: session.windowStart,
      windowEnd: session.windowEnd,
      gracePeriodSeconds: session.gracePeriodSeconds,
    };
    const { token, payload } = generateToken(tokenInput);
    revokeToken(payload.tid);

    const result = handleReconnection({
      sessionId: session.sessionId,
      token,
      consumerUid: session.consumerUid,
      hostId: session.hostId,
      currentTime: now + 5000,
    });

    expect(result.allowed).toBe(false);
    expect(result.error!.code).toBe('invalid_token');
  });

  it('should track disconnection gap time on reconnection', () => {
    const now = Date.now();
    const input = createValidSessionInput();
    input.windowStart = now - 60_000;
    input.windowEnd = now + 3_600_000;
    input.gracePeriodSeconds = 300;

    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    // Disconnect at time T
    recordDisconnect(session.sessionId, now);

    const token = createTokenForSession(session);

    // Reconnect 30 seconds later
    const result = handleReconnection({
      sessionId: session.sessionId,
      token,
      consumerUid: session.consumerUid,
      hostId: session.hostId,
      currentTime: now + 30_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.session!.totalDisconnectionGapSeconds).toBe(30);
  });
});

// ─── Governance: Booking Cancellation ───────────────────────────────────────────

describe('handleBookingCancellation', () => {
  it('should terminate active session on booking cancellation (Req 14.4)', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    const result = handleBookingCancellation(session.sessionId);

    expect(result.status).toBe('terminated');
    expect(result.disconnectionReason).toBe('governance_cancelled');
    expect(result.endTimestamp).toBeGreaterThan(0);
  });

  it('should terminate pending session on booking cancellation', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    const result = handleBookingCancellation(session.sessionId);

    expect(result.status).toBe('terminated');
    expect(result.disconnectionReason).toBe('governance_cancelled');
  });

  it('should reject cancellation of already terminated session', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    endSession({ sessionId: session.sessionId, reason: 'user_initiated', terminatedBy: 'consumer' });

    expect(() => handleBookingCancellation(session.sessionId)).toThrow();
  });

  it('should invalidate token on booking cancellation', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    handleBookingCancellation(session.sessionId);

    // Token should now be revoked
    expect(isTokenRevoked(session.tokenId)).toBe(true);
  });

  it('should reject cancellation of non-existent session', () => {
    expect(() => handleBookingCancellation('non-existent')).toThrow();
  });
});

// ─── State Machine Rules ────────────────────────────────────────────────────────

describe('State Machine Invariants', () => {
  it('terminal states: no transitions from completed', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    endSession({ sessionId: session.sessionId, reason: 'user_initiated', terminatedBy: 'consumer' });

    // Cannot activate
    expect(() =>
      activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' }),
    ).toThrow();

    // Cannot end again
    expect(() =>
      endSession({ sessionId: session.sessionId, reason: 'owner_revoked', terminatedBy: 'owner' }),
    ).toThrow();

    // Cannot fail
    expect(() => failSession(session.sessionId)).toThrow();
  });

  it('terminal states: no transitions from terminated', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });
    endSession({ sessionId: session.sessionId, reason: 'uac_terminated', terminatedBy: 'system' });

    expect(() =>
      activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' }),
    ).toThrow();
  });

  it('terminal states: no transitions from failed', () => {
    const input = createValidSessionInput();
    const session = createSession(input);
    failSession(session.sessionId);

    expect(() =>
      activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' }),
    ).toThrow();
  });

  it('isTerminalState correctly identifies terminal states', () => {
    expect(isTerminalState('completed')).toBe(true);
    expect(isTerminalState('terminated')).toBe(true);
    expect(isTerminalState('failed')).toBe(true);
    expect(isTerminalState('pending')).toBe(false);
    expect(isTerminalState('active')).toBe(false);
  });
});

// ─── Session Retrieval ──────────────────────────────────────────────────────────

describe('Session Retrieval', () => {
  it('should return undefined for non-existent session', () => {
    expect(getSession('non-existent')).toBeUndefined();
  });

  it('should retrieve sessions by host', () => {
    const input1 = createValidSessionInput();
    input1.hostId = 'host-A';
    const input2 = createValidSessionInput();
    input2.hostId = 'host-A';
    const input3 = createValidSessionInput();
    input3.hostId = 'host-B';

    createSession(input1);
    createSession(input2);
    createSession(input3);

    const hostASessions = getSessionsByHost('host-A');
    expect(hostASessions).toHaveLength(2);
    hostASessions.forEach(s => expect(s.hostId).toBe('host-A'));

    const hostBSessions = getSessionsByHost('host-B');
    expect(hostBSessions).toHaveLength(1);
  });

  it('should retrieve sessions by consumer', () => {
    const input1 = createValidSessionInput();
    input1.consumerUid = 'consumer-A';
    const input2 = createValidSessionInput();
    input2.consumerUid = 'consumer-B';

    createSession(input1);
    createSession(input2);

    const consumerASessions = getSessionsByConsumer('consumer-A');
    expect(consumerASessions).toHaveLength(1);
    expect(consumerASessions[0].consumerUid).toBe('consumer-A');
  });
});

// ─── Record Disconnect ──────────────────────────────────────────────────────────

describe('recordDisconnect', () => {
  it('should record the disconnect timestamp', () => {
    const now = Date.now();
    const input = createValidSessionInput();
    const session = createSession(input);
    activateSession({ sessionId: session.sessionId, connectionType: 'peer-to-peer' });

    const result = recordDisconnect(session.sessionId, now);
    expect(result.lastDisconnectTimestamp).toBe(now);
  });

  it('should reject recording disconnect for non-active session', () => {
    const input = createValidSessionInput();
    const session = createSession(input);

    expect(() => recordDisconnect(session.sessionId)).toThrow();
  });

  it('should reject recording disconnect for non-existent session', () => {
    expect(() => recordDisconnect('non-existent')).toThrow();
  });
});

// ─── Constants ──────────────────────────────────────────────────────────────────

describe('Constants', () => {
  it('max reconnection attempts should be 5', () => {
    expect(getMaxReconnectionAttempts()).toBe(5);
  });
});
