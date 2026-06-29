// Feature: unified-project-workflow-orchestration, Property 5: Conflicting commits resolve by latest timestamp with audit retention
//
// Property-based test for `projectStateService.reconcileConflictingCommits` (Task 3.6).
//
// Property 5 (design.md): For any two conflicting commits to the same field
// that race past version checking, the reconciled value equals the commit with
// the later timestamp, the rejected commit is retained in the audit trail, and
// the losing participant receives an error identifying the affected record.
//
// Validates: Requirements 2.7

import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import * as auditTrailService from '../../auditTrailService';
import { reconcileConflictingCommits } from '../projectStateService';
import type { CommitCandidate } from '../projectStateService';
import type { AuthorizationContext, ProjectRecord } from '../orchestrationTypes';
import { arbId, arbIsoTimestamp, arbProjectRecord, arbRole, assertProperty } from './generators';

/**
 * A conflict scenario: an authorisation context plus two commit candidates that
 * race past version checking for the SAME record (identical id, project, and
 * tenant). The two commits carry strictly distinct timestamps — one earlier and
 * one later — and `aIsLater` records which candidate (`a` or `b`) holds the
 * later commit so the expected winner is known.
 */
interface ConflictScenario {
  ctx: AuthorizationContext;
  a: CommitCandidate;
  b: CommitCandidate;
  aIsLater: boolean;
}

/** Build a candidate from a record, pinning the shared id/project/tenant. */
function pin(
  record: ProjectRecord,
  ids: { recordId: string; projectId: string; tenantId: string },
  committedAt: string,
): CommitCandidate {
  return {
    record: { ...record, id: ids.recordId, projectId: ids.projectId, tenantId: ids.tenantId },
    committedAt,
  };
}

const arbConflictScenario = (): fc.Arbitrary<ConflictScenario> =>
  fc
    .record({
      tenantId: arbId('tenant'),
      projectId: arbId('proj'),
      recordId: arbId('rec'),
      userId: arbId('user'),
      role: arbRole(),
      now: arbIsoTimestamp(),
      // Distinct payloads/fields for the two racing commits.
      recordA: arbProjectRecord(),
      recordB: arbProjectRecord(),
      // A base instant plus a strictly-positive offset guarantees two distinct
      // timestamps (one earlier, one strictly later).
      base: fc.date({
        min: new Date('2020-01-01T00:00:00.000Z'),
        max: new Date('2035-01-01T00:00:00.000Z'),
        noInvalidDate: true,
      }),
      offsetMs: fc.integer({ min: 1, max: 5 * 365 * 24 * 60 * 60 * 1000 }),
      aIsLater: fc.boolean(),
    })
    .map((s) => {
      const ids = { recordId: s.recordId, projectId: s.projectId, tenantId: s.tenantId };
      const earlier = s.base.toISOString();
      const later = new Date(s.base.getTime() + s.offsetMs).toISOString();
      const a = pin(s.recordA, ids, s.aIsLater ? later : earlier);
      const b = pin(s.recordB, ids, s.aIsLater ? earlier : later);
      return {
        ctx: { tenantId: s.tenantId, userId: s.userId, role: s.role, now: s.now },
        a,
        b,
        aIsLater: s.aIsLater,
      };
    });

describe('projectStateService — Property 5: conflicting commits resolve by latest timestamp with audit retention', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reconciles to the later-timestamp commit, retains the rejected commit in the audit trail, and errors naming the affected record', () => {
    const auditSpy = vi.spyOn(auditTrailService, 'audit');

    assertProperty(
      fc.property(arbConflictScenario(), ({ ctx, a, b, aIsLater }) => {
        auditSpy.mockClear();

        const result = reconcileConflictingCommits(ctx, a, b);

        const expectedWinner = aIsLater ? a : b;
        const expectedLoser = aIsLater ? b : a;

        // Reconciled value equals the commit with the later timestamp (R2.7).
        expect(result.winner).toBe(expectedWinner);
        expect(result.loser).toBe(expectedLoser);
        expect(new Date(result.winner.committedAt).getTime()).toBeGreaterThan(
          new Date(result.loser.committedAt).getTime(),
        );

        // The losing participant receives an error identifying the affected
        // record (R2.7).
        expect(result.error).toContain(expectedLoser.record.id);

        // The rejected (losing) commit is retained in the audit trail: exactly
        // one audit entry is written against the loser's record id (R2.7).
        expect(auditSpy).toHaveBeenCalledTimes(1);
        const [auditCtx, action, sourceObjectId] = auditSpy.mock.calls[0];
        expect(sourceObjectId).toBe(expectedLoser.record.id);
        expect(action).toContain('reconcile:rejected');
        expect(auditCtx.userId).toBe(ctx.userId);
        expect(auditCtx.actorRole).toBe(ctx.role);
        expect(auditCtx.projectId).toBe(expectedLoser.record.projectId);
      }),
    );
  });

  it('prefers `a` on an exact timestamp tie and retains the rejected commit in the audit trail', () => {
    const auditSpy = vi.spyOn(auditTrailService, 'audit');

    assertProperty(
      fc.property(
        fc.record({
          tenantId: arbId('tenant'),
          projectId: arbId('proj'),
          recordId: arbId('rec'),
          userId: arbId('user'),
          role: arbRole(),
          now: arbIsoTimestamp(),
          recordA: arbProjectRecord(),
          recordB: arbProjectRecord(),
          committedAt: arbIsoTimestamp(),
        }),
        (s) => {
          auditSpy.mockClear();
          const ids = { recordId: s.recordId, projectId: s.projectId, tenantId: s.tenantId };
          // Identical commit timestamps — an exact tie.
          const a = pin(s.recordA, ids, s.committedAt);
          const b = pin(s.recordB, ids, s.committedAt);
          const ctx: AuthorizationContext = {
            tenantId: s.tenantId,
            userId: s.userId,
            role: s.role,
            now: s.now,
          };

          const result = reconcileConflictingCommits(ctx, a, b);

          // On an exact timestamp tie, `a` is preferred as the winner.
          expect(result.winner).toBe(a);
          expect(result.loser).toBe(b);

          // The rejected commit (`b`) is retained in the audit trail, and the
          // error names the affected record id.
          expect(result.error).toContain(b.record.id);
          expect(auditSpy).toHaveBeenCalledTimes(1);
          const [, , sourceObjectId] = auditSpy.mock.calls[0];
          expect(sourceObjectId).toBe(b.record.id);
        },
      ),
    );
  });
});
