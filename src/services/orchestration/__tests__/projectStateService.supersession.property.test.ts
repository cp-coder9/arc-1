// Feature: unified-project-workflow-orchestration, Property 9: Supersession presents only the current revision
//
// Property-based test for `projectStateService.resolveActive` (Task 3.9).
//
// Property 9 (design.md): For any `ProjectRecord` superseded by a newer
// revision, the prior record's status becomes `superseded` and is retained
// immutably, and resolving that record returns the current superseding record
// together with the superseded record's identifier.
//
// Validates: Requirements 2.4, 2.5

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { resolveActive } from '../projectStateService';
import type { ProjectRecord, RecordStatus } from '../orchestrationTypes';
import { arbId, arbProjectRecord, assertProperty } from './generators';

/** Live (non-superseded) statuses a current revision may carry. */
const LIVE_STATUSES: RecordStatus[] = [
  'draft',
  'pending_review',
  'approved',
  'issued',
  'rejected',
  'missing',
];

const arbLiveStatus = (): fc.Arbitrary<RecordStatus> => fc.constantFrom(...LIVE_STATUSES);

/**
 * A supersession scenario: an `original` record (status `superseded`) and a
 * `newer` live revision that supersedes it. Both share the same tenant and
 * project; the newer record links back to the original via
 * `audit.supersedesRecordId`. Distinct id prefixes guarantee the two records
 * never collide.
 */
interface SupersessionScenario {
  original: ProjectRecord;
  newer: ProjectRecord;
  originalId: string;
  newerId: string;
}

const arbSupersessionScenario = (): fc.Arbitrary<SupersessionScenario> =>
  fc
    .record({
      tenantId: arbId('tenant'),
      projectId: arbId('proj'),
      originalId: arbId('orig'),
      newerId: arbId('super'),
      originalBase: arbProjectRecord(),
      newerBase: arbProjectRecord(),
      newerStatus: arbLiveStatus(),
    })
    .map((s) => {
      const original: ProjectRecord = {
        ...s.originalBase,
        id: s.originalId,
        tenantId: s.tenantId,
        projectId: s.projectId,
        status: 'superseded',
      };
      const newer: ProjectRecord = {
        ...s.newerBase,
        id: s.newerId,
        tenantId: s.tenantId,
        projectId: s.projectId,
        status: s.newerStatus,
        audit: { ...s.newerBase.audit, supersedesRecordId: s.originalId },
      };
      return { original, newer, originalId: s.originalId, newerId: s.newerId };
    });

describe('projectStateService — Property 9: supersession presents only the current revision', () => {
  it('resolves a superseded record forward to the current revision and reports the superseded id', () => {
    assertProperty(
      fc.property(arbSupersessionScenario(), ({ original, newer, originalId, newerId }) => {
        // The prior record is retained with status `superseded` (R2.4).
        expect(original.status).toBe('superseded');

        // Snapshot the original to prove it is not mutated by resolution.
        const snapshot = structuredClone(original);

        const resolution = resolveActive([original, newer], originalId);

        // Resolving the superseded record returns the current superseding
        // record together with the superseded record's identifier (R2.5).
        expect(resolution.record.id).toBe(newerId);
        expect(resolution.record).toBe(newer);
        expect(resolution.supersededId).toBe(originalId);
        expect(resolution.record.status).not.toBe('superseded');

        // The superseded record is retained immutably — resolution does not
        // mutate it (R2.4).
        expect(original).toEqual(snapshot);
      }),
    );
  });

  it('resolves a live record to itself with no superseded identifier', () => {
    assertProperty(
      fc.property(
        fc.record({ base: arbProjectRecord(), status: arbLiveStatus() }),
        ({ base, status }) => {
          const live: ProjectRecord = { ...base, status };
          const snapshot = structuredClone(live);

          const resolution = resolveActive([live], live.id);

          expect(resolution.record).toBe(live);
          expect(resolution.supersededId).toBeUndefined();
          expect(live).toEqual(snapshot);
        },
      ),
    );
  });
});
