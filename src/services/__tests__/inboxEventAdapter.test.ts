import { describe, expect, it } from 'vitest';
import {
  createInboxEvent,
  inboxEventToWorkflowEvent,
  workflowEventToInboxEvent,
} from '../inboxEventAdapter';
import type { AgentInboxEvent, WorkflowEvent } from '../lifecycleTypes';

describe('inboxEventAdapter', () => {
  it('creates an inbox event with role-based constructor', () => {
    const event = createInboxEvent('admin', 'Test Event', 'obj-1', 'high') as AgentInboxEvent;
    expect(event.recipientRole).toBe('admin');
    expect(event.title).toBe('Test Event');
    expect(event.sourceObjectId).toBe('obj-1');
    expect(event.priority).toBe('high');
    expect(event.eventId).toMatch(/^inbox-/);
  });

  it('creates an inbox event via object constructor returning a promise', async () => {
    const id = await createInboxEvent({
      projectId: 'proj-1',
      recipientRole: 'admin',
      title: 'Test',
      sourceObjectId: 'obj-1',
      priority: 'medium',
    });
    expect(id).toMatch(/^inbox-/);
  });

  it('converts inbox event to workflow event', () => {
    const inboxEvent: AgentInboxEvent = {
      eventId: 'inbox-1',
      recipientRole: 'architect',
      title: 'Review required',
      sourceObjectId: 'doc-1',
      priority: 'high',
    };
    const wf = inboxEventToWorkflowEvent(inboxEvent, 'proj-1');
    expect(wf.id).toBe('inbox-1');
    expect(wf.projectId).toBe('proj-1');
    expect(wf.title).toBe('Review required');
    expect(wf.priority).toBe('high');
    expect(wf.assignedRoles).toContain('architect');
  });

  it('converts workflow event to inbox event', () => {
    const wfEvent: WorkflowEvent = {
      id: 'wf-1',
      type: 'risk_detected',
      projectId: 'proj-1',
      title: 'Risk alert',
      detail: 'Something is wrong',
      priority: 'critical',
      sourceModule: 'projects',
      assignedRoles: ['admin'],
      createdAt: new Date().toISOString(),
    };
    const inbox = workflowEventToInboxEvent(wfEvent);
    expect(inbox.eventId).toBe('wf-1');
    expect(inbox.title).toBe('Risk alert');
    expect(inbox.priority).toBe('critical');
    expect(inbox.recipientRole).toBe('admin');
  });
});
