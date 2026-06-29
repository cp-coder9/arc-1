// Feature: unified-project-workflow-orchestration, Property 8: Propagation failure degrades safely
//
// Property-based test for `projectStateService.loadProjectState` derived-field
// propagation-failure handling (Task 3.8).
//
// Property 8 (design.md): For any simulated derived-field propagation failure,
// the affected derived value equals the last successfully reconciled value, is
// marked with a stale indicator, and an error indication identifies the source
// record that failed to propagate.
//
// Validates: Requirements 2.3

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import type { ProjectMetadata, ProjectRecord } from '../../lifecycleTypes';
import {
  computeDerivedSources,
  createProjectStateService,
  InMemoryProjectStateRepository,
  type DeriveSourcesFn,
} from '../projectStateService';
import type { AuthorizationContext, DerivedFieldSource } from '../orchestrationTypes';
import { arbId, arbPhase, arbProjectRecord, arbRole, assertProperty } from './generators';

// The five derived passport fields whose provenance Property 8 governs.
const DERIVED_FIELDS: DerivedFieldSource['field'][] = [
  'approvalStatus',
  'documentStatus',
  'financialStatus',
  'currentPhase',
  'riskLevel',
];

/**
 * A valid {@link ProjectMetadata}. Tenant/project ids are generated so the
 * records below can be remapped to share them, guaranteeing an in-tenant,
 * single-project record set.
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
 * Valid project metadata plus a set of records all sharing the metadata's
 * tenantId/projectId, de-duplicated by id.
 */
const arbProjectWithRecords = (): fc.Arbitrary<{
  metadata: ProjectMetadata;
  records: ProjectRecord[];
}> =>
  arbProjectMetadata().chain((metadata) =>
    fc
      .array(arbProjectRecord({ tenantId: metadata.tenantId, projectId: metadata.projectId }), {
        maxLength: 8,
      })
      .map((records) => {
        const seen = new Set<string>();
        const unique = records.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        return { metadata, records: unique };
      }),
  );

/** An in-tenant authorized read context for the given role. */
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

describe('projectStateService.loadProjectState — Property 8 (propagation failure degrades safely)', () => {
  it('retains the last reconciled derived values, marks them stale, and keeps a non-empty source record id on a propagation failure', async () => {
    await assertProperty(
      fc.asyncProperty(
        arbProjectWithRecords(),
        arbId('user'),
        arbRole(),
        async ({ metadata, records }, userId, role) => {
          const nowIso = '2026-06-15T08:30:00.000Z';

          // deriveSources succeeds on the FIRST call (valid, non-stale sources
          // with non-empty source record ids) and fails on every subsequent
          // call, simulating a derived-field propagation failure (R2.3).
          let calls = 0;
          const deriveSources: DeriveSourcesFn = (args) => {
            calls += 1;
            if (calls === 1) {
              return computeDerivedSources(args.records, args.metadata, args.nowIso);
            }
            throw new Error('simulated derived-field propagation failure');
          };

          const repository = new InMemoryProjectStateRepository();
          repository.seedMetadata(metadata);
          for (const record of records) {
            repository.seedRecord(record);
          }
          const service = createProjectStateService({
            repository,
            clock: () => nowIso,
            // A tiny propagation budget keeps any timeout-based path fast; the
            // injected derive throws synchronously regardless.
            propagationTimeoutMs: 25,
            deriveSources,
          });

          const ctx = inTenantContext(metadata, userId, role, nowIso);

          // First load: derivation succeeds — capture the reconciled sources.
          const firstView = await service.loadProjectState(ctx, metadata.projectId);
          expect(firstView.derivedSources).toHaveLength(DERIVED_FIELDS.length);
          for (const source of firstView.derivedSources) {
            expect(source.stale).toBe(false);
            expect(typeof source.sourceRecordId).toBe('string');
            expect(source.sourceRecordId.length).toBeGreaterThan(0);
          }

          // Second load: derivation now fails — the surface must still return a
          // view rather than throw (resilience by default).
          const secondView = await service.loadProjectState(ctx, metadata.projectId);

          // Same set of derived fields, none dropped on degradation.
          expect(secondView.derivedSources).toHaveLength(DERIVED_FIELDS.length);
          const fieldsSeen = secondView.derivedSources.map((s) => s.field).sort();
          expect(fieldsSeen).toEqual([...DERIVED_FIELDS].sort());

          // Each degraded value equals the last successfully reconciled value
          // EXCEPT it is now marked stale, and each still names a non-empty
          // source record that failed to propagate (R2.3).
          for (const first of firstView.derivedSources) {
            const degraded = secondView.derivedSources.find((s) => s.field === first.field);
            expect(degraded).toBeDefined();
            expect(degraded!.stale).toBe(true);
            expect(degraded!.sourceRecordId).toBe(first.sourceRecordId);
            expect(degraded!.sourceRecordId.length).toBeGreaterThan(0);
            expect(degraded!.lastUpdatedSast).toBe(first.lastUpdatedSast);
          }
        },
      ),
    );
  });
});
