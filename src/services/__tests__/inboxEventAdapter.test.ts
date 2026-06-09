import { describe, expect, it, beforeEach } from 'vitest';
import {
  inbox,
  getInboxEvents,
  acknowledgeInboxEvent,
  getInboxEventCount,
  resetInboxState,
} from '../inboxEventAdapter';

describe('inboxEventAdapter', () => {
  beforeEach(() => {
    resetInboxState();
  });

  describe('inbox', () => {
    it('creates an inbox event with auto-generated ID', () => {
      const event = inbox('principal_agent', 'Retention release pending', 'rec-1', 'high');
      expect(event.eventId).toMatch(/^inbox-/);
      expect(event.recipientRole).toBe('principal_agent');
      expect(event.priority).toBe('high');
      expect(event.acknowledged).toBe(false);
    });

    it('accepts optional description and projectId', () => {
      const event = inbox('contractor', 'Defect liability expiring', 'rec-2', 'medium', {
        description: 'Please review remaining snags',
        projectId: 'project-1',
      });
      expect(event.description).toBe('Please review remaining snags');
      expect(event.projectId).toBe('project-1');
    });
  });

  describe('getInboxEvents', () => {
    it('filters by recipient role', () => {
      inbox('platform_admin', 'Alert 1', 'rec-1', 'high');
      inbox('principal_agent', 'Alert 2', 'rec-2', 'medium');

      const adminEvents = getInboxEvents({ recipientRole: 'platform_admin' });
      expect(adminEvents).toHaveLength(1);
      expect(adminEvents[0].title).toBe('Alert 1');
    });

    it('filters unacknowledged only', () => {
      const e1 = inbox('platform_admin', 'Alert 1', 'rec-1', 'high');
      inbox('platform_admin', 'Alert 2', 'rec-2', 'medium');

      acknowledgeInboxEvent(e1.eventId, 'user-1');

      const unacked = getInboxEvents({ recipientRole: 'platform_admin', unacknowledgedOnly: true });
      expect(unacked).toHaveLength(1);
      expect(unacked[0].title).toBe('Alert 2');
    });

    it('filters by priority', () => {
      inbox('platform_admin', 'Low Alert', 'rec-1', 'low');
      inbox('platform_admin', 'Critical Alert', 'rec-2', 'critical');

      const critical = getInboxEvents({ priority: 'critical' });
      expect(critical).toHaveLength(1);
      expect(critical[0].title).toBe('Critical Alert');
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        inbox('platform_admin', `Alert ${i}`, `rec-${i}`, 'low');
      }
      const events = getInboxEvents({ limit: 3 });
      expect(events).toHaveLength(3);
    });
  });

  describe('acknowledgeInboxEvent', () => {
    it('acknowledges an event', () => {
      const event = inbox('platform_admin', 'Test', 'rec-1', 'high');
      const acked = acknowledgeInboxEvent(event.eventId, 'user-1');

      expect(acked?.acknowledged).toBe(true);
      expect(acked?.acknowledgedBy).toBe('user-1');
      expect(acked?.acknowledgedAt).toBeDefined();
    });

    it('returns undefined for non-existent event', () => {
      expect(acknowledgeInboxEvent('nonexistent', 'user-1')).toBeUndefined();
    });
  });

  describe('getInboxEventCount', () => {
    it('returns count of matching events', () => {
      inbox('platform_admin', 'Alert 1', 'rec-1', 'high');
      inbox('platform_admin', 'Alert 2', 'rec-2', 'high');
      inbox('principal_agent', 'Alert 3', 'rec-3', 'medium');

      expect(getInboxEventCount({ recipientRole: 'platform_admin' })).toBe(2);
      expect(getInboxEventCount({})).toBe(3);
    });
  });
});
