import { describe, expect, it, beforeEach } from 'vitest';
import {
  createInboxEvent,
  getAnalyticsInboxEvents,
  acknowledgeAnalyticsInboxEvent,
  getAnalyticsInboxEventCount,
  resetAnalyticsInboxState,
} from '../analyticsInboxEventAdapter';

describe('analyticsInboxEventAdapter', () => {
  beforeEach(() => {
    resetAnalyticsInboxState();
  });

  describe('createInboxEvent', () => {
    it('creates an inbox event with auto-generated ID', () => {
      const event = createInboxEvent('principal_agent', 'Retention release pending', 'rec-1', 'high');
      expect(event.eventId).toMatch(/^inbox-/);
      expect(event.recipientRole).toBe('principal_agent');
      expect(event.priority).toBe('high');
      expect(event.acknowledged).toBe(false);
    });

    it('accepts optional description and projectId', () => {
      const event = createInboxEvent('contractor', 'Defect liability expiring', 'rec-2', 'medium', {
        description: 'Please review remaining snags',
        projectId: 'project-1',
      });
      expect(event.description).toBe('Please review remaining snags');
      expect(event.projectId).toBe('project-1');
    });
  });

  describe('getAnalyticsInboxEvents', () => {
    it('filters by recipient role', () => {
      createInboxEvent('platform_admin', 'Alert 1', 'rec-1', 'high');
      createInboxEvent('principal_agent', 'Alert 2', 'rec-2', 'medium');

      const adminEvents = getAnalyticsInboxEvents({ recipientRole: 'platform_admin' });
      expect(adminEvents).toHaveLength(1);
      expect(adminEvents[0].title).toBe('Alert 1');
    });

    it('filters unacknowledged only', () => {
      const e1 = createInboxEvent('platform_admin', 'Alert 1', 'rec-1', 'high');
      createInboxEvent('platform_admin', 'Alert 2', 'rec-2', 'medium');

      acknowledgeAnalyticsInboxEvent(e1.eventId, 'user-1');

      const unacked = getAnalyticsInboxEvents({ recipientRole: 'platform_admin', unacknowledgedOnly: true });
      expect(unacked).toHaveLength(1);
      expect(unacked[0].title).toBe('Alert 2');
    });

    it('filters by priority', () => {
      createInboxEvent('platform_admin', 'Low Alert', 'rec-1', 'low');
      createInboxEvent('platform_admin', 'Critical Alert', 'rec-2', 'critical');

      const critical = getAnalyticsInboxEvents({ priority: 'critical' });
      expect(critical).toHaveLength(1);
      expect(critical[0].title).toBe('Critical Alert');
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        createInboxEvent('platform_admin', `Alert ${i}`, `rec-${i}`, 'low');
      }
      const events = getAnalyticsInboxEvents({ limit: 3 });
      expect(events).toHaveLength(3);
    });
  });

  describe('acknowledgeAnalyticsInboxEvent', () => {
    it('acknowledges an event', () => {
      const event = createInboxEvent('platform_admin', 'Test', 'rec-1', 'high');
      const acked = acknowledgeAnalyticsInboxEvent(event.eventId, 'user-1');

      expect(acked?.acknowledged).toBe(true);
      expect(acked?.acknowledgedBy).toBe('user-1');
      expect(acked?.acknowledgedAt).toBeDefined();
    });

    it('returns undefined for non-existent event', () => {
      expect(acknowledgeAnalyticsInboxEvent('nonexistent', 'user-1')).toBeUndefined();
    });
  });

  describe('getAnalyticsInboxEventCount', () => {
    it('returns count of matching events', () => {
      createInboxEvent('platform_admin', 'Alert 1', 'rec-1', 'high');
      createInboxEvent('platform_admin', 'Alert 2', 'rec-2', 'high');
      createInboxEvent('principal_agent', 'Alert 3', 'rec-3', 'medium');

      expect(getAnalyticsInboxEventCount({ recipientRole: 'platform_admin' })).toBe(2);
      expect(getAnalyticsInboxEventCount({})).toBe(3);
    });
  });
});
