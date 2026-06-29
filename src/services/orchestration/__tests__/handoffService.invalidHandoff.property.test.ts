// Feature: unified-project-workflow-orchestration, Property 11: Invalid handoffs are rejected without side effects
//
// Property 11: For any handoff whose reason is missing/empty/whitespace-only or
// exceeds 1000 characters, or whose receiving role is not appointed to the
// project, the handoff is rejected, no tracked obligation is created, and an
// error identifies the cause (reason limit -> 'invalid_reason'; receiving role
// not appointed -> 'role_not_appointed'). The service validates the reason
// before the receiving-role appointment, so the role-not-appointed scenario
// always supplies a valid reason.
//
// Validates: Requirements 3.2, 3.7.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createHandoffService,
  InMemoryHandoffRepository,
} from '../handoffService';
import type {
  ArchitexRole,
  AuthorizationContext,
  ProjectRecordType,
} from '../orchestrationTypes';
import { arbId, arbIsoTimestamp, arbRecordType, arbRole, assertProperty } from './generators';

// The full role pool (mirrors the orchestration generators' ARCHITEX_ROLES) so
// we can construct appointed-role sets that deliberately exclude the receiver.
const ALL_ROLES: ArchitexRole[] = [
  'client_developer',
  'architect',
  'engineer',
  'quantity_surveyor',
  'contractor',
  'supplier',
  'candidate_professional',
  'admin',
  'platform_admin',
  'site_manager',
];

// ── Adversarial generator 1: invalid reason (toRole IS appointed) ───────────
//
// An empty string, a whitespace-only string, or a string longer than the
// 1000-character limit. The receiving role is correctly appointed so the only
// rejection cause is the reason.
const arbInvalidReason = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant(''),
    fc.stringMatching(/^[ \t\n\r]{1,12}$/), // whitespace-only
    fc.string({ minLength: 1001, maxLength: 1100 }), // over the 1000-char limit
  );

interface InvalidReasonScenario {
  reason: string;
  fromRole: ArchitexRole;
  toRole: ArchitexRole;
  recordType: ProjectRecordType;
  tenantId: string;
  projectId: string;
  userId: string;
  now: string;
}

const arbInvalidReasonScenario = (): fc.Arbitrary<InvalidReasonScenario> =>
  fc.record<InvalidReasonScenario>({
    reason: arbInvalidReason(),
    fromRole: arbRole(),
    toRole: arbRole(),
    recordType: arbRecordType(),
    tenantId: arbId('tenant'),
    projectId: arbId('proj'),
    userId: arbId('user'),
    now: arbIsoTimestamp(),
  });

// ── Adversarial generator 2: role not appointed (reason IS valid) ───────────
//
// A valid reason (1..1000 chars), but the receiving role is excluded from the
// appointed-role set, so the only rejection cause is role-not-appointed.
interface UnappointedScenario {
  reason: string;
  fromRole: ArchitexRole;
  toRole: ArchitexRole;
  appointedRoles: ArchitexRole[];
  recordType: ProjectRecordType;
  tenantId: string;
  projectId: string;
  userId: string;
  now: string;
}

const arbUnappointedScenario = (): fc.Arbitrary<UnappointedScenario> =>
  fc.constantFrom(...ALL_ROLES).chain((toRole) => {
    const others = ALL_ROLES.filter((r) => r !== toRole);
    return fc.record<UnappointedScenario>({
      // Valid reason: 1..1000 chars with at least one non-whitespace char.
      reason: fc
        .string({ minLength: 1, maxLength: 200 })
        .map((s) => `handoff ${s}`.slice(0, 1000)),
      fromRole: arbRole(),
      toRole: fc.constant(toRole),
      // Appointed roles drawn only from the others, so toRole is never present.
      appointedRoles: fc.uniqueArray(fc.constantFrom(...others), {
        minLength: 1,
        maxLength: others.length,
      }),
      recordType: arbRecordType(),
      tenantId: arbId('tenant'),
      projectId: arbId('proj'),
      userId: arbId('user'),
      now: arbIsoTimestamp(),
    });
  });

describe('handoffService invalid handoff rejection (Property 11)', () => {
  it('rejects an invalid reason with no obligation or event (invalid_reason)', async () => {
    await assertProperty(
      fc.asyncProperty(arbInvalidReasonScenario(), async (s) => {
        const repo = new InMemoryHandoffRepository();
        const service = createHandoffService({ repository: repo });

        const ctx: AuthorizationContext = {
          tenantId: s.tenantId,
          userId: s.userId,
          role: s.fromRole,
          now: s.now,
        };

        const result = await service.initiateHandoff(ctx, {
          projectId: s.projectId,
          tenantId: s.tenantId,
          fromRole: s.fromRole,
          toRole: s.toRole,
          relatedRecordType: s.recordType,
          reason: s.reason,
          // Receiving role correctly appointed, so reason is the sole cause.
          appointedRoles: [s.toRole, s.fromRole],
        });

        // Rejected with the reason-specific cause and a non-empty error.
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('invalid_reason');
        expect(result.error.length).toBeGreaterThan(0);

        // No side effects: no event surfaced, no obligation persisted.
        const open = await repo.listOpen(s.tenantId, s.projectId);
        expect(open).toEqual([]);
      }),
    );
  });

  it('rejects an unappointed receiving role with no obligation or event (role_not_appointed)', async () => {
    await assertProperty(
      fc.asyncProperty(arbUnappointedScenario(), async (s) => {
        const repo = new InMemoryHandoffRepository();
        const service = createHandoffService({ repository: repo });

        const ctx: AuthorizationContext = {
          tenantId: s.tenantId,
          userId: s.userId,
          role: s.fromRole,
          now: s.now,
        };

        const result = await service.initiateHandoff(ctx, {
          projectId: s.projectId,
          tenantId: s.tenantId,
          fromRole: s.fromRole,
          toRole: s.toRole,
          relatedRecordType: s.recordType,
          reason: s.reason, // valid reason, so the cause is the unappointed role
          appointedRoles: s.appointedRoles,
        });

        // Rejected with the role-specific cause and a non-empty error.
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('role_not_appointed');
        expect(result.error.length).toBeGreaterThan(0);

        // No side effects: no event surfaced, no obligation persisted.
        const open = await repo.listOpen(s.tenantId, s.projectId);
        expect(open).toEqual([]);
      }),
    );
  });
});
