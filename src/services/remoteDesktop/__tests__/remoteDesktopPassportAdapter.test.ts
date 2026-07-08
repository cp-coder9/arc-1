/**
 * Tests for Remote Desktop — Project Passport Integration Adapter
 *
 * Validates: Requirements 13.1, 13.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SessionRecord } from '../sessionBrokerService';
import {
  writeSessionToPassport,
  isProjectLinked,
  getPassportRecord,
  getAdminNotifications,
  _resetPassportAdapterState,
  _setPersistOverride,
} from '../remoteDesktopPassportAdapter';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createMockSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'session-abc-123',
    bookingId: 'booking-xyz-789',
    hostId: 'host-001',
    consumerUid: 'consumer-uid-42',
    ownerUid: 'owner-uid-99',
    tokenId: 'token-001',
    projectReference: 'project-ref-001',
    status: 'completed',
    connectionType: 'peer-to-peer',
    startTimestamp: Date.now() - 3600_000,
    endTimestamp: Date.now(),
    windowStart: Date.now() - 7200_000,
    windowEnd: Date.now() + 3600_000,
    gracePeriodSeconds: 300,
    totalConnectedSeconds: 3540, // 59 minutes → rounds up to 59 whole minutes
    totalDisconnectionGapSeconds: 60,
    applicationsUsed: ['revit', 'autocad'],
    filesProducedCount: 5,
    disconnectionReason: 'user_initiated',
    ownerApproved: false,
    reconnectionAttempts: 0,
    lastDisconnectTimestamp: null,
    createdAt: Date.now() - 3600_000,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('remoteDesktopPassportAdapter', () => {
  beforeEach(() => {
    _resetPassportAdapterState();
  });

  describe('isProjectLinked', () => {
    it('returns true when session has a non-empty project reference', () => {
      const session = createMockSession({ projectReference: 'proj-123' });
      expect(isProjectLinked(session)).toBe(true);
    });

    it('returns false when session has no project reference', () => {
      const session = createMockSession({ projectReference: undefined });
      expect(isProjectLinked(session)).toBe(false);
    });

    it('returns false when project reference is empty string', () => {
      const session = createMockSession({ projectReference: '' });
      expect(isProjectLinked(session)).toBe(false);
    });

    it('returns false when project reference is whitespace only', () => {
      const session = createMockSession({ projectReference: '   ' });
      expect(isProjectLinked(session)).toBe(false);
    });
  });

  describe('writeSessionToPassport', () => {
    it('writes a ProjectRecord successfully on first attempt', async () => {
      const session = createMockSession();
      const result = await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0,
      );

      expect(result.success).toBe(true);
      expect(result.recordId).toBeDefined();
      expect(result.attempts).toBe(1);
    });

    it('creates a ProjectRecord with correct session metadata', async () => {
      const session = createMockSession({
        totalConnectedSeconds: 125, // 2 min 5 sec → rounds up to 3 minutes
        applicationsUsed: ['revit', 'sketchup'],
        filesProducedCount: 7,
        disconnectionReason: 'booking_window_expired',
      });

      await writeSessionToPassport(
        { session, projectId: 'proj-002', tenantId: 'tenant-002' },
        0,
      );

      const stored = getPassportRecord(session.sessionId);
      expect(stored).toBeDefined();
      expect(stored!.record.payload.sessionId).toBe(session.sessionId);
      expect(stored!.record.payload.bookingReference).toBe(session.bookingId);
      expect(stored!.record.payload.consumerUid).toBe(session.consumerUid);
      expect(stored!.record.payload.connectedDurationMinutes).toBe(3);
      expect(stored!.record.payload.applicationsUsed).toEqual(['revit', 'sketchup']);
      expect(stored!.record.payload.filesProduced).toBe(7);
      expect(stored!.record.payload.disconnectionReason).toBe('booking_window_expired');
    });

    it('returns correct ProjectRecord envelope fields', async () => {
      const session = createMockSession();
      await writeSessionToPassport(
        { session, projectId: 'proj-003', tenantId: 'tenant-003' },
        0,
      );

      const stored = getPassportRecord(session.sessionId);
      expect(stored).toBeDefined();
      expect(stored!.record.tenantId).toBe('tenant-003');
      expect(stored!.record.projectId).toBe('proj-003');
      expect(stored!.record.moduleKey).toBe('project');
      expect(stored!.record.status).toBe('approved');
      expect(stored!.record.audit.createdBy).toBe('system:remote-desktop');
      expect(stored!.record.linkedRecordIds).toEqual([]);
    });

    it('rejects write when session has no project reference', async () => {
      const session = createMockSession({ projectReference: undefined });
      const result = await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('no project reference');
      expect(result.attempts).toBe(0);
    });

    it('rejects write when projectId is empty', async () => {
      const session = createMockSession();
      const result = await writeSessionToPassport(
        { session, projectId: '', tenantId: 'tenant-001' },
        0,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing projectId or tenantId');
      expect(result.attempts).toBe(0);
    });

    it('rejects write when tenantId is empty', async () => {
      const session = createMockSession();
      const result = await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: '' },
        0,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing projectId or tenantId');
      expect(result.attempts).toBe(0);
    });

    it('retries up to 3 times on failure then notifies Platform_Admin', async () => {
      let callCount = 0;
      _setPersistOverride(async () => {
        callCount++;
        throw new Error('Firestore unavailable');
      });

      const session = createMockSession();
      const result = await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0, // no delay for tests
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(callCount).toBe(3);
      expect(result.error).toBe('Firestore unavailable');

      // Verify Platform_Admin notification
      const notifications = getAdminNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('passport_write_failed');
      expect(notifications[0].sessionId).toBe(session.sessionId);
      expect(notifications[0].projectId).toBe('proj-001');
      expect(notifications[0].reason).toContain('Firestore unavailable');
    });

    it('succeeds on second attempt after first failure', async () => {
      let callCount = 0;
      _setPersistOverride(async (record) => {
        callCount++;
        if (callCount === 1) throw new Error('Temporary failure');
        return record.id;
      });

      const session = createMockSession();
      const result = await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0,
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(callCount).toBe(2);

      // No admin notification since it succeeded
      expect(getAdminNotifications()).toHaveLength(0);
    });

    it('succeeds on third attempt after two failures', async () => {
      let callCount = 0;
      _setPersistOverride(async (record) => {
        callCount++;
        if (callCount <= 2) throw new Error('Network timeout');
        return record.id;
      });

      const session = createMockSession();
      const result = await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0,
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(callCount).toBe(3);
      expect(getAdminNotifications()).toHaveLength(0);
    });

    it('calculates 0 minutes for zero-second connected duration', async () => {
      const session = createMockSession({ totalConnectedSeconds: 0 });
      await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0,
      );

      const stored = getPassportRecord(session.sessionId);
      expect(stored!.record.payload.connectedDurationMinutes).toBe(0);
    });

    it('rounds up partial minutes (e.g., 61s → 2 minutes)', async () => {
      const session = createMockSession({ totalConnectedSeconds: 61 });
      await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0,
      );

      const stored = getPassportRecord(session.sessionId);
      expect(stored!.record.payload.connectedDurationMinutes).toBe(2);
    });

    it('handles exactly 60 seconds as 1 minute', async () => {
      const session = createMockSession({ totalConnectedSeconds: 60 });
      await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0,
      );

      const stored = getPassportRecord(session.sessionId);
      expect(stored!.record.payload.connectedDurationMinutes).toBe(1);
    });
  });

  describe('getPassportRecord', () => {
    it('returns undefined for unknown session ID', () => {
      expect(getPassportRecord('unknown-session')).toBeUndefined();
    });

    it('returns the stored record after successful write', async () => {
      const session = createMockSession();
      await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0,
      );

      const record = getPassportRecord(session.sessionId);
      expect(record).toBeDefined();
      expect(record!.sessionId).toBe(session.sessionId);
      expect(record!.projectId).toBe('proj-001');
      expect(record!.tenantId).toBe('tenant-001');
      expect(record!.writtenAt).toBeDefined();
    });

    it('does not store record when write fails', async () => {
      _setPersistOverride(async () => {
        throw new Error('Always fail');
      });

      const session = createMockSession();
      await writeSessionToPassport(
        { session, projectId: 'proj-001', tenantId: 'tenant-001' },
        0,
      );

      expect(getPassportRecord(session.sessionId)).toBeUndefined();
    });
  });
});
