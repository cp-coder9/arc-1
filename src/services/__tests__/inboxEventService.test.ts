/**
 * Unit tests for inboxEventService (Pack 2)
 * Tests workflow event generation, event type mapping, role assignment.
 */
import { describe, expect, it } from 'vitest';
import {
  workflowEventsFromProjectState,
  generateMissingApprovalEvent,
} from '../masterExpansion/inboxEventService';
import type { ProjectMetadata, ProjectRecord } from '@/types/architexMasterTypes';

function makeRecord(
  overrides: Partial<ProjectRecord> & { id: string },
): ProjectRecord {
  return {
    tenantId: 't1',
    projectId: 'p1',
    phase: 'construction_execution',
    moduleKey: 'site_execution',
    recordType: 'site_diary',
    title: 'Test Record',
    status: 'draft',
    payload: {},
    approval: {
      status: 'draft',
      requiredApproverRoles: [],
    },
    audit: {
      createdByUserId: 'u1',
      createdAt: '2026-06-09T00:00:00Z',
      source: 'user',
    },
    linkedRecordIds: [],
    ...overrides,
  };
}

const metadata: ProjectMetadata = {
  tenantId: 't1',
  projectId: 'p1',
  projectName: 'Test Project',
  clientName: 'Test Client',
  municipality: 'City of Cape Town',
  propertyReference: 'Erf 5678',
  propertyUse: 'Commercial',
  landUseNotes: 'Standard zoning',
  currentPhase: 'construction_execution',
  leadProfessionalRole: 'architect',
};

describe('workflowEventsFromProjectState', () => {
  it('generates events from project state', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'site_diary',
        phase: 'construction_execution',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
    ];
    const events = workflowEventsFromProjectState(metadata, records);
    expect(events.length).toBeGreaterThan(0);
  });

  it('each event has required fields', () => {
    const records = [makeRecord({ id: 'r1' })];
    const events = workflowEventsFromProjectState(metadata, records);
    for (const evt of events) {
      expect(evt.id).toBeTruthy();
      expect(evt.projectId).toBe('p1');
      expect(evt.type).toBeTruthy();
      expect(evt.title).toBeTruthy();
      expect(evt.detail).toBeTruthy();
      expect(evt.priority).toBeTruthy();
      expect(evt.sourceModule).toBeTruthy();
      expect(Array.isArray(evt.assignedRoles)).toBe(true);
      expect(evt.createdAt).toBeTruthy();
    }
  });

  it('generates critical events for construction without approval', () => {
    const events = workflowEventsFromProjectState(metadata, []);
    const criticalEvents = events.filter((e) => e.priority === 'critical');
    expect(criticalEvents.length).toBeGreaterThan(0);
  });

  it('maps payment risks to finance source module', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'payment_certificate',
        phase: 'payments_commercial_control',
        approval: {
          status: 'pending_review',
          requiredApproverRoles: ['quantity_surveyor'],
        },
      }),
    ];
    const metadata2: ProjectMetadata = {
      ...metadata,
      currentPhase: 'payments_commercial_control',
    };
    const events = workflowEventsFromProjectState(metadata2, records);
    const paymentEvents = events.filter((e) => e.sourceModule === 'finance');
    expect(paymentEvents.length).toBeGreaterThan(0);
  });

  it('generates blocker events when phase cannot advance', () => {
    const metadata2: ProjectMetadata = { ...metadata, currentPhase: 'closeout' };
    const events = workflowEventsFromProjectState(metadata2, []);
    // closeout without records should generate blocker events
    const blockerEvents = events.filter((e) =>
      e.title.toLowerCase().includes('blocker'),
    );
    expect(blockerEvents.length).toBeGreaterThan(0);
  });

  it('emits unique event IDs', () => {
    const events = workflowEventsFromProjectState(metadata, []);
    const ids = events.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('assigns roles from risk findings to events', () => {
    const events = workflowEventsFromProjectState(metadata, []);
    const constructionEvent = events.find((e) =>
      e.title.toLowerCase().includes('construction'),
    );
    if (constructionEvent) {
      expect(constructionEvent.assignedRoles.length).toBeGreaterThan(0);
    }
  });
});

describe('generateMissingApprovalEvent', () => {
  it('generates an approval event with correct structure', () => {
    const event = generateMissingApprovalEvent('p1', 'municipal_submission_item', [
      'architect',
      'client',
    ]);

    expect(event.type).toBe('approval_required');
    expect(event.priority).toBe('high');
    expect(event.sourceModule).toBe('projects');
    expect(event.projectId).toBe('p1');
    expect(event.assignedRoles).toContain('architect');
    expect(event.assignedRoles).toContain('client');
  });
});
