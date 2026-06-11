/**
 * Tests for Event Routing Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  routeEvent,
  routeEvents,
  createEventQueue,
  enqueueEvent,
  dequeueNext,
  peekNext,
  moveToDeadLetter,
  requeueFromDeadLetter,
} from '../eventRoutingService';
import type { WorkflowEvent, Priority, ArchitexRole } from '@/types/architexMasterTypes';

function makeEvent(overrides: Partial<WorkflowEvent> = {}): WorkflowEvent {
  return {
    id: 'evt-1',
    type: 'approval_required',
    projectId: 'proj-1',
    title: 'Test Event',
    detail: 'Test detail',
    priority: 'high',
    sourceModule: 'projects',
    assignedRoles: ['architect', 'client'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('eventRoutingService', () => {
  describe('routeEvent', () => {
    it('routes approval_required to architect and client', () => {
      const event = makeEvent({ type: 'approval_required' });
      const route = routeEvent(event, { tenantId: 't1', projectId: 'p1' });

      expect(route.eventId).toBe('evt-1');
      expect(route.targets).toHaveLength(2);
      expect(route.targets.map((t) => 'role' in t && t.role)).toEqual(['architect', 'client']);
      expect(route.priority).toBe('high');
    });

    it('routes risk_detected to architect and platform_admin', () => {
      const event = makeEvent({ type: 'risk_detected' });
      const route = routeEvent(event, { tenantId: 't1', projectId: 'p1' });

      const roles = route.targets.map((t) => 'role' in t && t.role);
      expect(roles).toContain('architect');
      expect(roles).toContain('platform_admin');
    });

    it('routes project_phase_changed to architect, client, platform_admin', () => {
      const event = makeEvent({ type: 'project_phase_changed' });
      const route = routeEvent(event, { tenantId: 't1', projectId: 'p1' });

      const roles = route.targets.map((t) => 'role' in t && t.role);
      expect(roles).toContain('architect');
      expect(roles).toContain('client');
      expect(roles).toContain('platform_admin');
    });

    it('sets higher retry for critical events', () => {
      const event = makeEvent({ type: 'risk_detected', priority: 'critical' });
      const route = routeEvent(event, { tenantId: 't1', projectId: 'p1' });

      expect(route.maxRetries).toBe(5);
    });

    it('falls back to default router for unknown event types', () => {
      const event = makeEvent({ type: 'unknown_type' as any });
      const route = routeEvent(event, { tenantId: 't1', projectId: 'p1' });

      const roles = route.targets.map((t) => 'role' in t && t.role);
      expect(roles).toContain('architect');
      expect(roles).toContain('platform_admin');
    });
  });

  describe('createEventQueue / enqueueEvent / dequeueNext', () => {
    it('creates empty queue', () => {
      const q = createEventQueue();
      expect(q.active).toEqual([]);
      expect(q.deadLetter).toEqual([]);
    });

    it('enqueues events in priority order', () => {
      const q = createEventQueue();
      const critical = routeEvent(makeEvent({ id: 'e1', priority: 'critical' }), { tenantId: 't1', projectId: 'p1' });
      const low = routeEvent(makeEvent({ id: 'e2', priority: 'low' }), { tenantId: 't1', projectId: 'p1' });
      const medium = routeEvent(makeEvent({ id: 'e3', priority: 'medium' }), { tenantId: 't1', projectId: 'p1' });

      enqueueEvent(q, low);
      enqueueEvent(q, critical);
      enqueueEvent(q, medium);

      // Critical should be first
      expect(dequeueNext(q)!.priority).toBe('critical');
      expect(dequeueNext(q)!.priority).toBe('medium');
      expect(dequeueNext(q)!.priority).toBe('low');
    });

    it('peekNext returns without removing', () => {
      const q = createEventQueue();
      const route = routeEvent(makeEvent({ id: 'e1', priority: 'low' }), { tenantId: 't1', projectId: 'p1' });
      enqueueEvent(q, route);

      expect(peekNext(q)!.eventId).toBe('e1');
      expect(q.active).toHaveLength(1);
      expect(dequeueNext(q)!.eventId).toBe('e1');
      expect(q.active).toHaveLength(0);
    });

    it('dequeueNext returns undefined for empty queue', () => {
      const q = createEventQueue();
      expect(dequeueNext(q)).toBeUndefined();
    });
  });

  describe('dead letter queue', () => {
    it('moves failed event to dead letter', () => {
      const q = createEventQueue();
      const route = routeEvent(makeEvent({ id: 'failed-event' }), { tenantId: 't1', projectId: 'p1' });
      enqueueEvent(q, route);

      const next = dequeueNext(q)!;
      moveToDeadLetter(q, next, 'Max retries exceeded');

      expect(q.active).toHaveLength(0);
      expect(q.deadLetter).toHaveLength(1);
      expect(q.deadLetter[0].reason).toBe('Max retries exceeded');
      expect(q.deadLetter[0].eventId).toBe('failed-event');
    });

    it('requeues from dead letter', () => {
      const q = createEventQueue();
      const route = routeEvent(makeEvent({ id: 'retry-event', priority: 'critical' }), { tenantId: 't1', projectId: 'p1' });
      enqueueEvent(q, route);

      const next = dequeueNext(q)!;
      moveToDeadLetter(q, next, 'Temporary failure');

      const requeued = requeueFromDeadLetter(q, 'retry-event');
      expect(requeued).toBeDefined();
      expect(requeued!.retryCount).toBe(1);
      expect(q.deadLetter).toHaveLength(0);
      expect(q.active).toHaveLength(1);
    });

    it('requeue returns undefined for non-existent event', () => {
      const q = createEventQueue();
      expect(requeueFromDeadLetter(q, 'nonexistent')).toBeUndefined();
    });
  });

  describe('routeEvents (batch)', () => {
    it('creates queue from multiple events', () => {
      const events = [
        makeEvent({ id: 'e1', type: 'risk_detected', priority: 'critical' }),
        makeEvent({ id: 'e2', type: 'payment_due', priority: 'medium' }),
      ];

      const queue = routeEvents(events, { tenantId: 't1', projectId: 'p1' });
      expect(queue.active).toHaveLength(2);
      // Critical should be first
      expect(queue.active[0].priority).toBe('critical');
    });
  });
});
