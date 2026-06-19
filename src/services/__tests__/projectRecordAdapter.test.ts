import { describe, expect, it } from 'vitest';
import {
  toProjectRecord,
  createProjectRecord,
  projectRecordsFromDocuments,
} from '../projectRecordAdapter';
import type { BaseContext, WorkflowRecord } from '../../types/agentOrchestration';

const ctx: BaseContext = { tenantId: 'tenant-1', projectId: 'proj-1', userId: 'user-1', actorRole: 'admin', now: '2026-06-10T12:00:00.000Z' };

describe('projectRecordAdapter', () => {
  it('creates project record with correct envelope', () => {
    const wfRecord: WorkflowRecord = {
      id: 'wf-1',
      type: 'audit_entry',
      title: 'Test Audit',
      status: 'active',
      payload: { note: 'test' },
      blockers: [],
      approvalsRequired: [],
    };
    const record = toProjectRecord(ctx, wfRecord);
    expect(record.tenantId).toBe('tenant-1');
    expect(record.projectId).toBe('proj-1');
    expect(record.recordType).toBe('audit_entry');
    expect(record.title).toBe('Test Audit');
    expect(record.status).toBe('active');
    expect(record.payload).toMatchObject({ id: 'wf-1', type: 'audit_entry', payload: { note: 'test' } });
    expect(record.linkedRecordIds).toEqual([]);
    expect(record.audit.createdByUserId).toBe('user-1');
  });

  it('supports linked record IDs', () => {
    const wfRecord: WorkflowRecord = {
      id: 'wf-2',
      type: 'compliance_risk',
      title: 'Linked Test',
      status: 'high',
      payload: {},
      blockers: [],
      approvalsRequired: [],
    };
    const record = toProjectRecord(ctx, wfRecord, ['pr-1', 'pr-2']);
    expect(record.linkedRecordIds).toEqual(['pr-1', 'pr-2']);
  });

  it('creates a project record via async factory', async () => {
    const id = await createProjectRecord({
      projectId: 'proj-1',
      tenantId: 'tenant-1',
      phase: 'design_coordination',
      recordType: 'document',
      title: 'Test Record',
      status: 'active',
      payload: {},
      linkedRecordIds: [],
      createdBy: 'user-1',
    });
    expect(id).toMatch(/^record-/);
  });

  it('maps documents to project records', () => {
    const records = projectRecordsFromDocuments([], []);
    expect(records.length).toBe(2);
    expect(records[0].recordType).toBe('document');
    expect(records[1].recordType).toBe('drawing_revision');
  });
});
