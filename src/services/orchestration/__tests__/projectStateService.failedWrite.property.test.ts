// Feature: unified-project-workflow-orchestration, Property 3: Failed writes preserve prior state and retain input
//
// Property-based test for `projectStateService.writeRecord` (Task 3.4).
//
// Property 3 (design.md): For any write that fails or times out, the prior
// `ProjectRecord` value is unchanged and the submitted input is retained in the
// result for resubmission.
//
// Validates: Requirements 1.5

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  InMemoryProjectStateRepository,
  createProjectStateService,
  type CompareAndSwapInput,
  type CompareAndSwapResult,
  type ProjectStateRepository,
  type StoredRecordEntry,
} from '../projectStateService';
import type { AuthorizationContext, ProjectRecord } from '../orchestrationTypes';
import type { ProjectMetadata } from '../../lifecycleTypes';
import { arbId, arbIsoTimestamp, arbPayload, arbProjectRecord, arbRole, assertProperty } from './generators';

/**
 * How the injected repository's `compareAndSwap` fails:
 * - `reject`  — the persistence promise rejects (a hard save error);
 * - `timeout` — the persistence promise never resolves, so the service's
 *               `saveTimeoutMs` budget elapses (R1.5 "does not complete within").
 * In both cases the underlying store is never mutated, so the prior value must
 * remain unchanged.
 */
type FailureMode = 'reject' | 'timeout';

/**
 * A `ProjectStateRepository` that delegates all reads to an inner in-memory
 * store but whose `compareAndSwap` always fails (or hangs) without ever
 * touching the store. This simulates R1.5's save-failed / save-timeout paths
 * while letting the test prove the prior record is left untouched.
 */
class FailingWriteRepository implements ProjectStateRepository {
  constructor(
    private readonly inner: InMemoryProjectStateRepository,
    private readonly mode: FailureMode,
  ) {}

  loadMetadata(projectId: string) {
    return this.inner.loadMetadata(projectId);
  }

  listRecords(tenantId: string, projectId: string) {
    return this.inner.listRecords(tenantId, projectId);
  }

  getRecord(tenantId: string, projectId: string, recordId: string) {
    return this.inner.getRecord(tenantId, projectId, recordId);
  }

  compareAndSwap(_input: CompareAndSwapInput): Promise<CompareAndSwapResult> {
    if (this.mode === 'reject') {
      return Promise.reject(new Error('simulated persistence failure'));
    }
    // 'timeout': never resolves — the service races this against saveTimeoutMs.
    return new Promise<CompareAndSwapResult>(() => {
      /* intentionally never settles */
    });
  }
}

/**
 * A failed-write scenario: a prior record already persisted at `seededVersion`,
 * a modified submission against the correct base version, an in-tenant
 * authorisation context, and the failure mode to simulate.
 */
interface FailedWriteScenario {
  ctx: AuthorizationContext;
  priorRecord: ProjectRecord;
  modifiedRecord: ProjectRecord;
  seededVersion: number;
  mode: FailureMode;
}

const arbFailedWriteScenario = (): fc.Arbitrary<FailedWriteScenario> =>
  fc
    .record({
      tenantId: arbId('tenant'),
      projectId: arbId('proj'),
      userId: arbId('user'),
      role: arbRole(),
      now: arbIsoTimestamp(),
      seededVersion: fc.integer({ min: 1, max: 7 }),
      mode: fc.constantFrom<FailureMode>('reject', 'timeout'),
      modifiedTitle: fc.string({ minLength: 1, maxLength: 60 }),
      modifiedPayload: arbPayload(),
    })
    .chain((base) =>
      // Tenant + project matched so the in-tenant write authorises (gate `none`).
      arbProjectRecord({ tenantId: base.tenantId, projectId: base.projectId }).map((priorRecord) => ({
        ctx: { tenantId: base.tenantId, userId: base.userId, role: base.role, now: base.now },
        priorRecord,
        // A genuine modification of the same record (same id/tenant/project) so
        // we can prove the store keeps the prior value, not the submission.
        modifiedRecord: {
          ...priorRecord,
          title: base.modifiedTitle,
          payload: base.modifiedPayload,
          linkedRecordIds: [...priorRecord.linkedRecordIds],
        },
        seededVersion: base.seededVersion,
        mode: base.mode,
      })),
    );

function metadataFor(record: ProjectRecord, leadRole: AuthorizationContext['role']): ProjectMetadata {
  return {
    tenantId: record.tenantId,
    projectId: record.projectId,
    projectName: 'Test Project',
    clientName: 'Test Client',
    municipality: 'Test Municipality',
    propertyReference: 'ERF-001',
    propertyUse: 'residential',
    landUseNotes: '',
    currentPhase: record.phase,
    leadProfessionalRole: leadRole,
  };
}

describe('projectStateService.writeRecord — Property 3: failed writes preserve prior state and retain input', () => {
  it('returns save_failed, retains the submitted input, and leaves the prior record unchanged', async () => {
    await assertProperty(
      fc.asyncProperty(arbFailedWriteScenario(), async (scenario) => {
        const { ctx, priorRecord, modifiedRecord, seededVersion, mode } = scenario;

        // Seed the prior value at a known version into the inner store.
        const inner = new InMemoryProjectStateRepository();
        inner.seedMetadata(metadataFor(priorRecord, ctx.role));
        inner.seedRecord(priorRecord, seededVersion);

        // Snapshot the stored entry so we can prove it is untouched afterwards.
        const before = await inner.getRecord(
          priorRecord.tenantId,
          priorRecord.projectId,
          priorRecord.id,
        );
        expect(before).not.toBeNull();
        const beforeSnapshot: StoredRecordEntry = JSON.parse(JSON.stringify(before));

        // Wrap the store in a repository whose compareAndSwap always fails/hangs.
        const repository = new FailingWriteRepository(inner, mode);
        // Small save budget so the 'timeout' path triggers quickly.
        const service = createProjectStateService({ repository, saveTimeoutMs: 25 });

        const result = await service.writeRecord(ctx, {
          record: modifiedRecord,
          baseVersion: seededVersion,
        });

        // (a) The write reports failure as save_failed (R1.5).
        expect(result.ok).toBe(false);
        if (result.ok) return; // narrow for the type-checker
        expect(result.reason).toBe('save_failed');

        // (b) The submitted input is retained verbatim for resubmission without
        // re-entry — identical fields, status, payload, and linked refs (R1.5).
        expect(result.retainedInput).toEqual(modifiedRecord);
        expect(result.retainedInput.payload).toEqual(modifiedRecord.payload);
        expect(result.retainedInput.status).toBe(modifiedRecord.status);
        expect(result.retainedInput.linkedRecordIds).toEqual(modifiedRecord.linkedRecordIds);

        // (c) The prior `ProjectRecord` value is unchanged — same version, same
        // committed timestamp, same field values; the failed write never
        // committed (R1.5).
        const after = await inner.getRecord(
          priorRecord.tenantId,
          priorRecord.projectId,
          priorRecord.id,
        );
        expect(after).not.toBeNull();
        expect(after!.version).toBe(seededVersion);
        expect(after).toEqual(beforeSnapshot);
        expect(after!.record).toEqual(priorRecord);
      }),
    );
  });
});
