/**
 * Session Broker Orchestrator — Unit Tests
 *
 * Tests the top-level session orchestration:
 * - startSession: gate → consent → token → session → audit
 * - orchestratedEndSession: end → audit → usage
 * - handlePolicyViolation: full_desktop → termination within 5s
 * - enforceAutoDisconnect: booking window + grace → disconnect
 * - handleSecurityPause: input pause + 15min timeout scheduling
 * - enforceSecurityTimeout: terminate after 15min unreviewed
 */

import {
  startSession,
  orchestratedEndSession,
  handlePolicyViolation,
  enforceAutoDisconnect,
  handleSecurityPause,
  enforceSecurityTimeout,
  getAutoDisconnectTimer,
  getSecurityPauseRecord,
  getAuditLog,
  getPolicyViolationDeadlineMs,
  getSecurityTimeoutMs,
  _clearOrchestratorState,
  _getAutoDisconnectTimerCount,
  _getSecurityPauseCount,
  type StartSessionInput,
} from '../sessionBrokerOrchestrator';
import { _clearAllSessions, activateSession, getSession } from '../sessionBrokerService';
import { clearTokenStore } from '../tokenService';

// ─── Test Helpers ────────────────────────────────────────────────────────────────

const NOW = '2025-06-20T10:00:00.000Z';
const WINDOW_START = '2025-06-20T10:00:00.000Z';
const WINDOW_END = '2025-06-20T11:00:00.000Z';
const FRESH_HEARTBEAT = '2025-06-20T09:59:50.000Z'; // 10s ago

function makeValidInput(overrides?: Partial<StartSessionInput>): StartSessionInput {
  return {
    bookingId: 'booking-001',
    consumerUid: 'consumer-001',
    ownerUid: 'owner-001',
    hostId: 'host-001',
    currentTime: NOW,
    booking: {
      status: 'confirmed',
      approvedBy: 'owner-001',
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
      resourceId: 'resource-001',
    },
    host: {
      status: 'online',
      lastHeartbeat: FRESH_HEARTBEAT,
      resourceListingId: 'listing-001',
      agentVersion: '2.0.0',
      recordingEnabled: false,
    },
    appCount: 3,
    ...overrides,
  };
}

function makeInputWithRecording(): StartSessionInput {
  return makeValidInput({
    host: {
      status: 'online',
      lastHeartbeat: FRESH_HEARTBEAT,
      resourceListingId: 'listing-001',
      agentVersion: '2.0.0',
      recordingEnabled: true,
    },
    consent: {
      consentTextVersion: 'v1.0',
      ipAddress: '192.168.1.1',
      granted: true,
    },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────────

describe('sessionBrokerOrchestrator', () => {
  beforeEach(() => {
    _clearOrchestratorState();
    _clearAllSessions();
    clearTokenStore();
  });

  // ─── startSession ──────────────────────────────────────────────────────────────

  describe('startSession', () => {
    it('should succeed when all gate conditions pass', () => {
      const result = startSession(makeValidInput());

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.token!.bookingId).toBe('booking-001');
      expect(result.token!.consumerUid).toBe('consumer-001');
      expect(result.token!.hostId).toBe('host-001');
    });

    it('should reject when booking is not confirmed', () => {
      const input = makeValidInput({
        booking: {
          status: 'pending' as any,
          startsAt: WINDOW_START,
          endsAt: WINDOW_END,
          resourceId: 'resource-001',
        },
      });
      const result = startSession(input);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('booking_not_confirmed');
    });

    it('should reject when owner has not approved', () => {
      const input = makeValidInput({
        booking: {
          status: 'confirmed',
          approvedBy: undefined,
          startsAt: WINDOW_START,
          endsAt: WINDOW_END,
          resourceId: 'resource-001',
        },
      });
      const result = startSession(input);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('owner_not_approved');
    });

    it('should reject when appCount is 0 (app-level isolation)', () => {
      const input = makeValidInput({ appCount: 0 });
      const result = startSession(input);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('no_apps_configured');
    });

    it('should reject when host is offline', () => {
      const input = makeValidInput({
        host: {
          status: 'offline',
          lastHeartbeat: '2025-06-20T09:50:00.000Z', // 10 minutes ago
          resourceListingId: 'listing-001',
          agentVersion: '2.0.0',
          recordingEnabled: false,
        },
      });
      const result = startSession(input);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('host_offline');
    });

    it('should reject when recording enabled but consent not granted', () => {
      const input = makeValidInput({
        host: {
          status: 'online',
          lastHeartbeat: FRESH_HEARTBEAT,
          resourceListingId: 'listing-001',
          agentVersion: '2.0.0',
          recordingEnabled: true,
        },
        consent: {
          consentTextVersion: 'v1.0',
          ipAddress: '192.168.1.1',
          granted: false,
        },
      });
      const result = startSession(input);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('consent_declined');
    });

    it('should succeed with recording consent granted', () => {
      const result = startSession(makeInputWithRecording());

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.token!.recordingRequired).toBe(true);
    });

    it('should schedule auto-disconnect timer on success', () => {
      const result = startSession(makeValidInput());

      expect(result.success).toBe(true);
      expect(_getAutoDisconnectTimerCount()).toBe(1);

      const timer = getAutoDisconnectTimer(result.sessionId!);
      expect(timer).toBeDefined();
      expect(timer!.fired).toBe(false);

      // Default grace = 300s (5 min)
      const expectedDisconnect = new Date(WINDOW_END).getTime() + 300 * 1000;
      expect(timer!.scheduledAt).toBe(expectedDisconnect);
    });

    it('should write audit events on session start', () => {
      const result = startSession(makeValidInput());

      expect(result.success).toBe(true);
      const events = getAuditLog(result.sessionId);
      // At minimum: session_started event
      const startedEvents = events.filter(
        e => e.eventType === 'session_started',
      );
      expect(startedEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should write gate check audit event even on failure', () => {
      const input = makeValidInput({ appCount: 0 });
      startSession(input);

      const events = getAuditLog();
      const gateEvents = events.filter(
        e => e.eventType === 'session_gate_check',
      );
      expect(gateEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── orchestratedEndSession ────────────────────────────────────────────────────

  describe('orchestratedEndSession', () => {
    it('should end an active session and write audit event', () => {
      // Start and activate a session
      const startResult = startSession(makeValidInput());
      expect(startResult.success).toBe(true);
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      const endResult = orchestratedEndSession(startResult.sessionId!, 'user_initiated');

      expect(endResult.success).toBe(true);
      expect(endResult.reason).toBe('user_initiated');

      const session = getSession(startResult.sessionId!);
      expect(session!.status).toBe('completed');
    });

    it('should return error for non-existent session', () => {
      const result = orchestratedEndSession('nonexistent', 'user_initiated');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should write session_ended audit event', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      orchestratedEndSession(startResult.sessionId!, 'user_initiated');

      const events = getAuditLog(startResult.sessionId!);
      const endEvents = events.filter(e => e.eventType === 'session_ended');
      expect(endEvents.length).toBe(1);
    });
  });

  // ─── handlePolicyViolation ─────────────────────────────────────────────────────

  describe('handlePolicyViolation', () => {
    it('should terminate session on full_desktop violation', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      const result = handlePolicyViolation(startResult.sessionId!, 'full_desktop');

      expect(result.terminated).toBe(true);
      expect(result.violationType).toBe('full_desktop');
      expect(result.terminatedWithinDeadline).toBe(true);
      expect(result.auditEventId).toBeDefined();
    });

    it('should terminate within 5 second deadline', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      const result = handlePolicyViolation(startResult.sessionId!, 'full_desktop');

      expect(result.terminatedWithinDeadline).toBe(true);
      expect(getPolicyViolationDeadlineMs()).toBe(5000);
    });

    it('should write policy_violation_full_desktop audit event', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      handlePolicyViolation(startResult.sessionId!, 'full_desktop');

      const events = getAuditLog(startResult.sessionId!);
      const violationEvents = events.filter(
        e => e.eventType === 'policy_violation_full_desktop',
      );
      expect(violationEvents.length).toBe(1);
    });

    it('should return error for non-existent session', () => {
      const result = handlePolicyViolation('nonexistent', 'full_desktop');

      expect(result.terminated).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should mark session as terminated', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      handlePolicyViolation(startResult.sessionId!, 'full_desktop');

      const session = getSession(startResult.sessionId!);
      expect(session!.status).toBe('terminated');
    });
  });

  // ─── enforceAutoDisconnect ─────────────────────────────────────────────────────

  describe('enforceAutoDisconnect', () => {
    it('should disconnect when booking window + grace has expired', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      // Simulate time after booking window + grace (1hr + 5min grace)
      const afterGrace = new Date(WINDOW_END).getTime() + 301 * 1000;
      const result = enforceAutoDisconnect(startResult.sessionId!, afterGrace);

      expect(result.disconnected).toBe(true);
      expect(result.reason).toBe('booking_window_expired');
      expect(result.auditEventId).toBeDefined();
    });

    it('should NOT disconnect before grace period ends', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      // Simulate time within grace period (1hr + 2min, grace is 5min)
      const withinGrace = new Date(WINDOW_END).getTime() + 120 * 1000;
      const result = enforceAutoDisconnect(startResult.sessionId!, withinGrace);

      expect(result.disconnected).toBe(false);
    });

    it('should write auto_disconnect_triggered audit event', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      const afterGrace = new Date(WINDOW_END).getTime() + 301 * 1000;
      enforceAutoDisconnect(startResult.sessionId!, afterGrace);

      const events = getAuditLog(startResult.sessionId!);
      const disconnectEvents = events.filter(
        e => e.eventType === 'auto_disconnect_triggered',
      );
      expect(disconnectEvents.length).toBe(1);
    });

    it('should return error for non-active session', () => {
      const startResult = startSession(makeValidInput());
      // Session is in 'pending' (not activated)

      const afterGrace = new Date(WINDOW_END).getTime() + 301 * 1000;
      const result = enforceAutoDisconnect(startResult.sessionId!, afterGrace);

      expect(result.disconnected).toBe(false);
      expect(result.error).toContain('not active');
    });
  });

  // ─── handleSecurityPause ───────────────────────────────────────────────────────

  describe('handleSecurityPause', () => {
    it('should pause input on active session', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      const result = handleSecurityPause(startResult.sessionId!, 'incident-001');

      expect(result.paused).toBe(true);
      expect(result.inputBlocked).toBe(true);
      expect(result.terminationScheduled).toBe(true);
      expect(result.terminationTimeoutMs).toBe(15 * 60 * 1000);
    });

    it('should write input_blocked audit event', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      handleSecurityPause(startResult.sessionId!, 'incident-001');

      const events = getAuditLog(startResult.sessionId!);
      const blockedEvents = events.filter(e => e.eventType === 'input_blocked');
      expect(blockedEvents.length).toBe(1);
    });

    it('should store security pause record', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      handleSecurityPause(startResult.sessionId!, 'incident-001');

      const record = getSecurityPauseRecord(startResult.sessionId!);
      expect(record).toBeDefined();
      expect(record!.incidentId).toBe('incident-001');
      expect(record!.inputBlocked).toBe(true);
      expect(record!.terminated).toBe(false);
    });

    it('should return error for non-active session', () => {
      const startResult = startSession(makeValidInput());
      // Session is 'pending' (not activated)

      const result = handleSecurityPause(startResult.sessionId!, 'incident-001');

      expect(result.paused).toBe(false);
      expect(result.error).toContain('not active');
    });
  });

  // ─── enforceSecurityTimeout ────────────────────────────────────────────────────

  describe('enforceSecurityTimeout', () => {
    it('should terminate session after 15min timeout', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      handleSecurityPause(startResult.sessionId!, 'incident-001');

      // Simulate 15 minutes + 1 second passing
      const after15min = Date.now() + (15 * 60 * 1000) + 1000;
      const terminated = enforceSecurityTimeout(startResult.sessionId!, after15min);

      expect(terminated).toBe(true);

      const session = getSession(startResult.sessionId!);
      expect(session!.status).toBe('terminated');
    });

    it('should NOT terminate before 15min timeout', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      handleSecurityPause(startResult.sessionId!, 'incident-001');

      // Only 10 minutes have passed
      const after10min = Date.now() + (10 * 60 * 1000);
      const terminated = enforceSecurityTimeout(startResult.sessionId!, after10min);

      expect(terminated).toBe(false);

      const session = getSession(startResult.sessionId!);
      expect(session!.status).toBe('active');
    });

    it('should write security timeout audit event on termination', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      handleSecurityPause(startResult.sessionId!, 'incident-001');

      const after15min = Date.now() + (15 * 60 * 1000) + 1000;
      enforceSecurityTimeout(startResult.sessionId!, after15min);

      const events = getAuditLog(startResult.sessionId!);
      const timeoutEvents = events.filter(
        e => e.eventType === 'session_terminated_security_timeout',
      );
      expect(timeoutEvents.length).toBe(1);
    });

    it('should return false for session without security pause', () => {
      const startResult = startSession(makeValidInput());
      activateSession({ sessionId: startResult.sessionId!, connectionType: 'peer_to_peer' });

      const terminated = enforceSecurityTimeout(startResult.sessionId!);
      expect(terminated).toBe(false);
    });

    it('should return correct security timeout value', () => {
      expect(getSecurityTimeoutMs()).toBe(15 * 60 * 1000);
    });
  });
});
