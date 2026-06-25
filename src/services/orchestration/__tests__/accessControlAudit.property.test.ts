// Feature: unified-project-workflow-orchestration, Property 31: Every orchestration action is fully audited
//
// Property 31 (design.md): For any create, update, handoff, phase advancement,
// or denied action, the audit trail records the actor identifier, actor role,
// action type, target record identifier, an outcome of permitted or denied,
// and a timestamp in ISO 8601 format with timezone offset.
//
// Scope: assert that `accessControlService.authorize` writes exactly one audit
// entry for EVERY decision (permitted and denied) whose recoverable contents
// capture the actor id (ctx.userId), actor role (ctx.role), action type, target
// record id, outcome (permitted|denied), and an ISO-8601-with-offset timestamp
// (ctx.now).
//
// Validates: Requirements 8.6

import { describe, expect, it, vi, afterEach } from 'vitest';
import fc from 'fast-check';

import { assertProperty, arbAuthRequest } from './generators';
import * as auditTrailService from '../../auditTrailService';
import { authorize } from '../accessControlService';
import type { AuditRecord } from '../../../types/agentOrchestration';

/**
 * A timestamp is ISO 8601 with a timezone offset when it carries an explicit
 * zone designator — either the UTC `Z` or a numeric `±HH:MM` offset — and is a
 * real, parseable instant.
 */
const ISO_8601_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isIso8601WithOffset(value: string): boolean {
  if (!ISO_8601_WITH_OFFSET.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/** Decode the orchestration action string encoded by accessControlService. */
function decodeAction(encoded: string): {
  prefix: string;
  actionType: string;
  role: string;
  gate: string;
  outcome: string;
} | null {
  // Shape: authorize:<actionType>:role=<role>:gate=<gate>:outcome=<outcome>
  const match = /^authorize:([^:]+):role=([^:]+):gate=([^:]+):outcome=([^:]+)$/.exec(encoded);
  if (!match) return null;
  return { prefix: 'authorize', actionType: match[1], role: match[2], gate: match[3], outcome: match[4] };
}

describe('Property 31: Every orchestration action is fully audited', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records exactly one fully-formed audit entry for every authorization decision', () => {
    // Spy on the audit sink, calling through so the real AuditRecord is produced
    // and we can inspect the persisted contents via the spy's results.
    const auditSpy = vi.spyOn(auditTrailService, 'audit');

    assertProperty(
      fc.property(arbAuthRequest(), ({ ctx, action, target }) => {
        auditSpy.mockClear();

        const result = authorize(ctx, action, target);

        // EVERY decision (permitted and denied) writes exactly one audit entry.
        expect(auditSpy).toHaveBeenCalledTimes(1);

        const record = auditSpy.mock.results[0].value as AuditRecord;
        const [auditCtx, encodedAction, sourceObjectId] = auditSpy.mock.calls[0];

        // Actor identifier — recoverable as the audit record's actorId.
        expect(record.actorId).toBe(ctx.userId);
        expect(auditCtx.userId).toBe(ctx.userId);

        // Action type, actor role, and outcome — recoverable from the encoded
        // action string on the persisted record.
        const decoded = decodeAction(record.action);
        expect(decoded).not.toBeNull();
        expect(decoded!.actionType).toBe(action);
        expect(decoded!.role).toBe(ctx.role);
        expect(decoded!.outcome).toBe(result.outcome);
        expect(['permitted', 'denied']).toContain(decoded!.outcome);

        // Actor role is also carried on the audit context.
        expect(auditCtx.actorRole).toBe(ctx.role);

        // Target record identifier — recoverable as the audit record's
        // sourceObjectId (the record type, or 'project' when none is targeted).
        const expectedTarget = target.recordType ?? 'project';
        expect(record.sourceObjectId).toBe(expectedTarget);
        expect(sourceObjectId).toBe(expectedTarget);

        // Outcome must match what authorize() returned to the caller.
        expect(decoded!.outcome).toBe(result.outcome);

        // Timestamp — ISO 8601 with a timezone offset, equal to ctx.now.
        expect(record.createdAt).toBe(ctx.now);
        expect(isIso8601WithOffset(record.createdAt)).toBe(true);
      }),
    );
  });
});
