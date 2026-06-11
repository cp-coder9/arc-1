/**
 * Tests for Inbox Event Adapter — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  createInboxEvent,
  workflowEventToInboxEvents,
  workflowEventsToInboxBatch,
} from '../inboxEventAdapter';
import type { WorkflowEvent, ArchitexRole } from '@/types/architexMasterTypes';

function makeEvent(overrides: Partial<WorkflowEvent> = {}): WorkflowEvent {
  return {
    id: 'evt-1',
    type: 'approval_required',
    projectId: 'proj-1',
    title: 'Missing Approval',
    detail: 'Action required for phase design_coordination',
    priority: 'high',
    sourceModule: 'projects',
    assignedRoles: ['architect', 'client'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('inboxEventAdapter', () => {
  describe('createInboxEvent', () => {
    it('creates a basic inbox event', () => {
      const event = createInboxEvent({
        recipientRole: 'architect',
        title: 'Review Required',
        sourceObjectId: 'rec-1',
        priority: 'high',
      });

      expect(event.id).toMatch(/^inbox-agent-/);
      expect(event.recipientRole).toBe('architect');
      expect(event.title).toBe('Review Required');
      expect(event.priority).toBe('high');
      expect(event.isRead).toBe(false);
      expect(event.requiresAction).toBe(true);
    });

    it('requires action for high and critical priority', () => {
      const high = createInboxEvent({
        recipientRole: 'architect', title: 'H', sourceObjectId: 's1', priority: 'high',
      });
      const critical = createInboxEvent({
        recipientRole: 'architect', title: 'C', sourceObjectId: 's2', priority: 'critical',
      });
      const low = createInboxEvent({
        recipientRole: 'architect', title: 'L', sourceObjectId: 's3', priority: 'low',
      });

      expect(high.requiresAction).toBe(true);
      expect(critical.requiresAction).toBe(true);
      expect(low.requiresAction).toBe(false);
    });

    it('sets optional expiry', () => {
      const event = createInboxEvent({
        recipientRole: 'client', title: 'T', sourceObjectId: 's1', priority: 'medium',
        expiresInDays: 14,
      });

      expect(event.expiresAt).toBeTruthy();
      const expiryTime = new Date(event.expiresAt!).getTime();
      const expectedTime = Date.now() + 14 * 24 * 60 * 60 * 1000;
      expect(Math.abs(expiryTime - expectedTime)).toBeLessThan(60000);
    });

    it('uses detail as fallback for missing detail', () => {
      const event = createInboxEvent({
        recipientRole: 'architect', title: 'No Detail', sourceObjectId: 's1', priority: 'low',
      });
      expect(event.detail).toBe('No Detail');
    });
  });

  describe('workflowEventToInboxEvents', () => {
    it('creates inbox events for each responsible role', () => {
      const wfEvent = makeEvent({ type: 'approval_required' });
      const inboxEvents = workflowEventToInboxEvents(wfEvent);

      expect(inboxEvents).toHaveLength(2);
      const roles = inboxEvents.map((e) => e.recipientRole);
      expect(roles).toContain('architect');
      expect(roles).toContain('client');
    });

    it('routes risk_detected to architect and platform_admin', () => {
      const wfEvent = makeEvent({ type: 'risk_detected' });
      const inboxEvents = workflowEventToInboxEvents(wfEvent);

      const roles = inboxEvents.map((e) => e.recipientRole);
      expect(roles).toContain('architect');
      expect(roles).toContain('platform_admin');
    });

    it('routes payment_due to quantity_surveyor, client, contractor', () => {
      const wfEvent = makeEvent({ type: 'payment_due' });
      const inboxEvents = workflowEventToInboxEvents(wfEvent);

      const roles = inboxEvents.map((e) => e.recipientRole);
      expect(roles).toContain('quantity_surveyor');
      expect(roles).toContain('client');
      expect(roles).toContain('contractor');
    });

    it('includes actionable routes', () => {
      const wfEvent = makeEvent({ type: 'payment_due' });
      const inboxEvents = workflowEventToInboxEvents(wfEvent);

      expect(inboxEvents.every((e) => e.actionableRoute === '/finance/payments')).toBe(true);
    });
  });

  describe('workflowEventsToInboxBatch', () => {
    it('creates batch with summary', () => {
      const events = [
        makeEvent({ id: 'e1', type: 'risk_detected', priority: 'critical' }),
        makeEvent({ id: 'e2', type: 'approval_required', priority: 'high' }),
        makeEvent({ id: 'e3', type: 'project_phase_changed', priority: 'low' }),
      ];

      const batch = workflowEventsToInboxBatch(events);
      expect(batch.summary.total).toBeGreaterThan(0);
      expect(batch.summary.byPriority.critical).toBeGreaterThan(0);
      expect(batch.summary.byRole).toBeTruthy();
      expect(batch.generatedAt).toBeTruthy();
    });

    it('handles empty event array', () => {
      const batch = workflowEventsToInboxBatch([]);
      expect(batch.events).toEqual([]);
      expect(batch.summary.total).toBe(0);
    });
  });
});
