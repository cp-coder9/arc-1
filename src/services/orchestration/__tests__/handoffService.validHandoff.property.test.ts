// Feature: unified-project-workflow-orchestration, Property 10: Valid handoffs record complete obligations and notify the receiver
//
// Property 10: For any valid Cross_Role_Handoff (reason 1..1000 chars,
// receiving role appointed), the recorded obligation captures the originating
// role, receiving role, related record type, and reason, is shown as
// outstanding on both roles' views, and emits exactly one approval_required
// WorkflowEvent assigned to the receiving role.
//
// Validates: Requirements 3.1, 3.3, 3.5.

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

interface Scenario {
  fromRole: ArchitexRole;
  toRole: ArchitexRole;
  // Extra appointed roles so the receiving role is one of several appointees.
  otherAppointed: ArchitexRole[];
  relatedRecordType: ProjectRecordType;
  reason: string;
  tenantId: string;
  projectId: string;
  userId: string;
  now: string;
}

/**
 * A valid handoff scenario: a non-empty reason of 1..1000 characters and a
 * receiving role guaranteed to be among the project's appointed roles. The
 * reason is constrained to have non-whitespace content so it passes the
 * service's trim-based validity check (R3.1).
 */
const arbScenario = (): fc.Arbitrary<Scenario> =>
  fc.record<Scenario>({
    fromRole: arbRole(),
    toRole: arbRole(),
    otherAppointed: fc.uniqueArray(arbRole(), { maxLength: 4 }),
    relatedRecordType: arbRecordType(),
    reason: fc
      .string({ minLength: 1, maxLength: 1000 })
      .filter((s) => s.trim().length >= 1),
    tenantId: arbId('tenant'),
    projectId: arbId('proj'),
    userId: arbId('user'),
    now: arbIsoTimestamp(),
  });

describe('handoffService valid handoff recording and notification (Property 10)', () => {
  it('records a complete obligation, shows it outstanding, and emits one approval_required event to the receiver', async () => {
    await assertProperty(
      fc.asyncProperty(arbScenario(), async (s) => {
        const repo = new InMemoryHandoffRepository();
        const service = createHandoffService({ repository: repo });

        const ctx: AuthorizationContext = {
          tenantId: s.tenantId,
          userId: s.userId,
          role: s.fromRole,
          now: s.now,
        };

        // The receiving role must be appointed to the project (R3.7); include
        // it alongside any other appointed roles and the originating role.
        const appointedRoles = Array.from(
          new Set<ArchitexRole>([s.toRole, s.fromRole, ...s.otherAppointed]),
        );

        const result = await service.initiateHandoff(ctx, {
          projectId: s.projectId,
          tenantId: s.tenantId,
          fromRole: s.fromRole,
          toRole: s.toRole,
          relatedRecordType: s.relatedRecordType,
          reason: s.reason,
          appointedRoles,
        });

        // A valid handoff is accepted.
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const { handoff, event } = result;

        // The recorded obligation captures originating role, receiving role,
        // related record type, and reason (R3.1).
        expect(handoff.fromRole).toBe(s.fromRole);
        expect(handoff.toRole).toBe(s.toRole);
        expect(handoff.relatedRecordType).toBe(s.relatedRecordType);
        expect(handoff.reason).toBe(s.reason);
        expect(handoff.tenantId).toBe(s.tenantId);
        expect(handoff.projectId).toBe(s.projectId);

        // The obligation starts open with a parseable response-by deadline (R3.4).
        expect(handoff.status).toBe('open');
        expect(Number.isNaN(new Date(handoff.responseByDate).getTime())).toBe(false);

        // Exactly one approval_required event, assigned to the receiving role (R3.3).
        expect(event).toBeDefined();
        expect(event?.type).toBe('approval_required');
        expect(event?.assignedRoles).toEqual([s.toRole]);
        expect(event?.projectId).toBe(s.projectId);

        // The obligation is retrievable as outstanding (open) so it shows on
        // both the originating and receiving roles' project views (R3.5). The
        // single open obligation carries both roles, so it is visible to each.
        const open = await repo.listOpen(s.tenantId, s.projectId);
        const stored = open.find((h) => h.id === handoff.id);
        expect(stored).toBeDefined();
        expect(stored?.status).toBe('open');
        expect(stored?.fromRole).toBe(s.fromRole);
        expect(stored?.toRole).toBe(s.toRole);
      }),
    );
  });
});
