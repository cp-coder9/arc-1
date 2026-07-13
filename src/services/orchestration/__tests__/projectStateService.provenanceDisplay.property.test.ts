// Feature: unified-project-workflow-orchestration, Property 7: Derived-value provenance is displayed
//
// Property-based test for `projectStateService.loadProjectState` derived-field
// provenance (Task 3.7).
//
// Property 7 (design.md): For any derived value shown in a dashboard, its
// `DerivedFieldSource` carries a non-empty source record id and a last-updated
// timestamp rendered in SAST (UTC+02:00) to the minute.
//
// Validates: Requirements 2.2

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import type { ProjectMetadata, ProjectRecord } from '../../lifecycleTypes';
import {
  createProjectStateService,
  InMemoryProjectStateRepository,
  toSast,
  computeDerivedSources,
} from '../projectStateService';
import type { AuthorizationContext, DerivedFieldSource } from '../orchestrationTypes';
import { arbId, arbPhase, arbProjectRecord, arbRole, assertProperty } from './generators';

// The five derived passport fields whose provenance Property 7 governs.
const DERIVED_FIELDS: DerivedFieldSource['field'][] = [
  'approvalStatus',
  'documentStatus',
  'financialStatus',
  'currentPhase',
  'riskLevel',
];

// SAST-to-the-minute provenance format: `YYYY-MM-DD HH:mm+02:00` (R2.2).
const SAST_MINUTE_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}\+02:00$/;

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
 * tenantId/projectId. The record count may be zero so the empty-set fallback
 * (`project:${projectId}` source id) is exercised, and de-duplicated by id so
 * the seeded set matches the independently computed set.
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

describe('projectStateService.loadProjectState — Property 7 (derived-value provenance)', () => {
  it('every derived value carries a non-empty source id and a SAST-to-the-minute timestamp', async () => {
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

          // Exactly one provenance entry per derived field — none omitted (R2.2).
          expect(view.derivedSources).toHaveLength(DERIVED_FIELDS.length);
          const fieldsSeen = view.derivedSources.map((s) => s.field).sort();
          expect(fieldsSeen).toEqual([...DERIVED_FIELDS].sort());

          for (const source of view.derivedSources) {
            // (a) Non-empty source record id. Where no concrete record drives a
            // field, the fallback `project:${projectId}` keeps it non-empty.
            expect(typeof source.sourceRecordId).toBe('string');
            expect(source.sourceRecordId.length).toBeGreaterThan(0);

            // (b) Last-updated timestamp rendered in SAST (UTC+02:00) to the minute.
            expect(source.lastUpdatedSast).toMatch(SAST_MINUTE_REGEX);
          }
        },
      ),
    );
  });

  it('falls back to a non-empty project-scoped source id when no records exist', async () => {
    await assertProperty(
      fc.asyncProperty(arbProjectMetadata(), arbId('user'), arbRole(), async (metadata, userId, role) => {
        const nowIso = '2026-06-15T08:30:00.000Z';
        // No records seeded — exercises the fallback source id (R2.2).
        const service = seededService(metadata, [], nowIso);
        const ctx = inTenantContext(metadata, userId, role, nowIso);

        const view = await service.loadProjectState(ctx, metadata.projectId);

        expect(view.records).toHaveLength(0);
        for (const source of view.derivedSources) {
          expect(source.sourceRecordId).toBe(`project:${metadata.projectId}`);
          expect(source.lastUpdatedSast).toMatch(SAST_MINUTE_REGEX);
        }
      }),
    );
  });
});

// ── Direct unit checks for the exported `toSast` renderer (R2.2) ────────────

describe('toSast — SAST (UTC+02:00) minute-precision rendering', () => {
  it('adds two hours to a known UTC instant and ends with +02:00', () => {
    // 2026-06-15T08:30:00Z → 10:30 SAST.
    expect(toSast('2026-06-15T08:30:00.000Z')).toBe('2026-06-15 10:30+02:00');
  });

  it('rolls the date forward when +02:00 crosses midnight', () => {
    // 2026-06-15T23:15:00Z → 2026-06-16 01:15 SAST.
    expect(toSast('2026-06-15T23:15:00.000Z')).toBe('2026-06-16 01:15+02:00');
  });

  it('truncates to the minute (drops seconds)', () => {
    expect(toSast('2026-01-01T00:00:59.999Z')).toBe('2026-01-01 02:00+02:00');
  });

  it('produces a non-empty SAST-format string for an unparseable input', () => {
    expect(toSast('not-a-date')).toMatch(SAST_MINUTE_REGEX);
  });

  it('always renders +02:00 to the minute across arbitrary UTC instants', () => {
    assertProperty(
      fc.property(
        fc.integer({
          min: new Date('2020-01-01T00:00:00.000Z').getTime(),
          max: new Date('2035-12-31T23:59:59.000Z').getTime(),
        }).map((ts) => new Date(ts)),
        (instant) => {
          const rendered = toSast(instant.toISOString());
          expect(rendered).toMatch(SAST_MINUTE_REGEX);

          // The rendered minute equals the UTC instant shifted by +2h.
          const shifted = new Date(instant.getTime() + 2 * 60 * 60 * 1000);
          const expected = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
            shifted.getUTCDate(),
          ).padStart(2, '0')} ${String(shifted.getUTCHours()).padStart(2, '0')}:${String(
            shifted.getUTCMinutes(),
          ).padStart(2, '0')}+02:00`;
          expect(rendered).toBe(expected);
        },
      ),
    );
  });
});

// ── Direct check of computeDerivedSources fallback with no records (R2.2) ────

describe('computeDerivedSources — provenance is always displayable', () => {
  it('uses the non-empty project fallback id when the record set is empty', () => {
    const metadata: ProjectMetadata = {
      tenantId: 'tenant_x',
      projectId: 'proj_x',
      projectName: 'P',
      clientName: 'C',
      municipality: 'M',
      propertyReference: 'R',
      propertyUse: 'U',
      landUseNotes: '',
      currentPhase: 'concept_design',
      leadProfessionalRole: 'architect',
    };
    const sources = computeDerivedSources([], metadata, '2026-06-15T08:30:00.000Z');
    expect(sources).toHaveLength(DERIVED_FIELDS.length);
    for (const source of sources) {
      expect(source.sourceRecordId).toBe('project:proj_x');
      expect(source.lastUpdatedSast).toMatch(SAST_MINUTE_REGEX);
      expect(source.stale).toBe(false);
    }
  });
});
