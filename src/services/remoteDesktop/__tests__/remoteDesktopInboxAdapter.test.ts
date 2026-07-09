import { describe, it, expect, beforeEach } from 'vitest';
import {
  emitCriticalEvent,
  addPendingBookingItem,
  removePendingBookingItem,
  getPendingBookingsForOwner,
  addActiveSessionItem,
  updateActiveSessionRemainingTime,
  removeActiveSessionItem,
  getActiveSessionsForConsumer,
  getEmittedEvents,
  getActivityLog,
  isCriticalEventType,
  _resetInboxAdapterState,
  _setEmitOverride,
} from '../remoteDesktopInboxAdapter';
import type { CriticalEventInput, PendingBookingItem, ActiveSessionItem } from '../remoteDesktopInboxAdapter';

describe('remoteDesktopInboxAdapter', () => {
  beforeEach(() => {
    _resetInboxAdapterState();
  });

  // ─── Critical Event Emission ──────────────────────────────────────────────────

  describe('emitCriticalEvent', () => {
    it('emits a WorkflowEvent for connection_failed', async () => {
      const input: CriticalEventInput = {
        eventType: 'connection_failed',
        sessionId: 'session-001',
        bookingId: 'booking-001',
        hostId: 'host-001',
        consumerUid: 'consumer-001',
        ownerUid: 'owner-001',
        projectId: 'project-001',
      };

      const result = await emitCriticalEvent(input, 0);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.eventId).toBeDefined();

      const events = getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('risk_detected');
      expect(events[0].title).toBe('Remote Desktop: Connection Failed');
      expect(events[0].priority).toBe('high');
      expect(events[0].projectId).toBe('project-001');
    });

    it('emits a WorkflowEvent for session_terminated_uac with critical priority', async () => {
      const input: CriticalEventInput = {
        eventType: 'session_terminated_uac',
        sessionId: 'session-002',
        bookingId: 'booking-002',
        hostId: 'host-002',
        consumerUid: 'consumer-002',
        ownerUid: 'owner-002',
      };

      const result = await emitCriticalEvent(input, 0);

      expect(result.success).toBe(true);
      const events = getEmittedEvents();
      expect(events[0].priority).toBe('critical');
      expect(events[0].title).toBe('Remote Desktop: Session Terminated (UAC)');
    });

    it('emits a WorkflowEvent for focus_violation_attempted', async () => {
      const input: CriticalEventInput = {
        eventType: 'focus_violation_attempted',
        sessionId: 'session-003',
        bookingId: 'booking-003',
        hostId: 'host-003',
        consumerUid: 'consumer-003',
        ownerUid: 'owner-003',
        projectId: 'project-003',
      };

      const result = await emitCriticalEvent(input, 0);

      expect(result.success).toBe(true);
      const events = getEmittedEvents();
      expect(events[0].priority).toBe('medium');
      expect(events[0].title).toBe('Remote Desktop: Focus Violation Attempted');
    });

    it('emits a WorkflowEvent for auto_disconnect_triggered', async () => {
      const input: CriticalEventInput = {
        eventType: 'auto_disconnect_triggered',
        sessionId: 'session-004',
        bookingId: 'booking-004',
        hostId: 'host-004',
        consumerUid: 'consumer-004',
        ownerUid: 'owner-004',
      };

      const result = await emitCriticalEvent(input, 0);

      expect(result.success).toBe(true);
      const events = getEmittedEvents();
      expect(events[0].priority).toBe('medium');
      expect(events[0].title).toBe('Remote Desktop: Auto-Disconnect Triggered');
    });

    it('uses session-based fallback projectId when none provided', async () => {
      const input: CriticalEventInput = {
        eventType: 'connection_failed',
        sessionId: 'session-005',
        bookingId: 'booking-005',
        hostId: 'host-005',
        consumerUid: 'consumer-005',
        ownerUid: 'owner-005',
      };

      const result = await emitCriticalEvent(input, 0);

      expect(result.success).toBe(true);
      const events = getEmittedEvents();
      expect(events[0].projectId).toBe('rd-session-session-005');
    });

    it('retries up to 3 times on failure then logs to Activity_Log', async () => {
      let callCount = 0;
      _setEmitOverride(async () => {
        callCount++;
        throw new Error('Network error');
      });

      const input: CriticalEventInput = {
        eventType: 'connection_failed',
        sessionId: 'session-006',
        bookingId: 'booking-006',
        hostId: 'host-006',
        consumerUid: 'consumer-006',
        ownerUid: 'owner-006',
      };

      const result = await emitCriticalEvent(input, 0);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.error).toBe('Network error');
      expect(callCount).toBe(3);

      const log = getActivityLog();
      expect(log).toHaveLength(3);
      expect(log[0].type).toBe('inbox_emit_retrying');
      expect(log[1].type).toBe('inbox_emit_retrying');
      expect(log[2].type).toBe('inbox_emit_failed');
      expect(log[2].eventType).toBe('connection_failed');
      expect(log[2].sessionId).toBe('session-006');
    });

    it('succeeds on second attempt after first failure', async () => {
      let callCount = 0;
      _setEmitOverride(async (event) => {
        callCount++;
        if (callCount === 1) throw new Error('Transient error');
        return event.id;
      });

      const input: CriticalEventInput = {
        eventType: 'auto_disconnect_triggered',
        sessionId: 'session-007',
        bookingId: 'booking-007',
        hostId: 'host-007',
        consumerUid: 'consumer-007',
        ownerUid: 'owner-007',
      };

      const result = await emitCriticalEvent(input, 0);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);

      const log = getActivityLog();
      expect(log).toHaveLength(1);
      expect(log[0].type).toBe('inbox_emit_retrying');
    });

    it('assigns platform_admin role to emitted events', async () => {
      const input: CriticalEventInput = {
        eventType: 'session_terminated_uac',
        sessionId: 'session-008',
        bookingId: 'booking-008',
        hostId: 'host-008',
        consumerUid: 'consumer-008',
        ownerUid: 'owner-008',
      };

      await emitCriticalEvent(input, 0);

      const events = getEmittedEvents();
      expect(events[0].assignedRoles).toContain('platform_admin');
    });
  });

  // ─── Pending Booking Items ────────────────────────────────────────────────────

  describe('pending booking items', () => {
    const booking1: PendingBookingItem = {
      bookingId: 'bk-001',
      hostName: 'Design Workstation A',
      requestedWindowStart: '2026-06-20T09:00:00Z',
      requestedWindowEnd: '2026-06-20T12:00:00Z',
      consumerName: 'Jane Freelancer',
      consumerUid: 'consumer-001',
      ownerUid: 'owner-001',
      projectId: 'project-001',
      createdAt: '2026-06-19T10:00:00Z',
    };

    const booking2: PendingBookingItem = {
      bookingId: 'bk-002',
      hostName: 'CAD Workstation B',
      requestedWindowStart: '2026-06-21T14:00:00Z',
      requestedWindowEnd: '2026-06-21T17:00:00Z',
      consumerName: 'Bob Engineer',
      consumerUid: 'consumer-002',
      ownerUid: 'owner-001',
      projectId: 'project-002',
      createdAt: '2026-06-19T12:00:00Z',
    };

    it('adds and retrieves pending booking items for an owner', () => {
      addPendingBookingItem(booking1);
      addPendingBookingItem(booking2);

      const items = getPendingBookingsForOwner('owner-001');
      expect(items).toHaveLength(2);
      // Sorted by createdAt descending (newest first)
      expect(items[0].bookingId).toBe('bk-002');
      expect(items[1].bookingId).toBe('bk-001');
    });

    it('returns empty array for owner with no pending bookings', () => {
      addPendingBookingItem(booking1);
      const items = getPendingBookingsForOwner('other-owner');
      expect(items).toHaveLength(0);
    });

    it('removes a pending booking item', () => {
      addPendingBookingItem(booking1);
      expect(removePendingBookingItem('bk-001')).toBe(true);
      expect(getPendingBookingsForOwner('owner-001')).toHaveLength(0);
    });

    it('returns false when removing non-existent booking', () => {
      expect(removePendingBookingItem('non-existent')).toBe(false);
    });

    it('includes all required fields in the pending booking item', () => {
      addPendingBookingItem(booking1);
      const items = getPendingBookingsForOwner('owner-001');
      const item = items[0];
      expect(item.hostName).toBe('Design Workstation A');
      expect(item.requestedWindowStart).toBe('2026-06-20T09:00:00Z');
      expect(item.requestedWindowEnd).toBe('2026-06-20T12:00:00Z');
      expect(item.consumerName).toBe('Jane Freelancer');
    });
  });

  // ─── Active Session Items ─────────────────────────────────────────────────────

  describe('active session items', () => {
    const session1: ActiveSessionItem = {
      sessionId: 'sess-001',
      bookingId: 'bk-001',
      hostName: 'Design Workstation A',
      consumerUid: 'consumer-001',
      ownerUid: 'owner-001',
      remainingMinutes: 45,
      projectId: 'project-001',
      createdAt: '2026-06-20T09:15:00Z',
    };

    const session2: ActiveSessionItem = {
      sessionId: 'sess-002',
      bookingId: 'bk-003',
      hostName: 'Render Workstation C',
      consumerUid: 'consumer-001',
      ownerUid: 'owner-002',
      remainingMinutes: 120,
      createdAt: '2026-06-20T10:00:00Z',
    };

    it('adds and retrieves active session items for a consumer', () => {
      addActiveSessionItem(session1);
      addActiveSessionItem(session2);

      const items = getActiveSessionsForConsumer('consumer-001');
      expect(items).toHaveLength(2);
      // Sorted by createdAt descending (newest first)
      expect(items[0].sessionId).toBe('sess-002');
      expect(items[1].sessionId).toBe('sess-001');
    });

    it('returns empty array for consumer with no active sessions', () => {
      addActiveSessionItem(session1);
      const items = getActiveSessionsForConsumer('other-consumer');
      expect(items).toHaveLength(0);
    });

    it('updates remaining time for an active session', () => {
      addActiveSessionItem(session1);
      const updated = updateActiveSessionRemainingTime('sess-001', 30);
      expect(updated).toBe(true);

      const items = getActiveSessionsForConsumer('consumer-001');
      expect(items[0].remainingMinutes).toBe(30);
    });

    it('returns false when updating non-existent session', () => {
      const updated = updateActiveSessionRemainingTime('non-existent', 10);
      expect(updated).toBe(false);
    });

    it('removes an active session item', () => {
      addActiveSessionItem(session1);
      expect(removeActiveSessionItem('sess-001')).toBe(true);
      expect(getActiveSessionsForConsumer('consumer-001')).toHaveLength(0);
    });

    it('returns false when removing non-existent session', () => {
      expect(removeActiveSessionItem('non-existent')).toBe(false);
    });

    it('displays remaining time and host name', () => {
      addActiveSessionItem(session1);
      const items = getActiveSessionsForConsumer('consumer-001');
      expect(items[0].remainingMinutes).toBe(45);
      expect(items[0].hostName).toBe('Design Workstation A');
    });
  });

  // ─── Utility Functions ────────────────────────────────────────────────────────

  describe('isCriticalEventType', () => {
    it('returns true for valid critical event types', () => {
      expect(isCriticalEventType('connection_failed')).toBe(true);
      expect(isCriticalEventType('focus_violation_attempted')).toBe(true);
      expect(isCriticalEventType('session_terminated_uac')).toBe(true);
      expect(isCriticalEventType('auto_disconnect_triggered')).toBe(true);
    });

    it('returns false for non-critical event types', () => {
      expect(isCriticalEventType('session_started')).toBe(false);
      expect(isCriticalEventType('app_launched')).toBe(false);
      expect(isCriticalEventType('random_string')).toBe(false);
    });
  });
});
