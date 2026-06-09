/**
 * Tests for Project Record Adapter — Pack 14
 */
import { describe, expect, it } from 'vitest';
import { toProjectRecord, toProjectRecords } from '../projectRecordAdapter';
import type { AgentWorkflowRecord, AdapterContext } from '../projectRecordAdapter';

const ctx: AdapterContext = {
  tenantId: 't1',
  projectId: 'p1',
  phase: 'brief_feasibility',
  userId: 'u1',
  actorRole: 'architect',
  now: '2026-06-10T10:00:00.000Z',
};

function makeRecord(overrides: Partial<AgentWorkflowRecord> = {}): AgentWorkflowRecord {
  return {
    id: 'wf-1',
    type: 'agentIdentity',
    title: 'Test Record',
    status: 'active',
    payload: { key: 'val' },
    blockers: [],
    approvalsRequired: [],
    ...overrides,
  };
}

describe('projectRecordAdapter', () => {
  describe('toProjectRecord', () => {
    it('converts workflow record to project record', () => {
      const record = makeRecord();
      const pr = toProjectRecord(ctx, record);

      expect(pr.tenantId).toBe('t1');
      expect(pr.projectId).toBe('p1');
      expect(pr.phase).toBe('brief_feasibility');
      expect(pr.recordType).toBe('practice_record');
      expect(pr.title).toBe('Test Record');
      expect(pr.payload).toEqual(record);
      expect(pr.audit.createdByUserId).toBe('u1');
      expect(pr.audit.source).toBe('agent');
    });

    it('links to provided record IDs', () => {
      const pr = toProjectRecord(ctx, makeRecord(), ['linked-1', 'linked-2']);
      expect(pr.linkedRecordIds).toEqual(['linked-1', 'linked-2']);
    });

    it('generates unique IDs for each record', () => {
      const pr1 = toProjectRecord(ctx, makeRecord({ id: 'wf-1' }));
      const pr2 = toProjectRecord(ctx, makeRecord({ id: 'wf-2' }));

      expect(pr1.id).not.toBe(pr2.id);
      expect(pr1.id).toContain('project-record-agent');
    });

    it('maps agent types to project record types', () => {
      const riskRecord = makeRecord({ type: 'agentMonitoring' });
      const pr = toProjectRecord(ctx, riskRecord);
      expect(pr.recordType).toBe('risk_alert');
    });

    it('resolves approval status from record status', () => {
      const blockedRecord = makeRecord({ status: 'blocked', approvalsRequired: ['architect'] });
      const pr = toProjectRecord(ctx, blockedRecord);

      expect(pr.approval.status).toBe('pending_review');
      expect(pr.approval.requiredApproverRoles).toEqual(['architect']);
    });

    it('maps active status to approved', () => {
      const record = makeRecord({ status: 'active' });
      const pr = toProjectRecord(ctx, record);
      expect(pr.approval.status).toBe('approved');
    });

    it('filters invalid approval roles', () => {
      const record = makeRecord({
        status: 'blocked',
        approvalsRequired: ['architect', 'not_a_role', 'client'],
      });
      const pr = toProjectRecord(ctx, record);

      expect(pr.approval.requiredApproverRoles).toContain('architect');
      expect(pr.approval.requiredApproverRoles).toContain('client');
      expect(pr.approval.requiredApproverRoles).not.toContain('not_a_role');
    });
  });

  describe('toProjectRecords (batch)', () => {
    it('converts multiple records with sequential linking', () => {
      const records = [
        makeRecord({ id: 'wf-a' }),
        makeRecord({ id: 'wf-b' }),
        makeRecord({ id: 'wf-c' }),
      ];

      const prs = toProjectRecords(ctx, records);
      expect(prs).toHaveLength(3);
      // First record has no links
      expect(prs[0].linkedRecordIds).toEqual([]);
      // Second links to first
      expect(prs[1].linkedRecordIds).toEqual(['wf-a']);
      // Third links to second
      expect(prs[2].linkedRecordIds).toEqual(['wf-b']);
    });

    it('handles empty array', () => {
      const prs = toProjectRecords(ctx, []);
      expect(prs).toEqual([]);
    });
  });
});
