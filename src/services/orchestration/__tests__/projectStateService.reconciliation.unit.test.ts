// Feature: unified-project-workflow-orchestration, Task 3.11
//
// Example-based UNIT tests for source-of-truth reconciliation in
// `projectStateService`. These complement the property-based suites with
// concrete positive and negative cases:
//   - POSITIVE: a successful write is read back via loadProjectState as the
//     reconciled value; reconcileConflictingCommits picks the later-timestamp
//     commit as the winner and names the losing record in its error.
//   - NEGATIVE (conflict): a write against a stale baseVersion is rejected with
//     reason 'conflict', retains the submitted input, and leaves the stored
//     value unchanged.
//   - NEGATIVE (save-failed): a repository whose compareAndSwap never settles,
//     combined with a tiny saveTimeoutMs, yields reason 'save_failed', retains
//     the submitted input, and leaves the prior value unchanged.
//
// Validates: Requirements 10.1 (positive + negative reconciliation unit tests).

import { describe, expect, it } from 'vitest';

import {
  InMemoryProjectStateRepository,
  createProjectStateService,
  reconcileConflictingCommits,
  type CompareAndSwapInput,
  type CompareAndSwapResult,
  type ProjectStateRepository,
  type StoredRecordEntry,
} from '../projectStateService';
import type { AuthorizationContext, ProjectRecord } from '../orchestrationTypes';
import type { ProjectMetadata } from '../../lifecycleTypes';

// ── Concrete fixtures ───────────────────────────────────────────────────────

const TENANT = 'tenant-acme';
const PROJECT = 'proj-001';

/** An in-tenant, human (non-AI) architect performing routine read/write. */
const ctx: AuthorizationContext = {
  tenantId: TENANT,
  userId: 'user-architect-1',
  role: 'architect',
  now: '2025-03-01T08:30:00.000Z',
};

/** A concrete `ProjectMetadata` matching the shape in lifecycleTypes.ts. */
function makeMetadata(): ProjectMetadata {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    projectName: 'Acme Office Refurb',
    clientName: 'Acme (Pty) Ltd',
    municipality: 'City of Cape Town',
    propertyReference: 'ERF-12345',
    propertyUse: 'commercial',
    landUseNotes: 'Zoned general business.',
    currentPhase: 'concept_design',
    leadProfessionalRole: 'architect',
  };
}

/** A concrete `ProjectRecord` for the project under test. */
function makeRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'rec-concept-drawings',
    tenantId: TENANT,
    projectId: PROJECT,
    phase: 'concept_design',
    moduleKey: 'documents',
    recordType: 'concept_drawings',
    title: 'Concept Drawings Rev A',
    status: 'pending_review',
    payload: { sheetCount: 4, revision: 'A' },
    approvals: { required: true, pendingRoles: ['client_developer'] },
    audit: { createdBy: 'user-architect-1', createdAt: '2025-02-20T10:00:00.000Z' },
    linkedRecordIds: [],
    ...overrides,
  };
}

// ── POSITIVE: successful write read back via loadProjectState ───────────────

describe('projectStateService reconciliation — positive cases', () => {
  it('reads back the reconciled written value after a successful write', async () => {
    const repository = new InMemoryProjectStateRepository();
    repository.seedMetadata(makeMetadata());
    const prior = makeRecord();
    repository.seedRecord(prior, 1);

    const service = createProjectStateService({ repository });

    // Submit a genuine modification against the current base version (1).
    const updated = makeRecord({
      title: 'Concept Drawings Rev B',
      status: 'approved',
      payload: { sheetCount: 6, revision: 'B' },
    });

    const result = await service.writeRecord(ctx, { record: updated, baseVersion: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return; // narrow for the type-checker
    expect(result.version).toBe(2);
    expect(result.record.title).toBe('Concept Drawings Rev B');

    // A subsequent load returns the reconciled written value (R1.3, R2.1).
    const view = await service.loadProjectState(ctx, PROJECT);
    const readBack = view.records.find((r) => r.id === updated.id);
    expect(readBack).toBeDefined();
    expect(readBack!.title).toBe('Concept Drawings Rev B');
    expect(readBack!.status).toBe('approved');
    expect(readBack!.payload).toEqual({ sheetCount: 6, revision: 'B' });

    // Exactly one source record drives each derived field; provenance present.
    expect(view.derivedSources.length).toBeGreaterThan(0);
    for (const ds of view.derivedSources) {
      expect(ds.sourceRecordId).toBeTruthy();
      expect(ds.lastUpdatedSast).toMatch(/\+02:00$/);
    }
  });

  it('reconcileConflictingCommits picks the later-timestamp commit as the winner', () => {
    const earlier = {
      record: makeRecord({ title: 'Earlier commit', payload: { revision: 'A' } }),
      committedAt: '2025-03-01T09:00:00.000Z',
    };
    const later = {
      record: makeRecord({ title: 'Later commit', payload: { revision: 'B' } }),
      committedAt: '2025-03-01T09:05:00.000Z',
    };

    const reconciliation = reconcileConflictingCommits(ctx, earlier, later);

    // The later commit wins; the earlier commit is the loser (R2.7).
    expect(reconciliation.winner).toBe(later);
    expect(reconciliation.loser).toBe(earlier);
    expect(new Date(reconciliation.winner.committedAt).getTime()).toBeGreaterThan(
      new Date(reconciliation.loser.committedAt).getTime(),
    );

    // The error names the losing record so the rejected participant is informed.
    expect(reconciliation.error).toContain(earlier.record.id);
  });
});

// ── NEGATIVE: stale-version conflict ────────────────────────────────────────

describe('projectStateService reconciliation — negative cases', () => {
  it('rejects a write with a stale baseVersion and leaves the stored value unchanged', async () => {
    const repository = new InMemoryProjectStateRepository();
    repository.seedMetadata(makeMetadata());
    const prior = makeRecord();
    // The stored record is at version 3; the caller will submit base version 2.
    repository.seedRecord(prior, 3);

    const before = await repository.getRecord(TENANT, PROJECT, prior.id);
    const beforeSnapshot: StoredRecordEntry = JSON.parse(JSON.stringify(before));

    const service = createProjectStateService({ repository });

    const stale = makeRecord({ title: 'Stale edit', payload: { revision: 'X' } });
    const result = await service.writeRecord(ctx, { record: stale, baseVersion: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) return; // narrow for the type-checker
    expect(result.reason).toBe('conflict');
    // The submitted input is retained for resubmission without re-entry (R1.6).
    expect(result.retainedInput).toEqual(stale);

    // The stored value is unchanged — same version and same record (R1.6).
    const after = await repository.getRecord(TENANT, PROJECT, prior.id);
    expect(after!.version).toBe(3);
    expect(after).toEqual(beforeSnapshot);
    expect(after!.record).toEqual(prior);
  });

  it('returns save_failed when the repository never settles within saveTimeoutMs', async () => {
    // Inner store holds the prior value; the outer repository delegates reads
    // to it but provides a compareAndSwap that never resolves.
    const inner = new InMemoryProjectStateRepository();
    inner.seedMetadata(makeMetadata());
    const prior = makeRecord();
    inner.seedRecord(prior, 1);

    const before = await inner.getRecord(TENANT, PROJECT, prior.id);
    const beforeSnapshot: StoredRecordEntry = JSON.parse(JSON.stringify(before));

    const hangingRepository: ProjectStateRepository = {
      loadMetadata: (projectId) => inner.loadMetadata(projectId),
      listRecords: (tenantId, projectId) => inner.listRecords(tenantId, projectId),
      getRecord: (tenantId, projectId, recordId) => inner.getRecord(tenantId, projectId, recordId),
      compareAndSwap: (_input: CompareAndSwapInput): Promise<CompareAndSwapResult> =>
        new Promise<CompareAndSwapResult>(() => {
          /* intentionally never settles — exercises the saveTimeoutMs path */
        }),
    };

    // Tiny save budget so the hanging write trips the timeout quickly (R1.5).
    const service = createProjectStateService({
      repository: hangingRepository,
      saveTimeoutMs: 20,
    });

    const submission = makeRecord({ title: 'Will not save', payload: { revision: 'Z' } });
    const result = await service.writeRecord(ctx, { record: submission, baseVersion: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return; // narrow for the type-checker
    expect(result.reason).toBe('save_failed');
    // The submitted input is retained for resubmission (R1.5).
    expect(result.retainedInput).toEqual(submission);

    // The prior value is unchanged — the failed write never committed (R1.5).
    const after = await inner.getRecord(TENANT, PROJECT, prior.id);
    expect(after!.version).toBe(1);
    expect(after).toEqual(beforeSnapshot);
    expect(after!.record).toEqual(prior);
  });
});
