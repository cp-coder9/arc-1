// Feature: unified-project-workflow-orchestration, Property 1: Source of truth is single and derived
//
// Property-based test for `projectStateService.loadProjectState` (Task 3.2).
//
// Property 1 (design.md): For any valid set of `ProjectRecord`s for a project,
// the assembled `ProjectStateView` derived fields (approvalStatus,
// documentStatus, financialStatus, currentPhase, riskLevel) each equal the
// value computed by `projectPassportService.buildProjectPassport()` over that
// record set, and each derived field references exactly one source
// `ProjectRecord` id — identical when read from any number of dashboard
// contexts.
//
// Validates: Requirements 1.1, 1.4, 2.1, 2.6

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { buildProjectPassport } from '../../projectPassportService';
import type { ProjectMetadata, ProjectRecord } from '../../lifecycleTypes';
import {
  createProjectStateService,
  InMemoryProjectStateRepository,
} from '../projectStateService';
import type { AuthorizationContext, DerivedFieldSource } from '../orchestrationTypes';
import { arbId, arbPhase, arbProjectRecord, arbRole, assertProperty } from './generators';

// The five derived passport fields whose provenance Property 1 governs.
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
 * tenantId/projectId. Records are de-duplicated by id so the seeded set and the
 * independently computed set are identical (the repository keys records by id).
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

/** Build a service over a freshly seeded in-memory repository with a fixed clock. */
function seededService(metadata: ProjectMetadata, records: ProjectRecord[], nowIso: string) {
  const repository = new InMemoryProjectStateRepository();
  repository.seedMetadata(metadata);
  for (const record of records) {
    repository.seedRecord(record);
  }
  return createProjectStateService({ repository, clock: () => nowIso });
}

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

describe('projectStateService.loadProjectState — Property 1', () => {
  it('derives a single source of truth equal to buildProjectPassport, identical across contexts', async () => {
    await assertProperty(
      fc.asyncProperty(
        arbProjectWithRecords(),
        arbId('user'),
        arbRole(),
        async ({ metadata, records }, userId, role) => {
          const nowIso = '2026-06-15T08:30:00.000Z';
          const service = seededService(metadata, records, nowIso);
          const ctx = inTenantContext(metadata, userId, role, nowIso);

          const view = await service.loadProjectState(ctx, metadata.projectId);

          // (a) The returned passport's derived fields equal an independently
          // computed buildProjectPassport over the same record set (R1.1, R2.1).
          const expected = buildProjectPassport(metadata, records);
          expect(view.passport.approvalStatus).toEqual(expected.approvalStatus);
          expect(view.passport.documentStatus).toEqual(expected.documentStatus);
          expect(view.passport.financialStatus).toEqual(expected.financialStatus);
          expect(view.passport.currentPhase).toEqual(expected.currentPhase);
          expect(view.passport.riskLevel).toEqual(expected.riskLevel);

          // (b) Each derived field references exactly one non-empty source
          // record id — one source per field, no duplicates, none missing (R1.4, R2.1).
          expect(view.derivedSources).toHaveLength(DERIVED_FIELDS.length);
          const fieldsSeen = view.derivedSources.map((s) => s.field).sort();
          expect(fieldsSeen).toEqual([...DERIVED_FIELDS].sort());
          for (const source of view.derivedSources) {
            expect(typeof source.sourceRecordId).toBe('string');
            expect(source.sourceRecordId.length).toBeGreaterThan(0);
          }

          // (c) Reading from multiple distinct dashboard contexts (same
          // tenant/role) yields identical derived values (R1.4, R2.6).
          const secondCtx = inTenantContext(metadata, `${userId}_b`, role, nowIso);
          const thirdCtx = inTenantContext(metadata, `${userId}_c`, role, nowIso);
          const secondView = await service.loadProjectState(secondCtx, metadata.projectId);
          const thirdView = await service.loadProjectState(thirdCtx, metadata.projectId);

          for (const field of DERIVED_FIELDS) {
            expect(secondView.passport[field]).toEqual(view.passport[field]);
            expect(thirdView.passport[field]).toEqual(view.passport[field]);
          }
          expect(secondView.derivedSources).toEqual(view.derivedSources);
          expect(thirdView.derivedSources).toEqual(view.derivedSources);
        },
      ),
    );
  });
});
