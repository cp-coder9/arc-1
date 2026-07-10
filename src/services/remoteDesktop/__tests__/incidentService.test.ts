/**
 * @vitest-environment node
 *
 * Incident Service — Unit Tests
 *
 * Validates Requirements 3.1–3.8 (Incident and Support Escalation Flow)
 */

import {
  createIncident,
  updateIncidentStatus,
  createAutoIncident,
  getIncident,
  getIncidentsBySession,
  isWithinReportingWindow,
  getSecurityTimeout,
  checkSecurityTimeouts,
  getSignals,
  getWorkflowEvents,
  _clearAllState,
  _getIncidentCount,
  _getSecurityTimeoutCount,
  type CreateIncidentInput,
} from '../incidentService';
import { INCIDENT_CATEGORY, INCIDENT_STATUS } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeValidInput(overrides: Partial<CreateIncidentInput> = {}): CreateIncidentInput {
  return {
    sessionId: 'session-001',
    bookingId: 'booking-001',
    reporterUid: 'user-consumer-1',
    reporterRole: 'consumer',
    category: INCIDENT_CATEGORY.CONNECTION_QUALITY,
    description: 'The connection keeps dropping every few minutes during my session',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('incidentService', () => {
  beforeEach(() => {
    _clearAllState();
  });

  // ─── Incident Creation (Req 3.1, 3.2) ──────────────────────────────────────

  describe('createIncident', () => {
    it('creates an incident with valid input', () => {
      const input = makeValidInput();
      const incident = createIncident(input);

      expect(incident.incidentId).toBeTruthy();
      expect(incident.sessionId).toBe('session-001');
      expect(incident.bookingId).toBe('booking-001');
      expect(incident.reporterUid).toBe('user-consumer-1');
      expect(incident.reporterRole).toBe('consumer');
      expect(incident.category).toBe('connection_quality');
      expect(incident.description).toBe(input.description);
      expect(incident.status).toBe('open');
      expect(incident.createdAt).toBeTruthy();
      expect(incident.updatedAt).toBeTruthy();
      expect(incident.resolvedAt).toBeUndefined();
    });

    it('stores the incident and can be retrieved', () => {
      const incident = createIncident(makeValidInput());
      const retrieved = getIncident(incident.incidentId);
      expect(retrieved).toEqual(incident);
    });

    it('includes screenshot reference when provided', () => {
      const incident = createIncident(
        makeValidInput({ screenshotRef: 'screenshots/incident-123.png' }),
      );
      expect(incident.screenshotRef).toBe('screenshots/incident-123.png');
    });

    it('rejects description shorter than 10 characters', () => {
      expect(() => createIncident(makeValidInput({ description: 'too short' }))).toThrow(
        /at least 10 characters/,
      );
    });

    it('rejects empty description', () => {
      expect(() => createIncident(makeValidInput({ description: '' }))).toThrow(
        /at least 10 characters/,
      );
    });

    it('rejects description longer than 1000 characters', () => {
      const longDesc = 'x'.repeat(1001);
      expect(() => createIncident(makeValidInput({ description: longDesc }))).toThrow(
        /must not exceed 1000 characters/,
      );
    });

    it('accepts description exactly 10 characters', () => {
      const incident = createIncident(makeValidInput({ description: '1234567890' }));
      expect(incident.description).toBe('1234567890');
    });

    it('accepts description exactly 1000 characters', () => {
      const desc = 'x'.repeat(1000);
      const incident = createIncident(makeValidInput({ description: desc }));
      expect(incident.description).toBe(desc);
    });

    it('rejects invalid category', () => {
      expect(() =>
        createIncident(makeValidInput({ category: 'invalid_category' as any })),
      ).toThrow(/Invalid incident category/);
    });

    it('accepts all valid categories', () => {
      const categories = [
        INCIDENT_CATEGORY.CONNECTION_QUALITY,
        INCIDENT_CATEGORY.APP_NOT_WORKING,
        INCIDENT_CATEGORY.SECURITY_CONCERN,
        INCIDENT_CATEGORY.BILLING_DISPUTE,
        INCIDENT_CATEGORY.OTHER,
      ];
      for (const category of categories) {
        _clearAllState();
        const incident = createIncident(makeValidInput({ category }));
        expect(incident.category).toBe(category);
      }
    });

    it('trims whitespace from description', () => {
      const incident = createIncident(
        makeValidInput({ description: '  This is a valid description with spaces  ' }),
      );
      expect(incident.description).toBe('This is a valid description with spaces');
    });
  });

  // ─── Security Concern → Input Pause (Req 3.4) ──────────────────────────────

  describe('security concern — input pause signal', () => {
    it('emits input_pause signal when category is security_concern', () => {
      const incident = createIncident(
        makeValidInput({ category: INCIDENT_CATEGORY.SECURITY_CONCERN }),
      );

      const sigs = getSignals();
      expect(sigs.length).toBe(1);
      expect(sigs[0].type).toBe('input_pause');
      expect(sigs[0].sessionId).toBe('session-001');
      expect((sigs[0] as any).incidentId).toBe(incident.incidentId);
    });

    it('does NOT emit input_pause signal for non-security categories', () => {
      createIncident(makeValidInput({ category: INCIDENT_CATEGORY.CONNECTION_QUALITY }));
      createIncident(makeValidInput({ category: INCIDENT_CATEGORY.APP_NOT_WORKING }));
      createIncident(makeValidInput({ category: INCIDENT_CATEGORY.BILLING_DISPUTE }));
      createIncident(makeValidInput({ category: INCIDENT_CATEGORY.OTHER }));

      const pauseSignals = getSignals().filter((s) => s.type === 'input_pause');
      expect(pauseSignals.length).toBe(0);
    });

    it('input pause signal timestamp is at incident creation time', () => {
      const before = Date.now();
      const incident = createIncident(
        makeValidInput({ category: INCIDENT_CATEGORY.SECURITY_CONCERN }),
      );
      const after = Date.now();

      const sig = getSignals()[0];
      const sigTime = new Date(sig.timestamp).getTime();
      expect(sigTime).toBeGreaterThanOrEqual(before);
      expect(sigTime).toBeLessThanOrEqual(after);
      expect(sig.timestamp).toBe(incident.createdAt);
    });
  });

  // ─── 15-Minute Security Timeout (Req 3.6) ──────────────────────────────────

  describe('security timeout — 15-minute unreviewed', () => {
    it('registers a security timeout for security_concern incidents', () => {
      const incident = createIncident(
        makeValidInput({ category: INCIDENT_CATEGORY.SECURITY_CONCERN }),
      );

      const timeout = getSecurityTimeout(incident.incidentId);
      expect(timeout).toBeDefined();
      expect(timeout!.incidentId).toBe(incident.incidentId);
      expect(timeout!.sessionId).toBe('session-001');
      expect(timeout!.fired).toBe(false);

      // Timeout should be 15 minutes after creation
      const createdMs = new Date(timeout!.createdAt).getTime();
      const timeoutMs = new Date(timeout!.timeoutAt).getTime();
      expect(timeoutMs - createdMs).toBe(15 * 60 * 1000);
    });

    it('does NOT register a timeout for non-security categories', () => {
      createIncident(makeValidInput({ category: INCIDENT_CATEGORY.CONNECTION_QUALITY }));
      expect(_getSecurityTimeoutCount()).toBe(0);
    });

    it('fires termination signal when timeout expires without review', () => {
      const incident = createIncident(
        makeValidInput({ category: INCIDENT_CATEGORY.SECURITY_CONCERN }),
      );

      const timeout = getSecurityTimeout(incident.incidentId)!;
      // Simulate time passing past the 15-minute mark
      const pastTimeout = new Date(
        new Date(timeout.timeoutAt).getTime() + 1000,
      ).toISOString();

      const fired = checkSecurityTimeouts(pastTimeout);
      expect(fired.length).toBe(1);
      expect(fired[0].type).toBe('session_termination');
      expect(fired[0].sessionId).toBe('session-001');
      expect(fired[0].incidentId).toBe(incident.incidentId);
      expect(fired[0].reason).toBe('security_timeout');
    });

    it('does NOT fire termination before 15 minutes', () => {
      const incident = createIncident(
        makeValidInput({ category: INCIDENT_CATEGORY.SECURITY_CONCERN }),
      );

      const timeout = getSecurityTimeout(incident.incidentId)!;
      // 14 minutes in (before the 15-minute mark)
      const beforeTimeout = new Date(
        new Date(timeout.createdAt).getTime() + 14 * 60 * 1000,
      ).toISOString();

      const fired = checkSecurityTimeouts(beforeTimeout);
      expect(fired.length).toBe(0);
    });

    it('cancels security timeout when admin reviews the incident', () => {
      const incident = createIncident(
        makeValidInput({ category: INCIDENT_CATEGORY.SECURITY_CONCERN }),
      );

      // Admin reviews (changes status to investigating)
      updateIncidentStatus({
        incidentId: incident.incidentId,
        status: INCIDENT_STATUS.INVESTIGATING,
        adminUid: 'admin-001',
      });

      // Timeout should be removed
      const timeout = getSecurityTimeout(incident.incidentId);
      expect(timeout).toBeUndefined();
    });

    it('does not fire twice for the same incident', () => {
      const incident = createIncident(
        makeValidInput({ category: INCIDENT_CATEGORY.SECURITY_CONCERN }),
      );

      const timeout = getSecurityTimeout(incident.incidentId)!;
      const pastTimeout = new Date(
        new Date(timeout.timeoutAt).getTime() + 1000,
      ).toISOString();

      const first = checkSecurityTimeouts(pastTimeout);
      expect(first.length).toBe(1);

      // Second check should not fire again
      const second = checkSecurityTimeouts(pastTimeout);
      expect(second.length).toBe(0);
    });
  });

  // ─── Status Management (Req 3.5) ──────────────────────────────────────────

  describe('updateIncidentStatus', () => {
    it('transitions from open to investigating', () => {
      const incident = createIncident(makeValidInput());
      const updated = updateIncidentStatus({
        incidentId: incident.incidentId,
        status: INCIDENT_STATUS.INVESTIGATING,
        adminUid: 'admin-001',
      });
      expect(updated.status).toBe('investigating');
      expect(updated.updatedAt).toBeTruthy();
    });

    it('transitions from open to resolved with resolution note', () => {
      const incident = createIncident(makeValidInput());
      const updated = updateIncidentStatus({
        incidentId: incident.incidentId,
        status: INCIDENT_STATUS.RESOLVED,
        resolutionNote: 'Issue was caused by network congestion. Resolved by switching to TURN relay.',
        adminUid: 'admin-001',
      });
      expect(updated.status).toBe('resolved');
      expect(updated.resolutionNote).toBeTruthy();
      expect(updated.resolvedAt).toBeTruthy();
    });

    it('transitions from open to escalated', () => {
      const incident = createIncident(makeValidInput());
      const updated = updateIncidentStatus({
        incidentId: incident.incidentId,
        status: INCIDENT_STATUS.ESCALATED,
        adminUid: 'admin-001',
      });
      expect(updated.status).toBe('escalated');
    });

    it('transitions from open to closed', () => {
      const incident = createIncident(makeValidInput());
      const updated = updateIncidentStatus({
        incidentId: incident.incidentId,
        status: INCIDENT_STATUS.CLOSED,
        adminUid: 'admin-001',
      });
      expect(updated.status).toBe('closed');
      expect(updated.resolvedAt).toBeTruthy();
    });

    it('rejects invalid transition from closed', () => {
      const incident = createIncident(makeValidInput());
      updateIncidentStatus({
        incidentId: incident.incidentId,
        status: INCIDENT_STATUS.CLOSED,
        adminUid: 'admin-001',
      });
      expect(() =>
        updateIncidentStatus({
          incidentId: incident.incidentId,
          status: INCIDENT_STATUS.INVESTIGATING,
          adminUid: 'admin-001',
        }),
      ).toThrow(/Invalid status transition/);
    });

    it('rejects transition from resolved to investigating', () => {
      const incident = createIncident(makeValidInput());
      updateIncidentStatus({
        incidentId: incident.incidentId,
        status: INCIDENT_STATUS.RESOLVED,
        adminUid: 'admin-001',
      });
      expect(() =>
        updateIncidentStatus({
          incidentId: incident.incidentId,
          status: INCIDENT_STATUS.INVESTIGATING,
          adminUid: 'admin-001',
        }),
      ).toThrow(/Invalid status transition/);
    });

    it('throws for non-existent incident', () => {
      expect(() =>
        updateIncidentStatus({
          incidentId: 'non-existent',
          status: INCIDENT_STATUS.INVESTIGATING,
          adminUid: 'admin-001',
        }),
      ).toThrow(/Incident not found/);
    });

    it('validates resolution note length (min 10)', () => {
      const incident = createIncident(makeValidInput());
      expect(() =>
        updateIncidentStatus({
          incidentId: incident.incidentId,
          status: INCIDENT_STATUS.RESOLVED,
          resolutionNote: 'too short',
          adminUid: 'admin-001',
        }),
      ).toThrow(/at least 10 characters/);
    });

    it('validates resolution note length (max 2000)', () => {
      const incident = createIncident(makeValidInput());
      expect(() =>
        updateIncidentStatus({
          incidentId: incident.incidentId,
          status: INCIDENT_STATUS.RESOLVED,
          resolutionNote: 'x'.repeat(2001),
          adminUid: 'admin-001',
        }),
      ).toThrow(/must not exceed 2000 characters/);
    });

    it('allows status change without resolution note', () => {
      const incident = createIncident(makeValidInput());
      const updated = updateIncidentStatus({
        incidentId: incident.incidentId,
        status: INCIDENT_STATUS.INVESTIGATING,
        adminUid: 'admin-001',
      });
      expect(updated.resolutionNote).toBeUndefined();
    });
  });

  // ─── Auto-Creation on Owner Termination (Req 3.7) ──────────────────────────

  describe('createAutoIncident', () => {
    it('creates a security_concern incident from owner', () => {
      const incident = createAutoIncident({
        sessionId: 'session-002',
        bookingId: 'booking-002',
        ownerUid: 'owner-001',
        description: 'Consumer attempted to access files outside the session workspace',
      });

      expect(incident.category).toBe('security_concern');
      expect(incident.reporterRole).toBe('owner');
      expect(incident.reporterUid).toBe('owner-001');
      expect(incident.sessionId).toBe('session-002');
      expect(incident.status).toBe('open');
    });

    it('triggers input pause and security timeout', () => {
      const incident = createAutoIncident({
        sessionId: 'session-002',
        bookingId: 'booking-002',
        ownerUid: 'owner-001',
        description: 'Suspicious activity detected during the remote session',
      });

      const pauseSignals = getSignals().filter((s) => s.type === 'input_pause');
      expect(pauseSignals.length).toBe(1);

      const timeout = getSecurityTimeout(incident.incidentId);
      expect(timeout).toBeDefined();
    });

    it('validates description length', () => {
      expect(() =>
        createAutoIncident({
          sessionId: 'session-002',
          bookingId: 'booking-002',
          ownerUid: 'owner-001',
          description: 'short',
        }),
      ).toThrow(/at least 10 characters/);
    });
  });

  // ─── 72-Hour Post-Session Reporting Window (Req 3.8) ───────────────────────

  describe('isWithinReportingWindow', () => {
    it('returns true when within 72 hours of session end', () => {
      const sessionEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
      expect(isWithinReportingWindow(sessionEnd)).toBe(true);
    });

    it('returns true at exactly 72 hours', () => {
      const now = '2024-01-04T12:00:00.000Z';
      const sessionEnd = '2024-01-01T12:00:00.000Z'; // exactly 72h before
      expect(isWithinReportingWindow(sessionEnd, now)).toBe(true);
    });

    it('returns false after 72 hours', () => {
      const now = '2024-01-04T12:00:01.000Z';
      const sessionEnd = '2024-01-01T12:00:00.000Z'; // 72h + 1s before
      expect(isWithinReportingWindow(sessionEnd, now)).toBe(false);
    });

    it('returns true when session just ended', () => {
      const now = new Date().toISOString();
      expect(isWithinReportingWindow(now, now)).toBe(true);
    });

    it('returns false for future session end time', () => {
      const futureEnd = new Date(Date.now() + 60_000).toISOString();
      expect(isWithinReportingWindow(futureEnd)).toBe(false);
    });
  });

  describe('reporting window enforcement on createIncident', () => {
    it('rejects incident creation outside 72-hour window', () => {
      const expiredSession = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
      expect(() =>
        createIncident(makeValidInput({ sessionEndTime: expiredSession })),
      ).toThrow(/72-hour post-session reporting window has expired/);
    });

    it('allows incident creation within 72-hour window', () => {
      const recentSession = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const incident = createIncident(makeValidInput({ sessionEndTime: recentSession }));
      expect(incident.incidentId).toBeTruthy();
    });

    it('allows incident creation without sessionEndTime (active session)', () => {
      const incident = createIncident(makeValidInput());
      expect(incident.incidentId).toBeTruthy();
    });
  });

  // ─── WorkflowEvent Emission (Req 3.3) ──────────────────────────────────────

  describe('WorkflowEvent emission', () => {
    it('emits workflow events targeting admin and opposing party', () => {
      createIncident(makeValidInput({ reporterRole: 'consumer' }));

      const events = getWorkflowEvents();
      expect(events.length).toBe(2);

      // First event: Platform_Admin
      expect(events[0].eventType).toBe('incident_raised');
      expect(events[0].targetRole).toBe('admin');
      expect(events[0].payload.category).toBe('connection_quality');

      // Second event: opposing party (owner, since reporter is consumer)
      expect(events[1].eventType).toBe('incident_raised');
      expect(events[1].targetRole).toBe('owner');
    });

    it('targets consumer when reporter is owner', () => {
      createIncident(makeValidInput({ reporterRole: 'owner' }));

      const events = getWorkflowEvents();
      expect(events[1].targetRole).toBe('consumer');
    });

    it('includes incident metadata in payload', () => {
      const incident = createIncident(makeValidInput());
      const events = getWorkflowEvents();

      expect(events[0].payload.incidentId).toBe(incident.incidentId);
      expect(events[0].payload.description).toBe(incident.description);
      expect(events[0].sessionId).toBe('session-001');
      expect(events[0].bookingId).toBe('booking-001');
    });

    it('emits within 60 seconds of creation (timestamp matches)', () => {
      const before = Date.now();
      const incident = createIncident(makeValidInput());
      const events = getWorkflowEvents();

      for (const event of events) {
        const eventTime = new Date(event.createdAt).getTime();
        // Workflow event timestamp equals incident creation time
        expect(eventTime).toBe(new Date(incident.createdAt).getTime());
        // And creation time is within reasonable bounds
        expect(eventTime).toBeGreaterThanOrEqual(before);
        expect(eventTime).toBeLessThanOrEqual(before + 1000);
      }
    });
  });

  // ─── Session Query ─────────────────────────────────────────────────────────

  describe('getIncidentsBySession', () => {
    it('returns all incidents for a session', () => {
      createIncident(makeValidInput({ sessionId: 'session-A' }));
      createIncident(
        makeValidInput({
          sessionId: 'session-A',
          category: INCIDENT_CATEGORY.APP_NOT_WORKING,
          description: 'Application froze and became unresponsive during rendering',
        }),
      );
      createIncident(makeValidInput({ sessionId: 'session-B' }));

      const sessionA = getIncidentsBySession('session-A');
      expect(sessionA.length).toBe(2);

      const sessionB = getIncidentsBySession('session-B');
      expect(sessionB.length).toBe(1);
    });

    it('returns empty array for unknown session', () => {
      expect(getIncidentsBySession('non-existent')).toEqual([]);
    });
  });
});
