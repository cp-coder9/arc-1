// Feature: unified-project-workflow-orchestration, Property 2: Writes capture provenance and are readable afterward
//
// Property-based test for `projectStateService.writeRecord` + `loadProjectState` (Task 3.3).
//
// Property 2 (design.md): For any authorised record write, the persisted record
// carries the actor identifier, the writing role, and a parseable ISO-8601 UTC
// timestamp, and a subsequent load of that project returns the written value.
//
// Validates: Requirements 1.2, 1.3

import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import * as auditTrailService from '../../auditTrailService';
import {
  InMemoryProjectStateRepository,
  createProjectStateService,
} from '../projectStateService';
import type { AuthorizationContext, ProjectRecord } from '../orchestrationTypes';
import type { ProjectMetadata } from '../../lifecycleTypes';
import { arbId, arbIsoTimestamp, arbProjectRecord, arbRole, assertProperty } from './generators';

/**
 * A UTC ISO-8601 timestamp carries a `T`/time component and an explicit zone
 * designator — the UTC `Z` or a numeric `±HH:MM` offset — and is a real,
 * parseable instant. `toUtcIso` (the service) emits `…Z` via `toISOString()`.
 */
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isParseableUtcIso(value: string | undefined): boolean {
  if (typeof value !== 'string') return false;
  if (!ISO_8601_UTC.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/**
 * A write scenario: an authorisation context plus a brand-new record whose
 * tenant matches the context (so the write authorises with the default `none`
 * gate) and whose project matches the seeded metadata. `baseVersion` is 0
 * because the record has not yet been persisted.
 */
interface WriteScenario {
  ctx: AuthorizationContext;
  record: ProjectRecord;
}

const arbWriteScenario = (): fc.Arbitrary<WriteScenario> =>
  fc
    .record({
      tenantId: arbId('tenant'),
      projectId: arbId('proj'),
      userId: arbId('user'),
      role: arbRole(),
      now: arbIsoTimestamp(),
    })
    .chain((base) =>
      // Tenant + project matched so the in-tenant write is authorised.
      arbProjectRecord({ tenantId: base.tenantId, projectId: base.projectId }).map((record) => ({
        ctx: { tenantId: base.tenantId, userId: base.userId, role: base.role, now: base.now },
        record,
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

describe('projectStateService — Property 2: writes capture provenance and are readable afterward', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists provenance (actor, role, UTC timestamp) and returns the written value on read-back', async () => {
    const auditSpy = vi.spyOn(auditTrailService, 'audit');

    await assertProperty(
      fc.asyncProperty(arbWriteScenario(), async ({ ctx, record }) => {
        auditSpy.mockClear();

        // Fresh, tenant-scoped repository per run; the record is new (baseVersion 0).
        const repository = new InMemoryProjectStateRepository();
        repository.seedMetadata(metadataFor(record, ctx.role));
        const service = createProjectStateService({ repository });

        const result = await service.writeRecord(ctx, { record, baseVersion: 0 });

        // The authorised write succeeds.
        expect(result.ok).toBe(true);
        if (!result.ok) return; // narrow for the type-checker

        const committed = result.record;

        // Provenance — the write time is persisted on the record as a parseable
        // ISO-8601 UTC timestamp (R1.2).
        expect(isParseableUtcIso(committed.audit.updatedAt)).toBe(true);

        // Provenance — actor identifier and writing role are captured through the
        // audit trail on the committing write (R1.2). Find the commit audit call.
        const commitCall = auditSpy.mock.calls.find(
          ([, action]) => typeof action === 'string' && action.startsWith('write:committed'),
        );
        expect(commitCall).toBeDefined();
        const [auditCtx, commitAction] = commitCall!;
        expect(auditCtx.userId).toBe(ctx.userId); // actor identifier
        expect(auditCtx.actorRole).toBe(ctx.role); // writing role
        expect(commitAction).toContain(`role=${ctx.role}`);

        // Read-back — a subsequent load of the project returns the written value (R1.3).
        const view = await service.loadProjectState(ctx, record.projectId);
        const readBack = view.records.find((r) => r.id === record.id);
        expect(readBack).toBeDefined();
        // The persisted/read-back value equals the committed record exactly:
        // identical fields, status, payload, and linked-reference set.
        expect(readBack).toEqual(committed);
        expect(readBack!.linkedRecordIds).toEqual(record.linkedRecordIds);
        expect(readBack!.payload).toEqual(record.payload);
        expect(readBack!.status).toBe(record.status);
      }),
    );
  });
});
