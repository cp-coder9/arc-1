// Feature: unified-project-workflow-orchestration, Property 13: Gated handoff steps require the qualified receiving role
//
// Property 13: For any handed-off step requiring a HumanGate of
// professional_certification, signature, or payment_release, only the
// qualified receiving role is authorised to satisfy the gate; the AI identity
// and an unqualified receiving role are denied, and a denied resolution leaves
// the obligation unresolved.
//
// Validates: Requirements 3.8, 6.6.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createHandoffService,
  InMemoryHandoffRepository,
} from '../handoffService';
import {
  QUALIFIED_ROLES_BY_GATE,
  type ArchitexRole,
  type AuthorizationContext,
  type HumanGate,
  type ProjectRecordType,
} from '../orchestrationTypes';
import { arbId, arbIsoTimestamp, arbRecordType, arbRole, assertProperty } from './generators';

// The three sensitive gates whose satisfaction is deferred to the access
// control gate during handoff resolution (R3.8).
const GATED_GATES: HumanGate[] = [
  'professional_certification',
  'signature',
  'payment_release',
];

// The full role pool (mirrors the orchestration generators' ARCHITEX_ROLES).
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

// The AI identity recognised by accessControlService.isAiActor (R6.6, R8.5).
const AI_USER_ID = 'ai_guide';

const VALID_REASON = 'Handoff transferring responsibility for a gated step.';

interface Scenario {
  gate: HumanGate;
  qualifiedRole: ArchitexRole;
  unqualifiedRole: ArchitexRole;
  fromRole: ArchitexRole;
  recordType: ProjectRecordType;
  tenantId: string;
  projectId: string;
  humanUserId: string;
  now: string;
}

/**
 * A gated-handoff scenario: a sensitive gate, a role qualified for that gate, a
 * role NOT qualified for it, and supporting identifiers. Qualified/unqualified
 * roles are chosen by consulting QUALIFIED_ROLES_BY_GATE so the test tracks the
 * governance constant rather than hard-coding role names.
 */
const arbScenario = (): fc.Arbitrary<Scenario> =>
  fc.constantFrom(...GATED_GATES).chain((gate) => {
    const qualified = QUALIFIED_ROLES_BY_GATE[gate];
    const unqualified = ALL_ROLES.filter((r) => !qualified.includes(r));
    return fc.record<Scenario>({
      gate: fc.constant(gate),
      qualifiedRole: fc.constantFrom(...qualified),
      unqualifiedRole: fc.constantFrom(...unqualified),
      fromRole: arbRole(),
      recordType: arbRecordType(),
      tenantId: arbId('tenant'),
      projectId: arbId('proj'),
      humanUserId: arbId('user'),
      now: arbIsoTimestamp(),
    });
  });

describe('handoffService gated resolution authorization (Property 13)', () => {
  it('only the qualified receiving role satisfies a gated handoff; AI and unqualified roles are denied', async () => {
    await assertProperty(
      fc.asyncProperty(arbScenario(), async (s) => {
        const repo = new InMemoryHandoffRepository();
        const service = createHandoffService({ repository: repo });

        const initiateCtx: AuthorizationContext = {
          tenantId: s.tenantId,
          userId: s.humanUserId,
          role: s.fromRole,
          now: s.now,
        };

        const baseInput = {
          projectId: s.projectId,
          tenantId: s.tenantId,
          fromRole: s.fromRole,
          relatedRecordType: s.recordType,
          reason: VALID_REASON,
        };

        // ── Case 1: qualified, human receiving role → resolution succeeds ──
        const initQualified = await service.initiateHandoff(initiateCtx, {
          ...baseInput,
          toRole: s.qualifiedRole,
          appointedRoles: [s.qualifiedRole, s.fromRole],
          gate: s.gate,
        });
        expect(initQualified.ok).toBe(true);
        if (!initQualified.ok) return;

        const qualifiedCtx: AuthorizationContext = {
          tenantId: s.tenantId,
          userId: s.humanUserId,
          role: s.qualifiedRole,
          now: s.now,
        };
        const resolveQualified = await service.resolveHandoff(
          qualifiedCtx,
          initQualified.handoff.id,
          { gate: s.gate },
        );
        expect(resolveQualified.ok).toBe(true);
        if (resolveQualified.ok) {
          expect(resolveQualified.handoff.status).toBe('resolved');
          expect(resolveQualified.handoff.resolvedRole).toBe(s.qualifiedRole);
        }
        const storedQualified = await repo.get(s.tenantId, initQualified.handoff.id);
        expect(storedQualified?.status).toBe('resolved');

        // ── Case 2: AI identity with the qualified receiving role → denied ──
        // ctx.role is set to the receiving role so it clears the role-equality
        // check and is then denied by the gate via isAiActor (R6.6, R8.5).
        const initForAi = await service.initiateHandoff(initiateCtx, {
          ...baseInput,
          toRole: s.qualifiedRole,
          appointedRoles: [s.qualifiedRole, s.fromRole],
          gate: s.gate,
        });
        expect(initForAi.ok).toBe(true);
        if (!initForAi.ok) return;

        const aiCtx: AuthorizationContext = {
          tenantId: s.tenantId,
          userId: AI_USER_ID,
          role: s.qualifiedRole,
          now: s.now,
        };
        const resolveAi = await service.resolveHandoff(aiCtx, initForAi.handoff.id, {
          gate: s.gate,
        });
        expect(resolveAi.ok).toBe(false);
        if (!resolveAi.ok) {
          expect(resolveAi.reason).toBe('unauthorized');
        }
        // The obligation must remain unresolved after a denied resolution.
        const storedAfterAi = await repo.get(s.tenantId, initForAi.handoff.id);
        expect(storedAfterAi?.status).toBe('open');

        // ── Case 3: unqualified receiving role → denied ──
        const initUnqualified = await service.initiateHandoff(initiateCtx, {
          ...baseInput,
          toRole: s.unqualifiedRole,
          appointedRoles: [s.unqualifiedRole, s.fromRole],
          gate: s.gate,
        });
        expect(initUnqualified.ok).toBe(true);
        if (!initUnqualified.ok) return;

        const unqualifiedCtx: AuthorizationContext = {
          tenantId: s.tenantId,
          userId: s.humanUserId,
          role: s.unqualifiedRole,
          now: s.now,
        };
        const resolveUnqualified = await service.resolveHandoff(
          unqualifiedCtx,
          initUnqualified.handoff.id,
          { gate: s.gate },
        );
        expect(resolveUnqualified.ok).toBe(false);
        if (!resolveUnqualified.ok) {
          expect(resolveUnqualified.reason).toBe('unauthorized');
        }
        const storedAfterUnqualified = await repo.get(s.tenantId, initUnqualified.handoff.id);
        expect(storedAfterUnqualified?.status).toBe('open');
      }),
    );
  });
});
