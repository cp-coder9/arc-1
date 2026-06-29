// Feature: unified-project-workflow-orchestration, Property 4: Optimistic concurrency rejects stale writes
//
// Property-based test for `projectStateService.writeRecord` (Task 3.5).
//
// Property 4 (design.md): For any pair of writes submitted against the same
// base record version, exactly one succeeds and the other returns a conflict
// error, the rejected write leaves the current value unchanged, and the final
// stored value equals the accepted write.
//
// Validates: Requirements 1.6

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import type { ProjectMetadata, ProjectRecord } from '../../lifecycleTypes';
import {
  createProjectStateService,
  InMemoryProjectStateRepository,
} from '../projectStateService';
import type { AuthorizationContext } from '../orchestrationTypes';
import { arbId, arbPhase, arbProjectRecord, arbRole, assertProperty } from './generators';

/**
 * A valid {@link ProjectMetadata}. Tenant/project ids are generated so the base
 * record can be remapped to share them, guaranteeing an in-tenant, single
 * project record set that an in-tenant role is authorised to write.
 */
const arbProjectMetadata = (): fc.Arbitrary<ProjectMetadata> =>
  fc.record<ProjectMetadata>({
    tenantId: arbId('tenant'),
    projectId: arbId('proj'),
    projectName: fc.string({ minLength: 1, maxLength: 40 }),
    clientName: fc.string({ minLength: 1, maxLength: 40 }),
    municipality: fc.string({ minLength: 1, maxLength: 40 }),
    propertyReference: fc.string({ minLength: 1, maxLength: 20 }),
    propertyUse: fc.string({ minLength: 1, maxLength: 20 }),
    landUseNotes: fc.string({ maxLength: 40 }),
    currentPhase: arbPhase(),
    leadProfessionalRole: arbRole(),
  });

/**
 * Valid metadata plus a single base record sharing the metadata's
 * tenantId/projectId. This base record is seeded at version 1; the two
 * competing writes are derived from it with distinct payloads.
 */
const arbProjectWithBaseRecord = (): fc.Arbitrary<{
  metadata: ProjectMetadata;
  base: ProjectRecord;
}> =>
  arbProjectMetadata().chain((metadata) =>
    arbProjectRecord({ tenantId: metadata.tenantId, projectId: metadata.projectId }).map(
      (base) => ({ metadata, base }),
    ),
  );

/** Build a service over a freshly seeded in-memory repository with a fixed clock. */
function seededService(
  metadata: ProjectMetadata,
  base: ProjectRecord,
  baseVersion: number,
  nowIso: string,
) {
  const repository = new InMemoryProjectStateRepository();
  repository.seedMetadata(metadata);
  repository.seedRecord(base, baseVersion);
  return {
    repository,
    service: createProjectStateService({ repository, clock: () => nowIso }),
  };
}

/** An in-tenant authorized write context for the given role. */
const inTenantContext = (
  metadata: ProjectMetadata,
  userId: string,
  role: AuthorizationContext['role'],
  nowIso: string,
): AuthorizationContext => ({
  tenantId: metadata.tenantId,
  userId,
  role,
  now: nowIso,
});

describe('projectStateService.writeRecord — Property 4', () => {
  it('rejects a stale concurrent write: exactly one succeeds, the conflict leaves the accepted value stored', async () => {
    await assertProperty(
      fc.asyncProperty(
        arbProjectWithBaseRecord(),
        arbId('userA'),
        arbId('userB'),
        arbRole(),
        arbRole(),
        async ({ metadata, base }, userA, userB, roleA, roleB) => {
          const nowIso = '2026-06-15T08:30:00.000Z';
          const baseVersion = 1;
          const { service } = seededService(metadata, base, baseVersion, nowIso);

          // Two differing modified versions of the same base record, each
          // submitted against the same base version (R1.6). Distinct payload
          // markers guarantee the writes differ.
          const recordA: ProjectRecord = {
            ...base,
            payload: { ...base.payload, __write: 'A' },
            linkedRecordIds: [...base.linkedRecordIds],
          };
          const recordB: ProjectRecord = {
            ...base,
            payload: { ...base.payload, __write: 'B' },
            linkedRecordIds: [...base.linkedRecordIds],
          };

          const ctxA = inTenantContext(metadata, userA, roleA, nowIso);
          const ctxB = inTenantContext(metadata, userB, roleB, nowIso);

          // First write against base version 1 succeeds and bumps the version.
          const resultA = await service.writeRecord(ctxA, {
            record: recordA,
            baseVersion,
          });
          expect(resultA.ok).toBe(true);
          if (resultA.ok) {
            expect(resultA.version).toBe(baseVersion + 1);
          }

          // Second write against the SAME (now stale) base version is rejected
          // with a conflict; the current value is reported and the submitted
          // input is retained for resubmission (R1.6).
          const resultB = await service.writeRecord(ctxB, {
            record: recordB,
            baseVersion,
          });
          expect(resultB.ok).toBe(false);
          if (!resultB.ok) {
            expect(resultB.reason).toBe('conflict');
            expect(resultB.currentValue).toBeDefined();
            expect(resultB.retainedInput).toEqual(recordB);
          }

          // Exactly one of the two writes succeeded.
          expect([resultA.ok, resultB.ok].filter(Boolean)).toHaveLength(1);

          // The final stored value equals the accepted (first) write, not the
          // rejected one: the conflict left the current value unchanged (R1.6).
          const view = await service.loadProjectState(ctxA, metadata.projectId);
          const stored = view.records.find((r) => r.id === base.id);
          expect(stored).toBeDefined();
          expect(stored?.payload.__write).toBe('A');
          expect(stored?.payload).toEqual(recordA.payload);
        },
      ),
    );
  });
});
