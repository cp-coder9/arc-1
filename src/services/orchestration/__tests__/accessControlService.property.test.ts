// Feature: unified-project-workflow-orchestration, Property 30: Authorization permits the entitled and denies the rest
//
// Property-based test for `accessControlService.authorize` (Task 2.2).
//
// Property 30 (design.md): For any authorization request, an in-tenant role
// entitled to the action (including a role qualified for a sensitive
// `HumanGate`) is permitted, while a role lacking the right or unqualified for
// the gate is denied with an error naming the attempted action type, the role,
// and the required gate, leaving the target record unchanged.
//
// Validates: Requirements 8.1, 8.3, 8.4, 8.5

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { authorize, isAiActor } from '../accessControlService';
import { QUALIFIED_ROLES_BY_GATE, type ActionType, type HumanGate } from '../orchestrationTypes';
import { arbAuthRequest, assertProperty, type AuthRequest } from './generators';

// Mirror of the service's gate resolution (sensitive action types map 1:1 to a
// gate; any other action derives its gate from `target.gate`, default `none`).
const SENSITIVE_ACTION_GATES: Partial<Record<ActionType, HumanGate>> = {
  professional_certification: 'professional_certification',
  signature: 'signature',
  payment_release: 'payment_release',
  municipal_submission: 'municipal_submission',
  closeout_acceptance: 'closeout_acceptance',
};

function expectedRequiredGate(req: AuthRequest): HumanGate {
  return SENSITIVE_ACTION_GATES[req.action] ?? req.target.gate ?? 'none';
}

/**
 * Independently re-derive whether the request should be permitted, following
 * the access-control rules: in-tenant + (gate is `none` OR a qualified human
 * role for the gate) + not the AI identity.
 */
function shouldPermit(req: AuthRequest): boolean {
  if (req.ctx.tenantId !== req.target.tenantId) return false;
  const gate = expectedRequiredGate(req);
  if (gate === 'none') return true;
  if (isAiActor(req.ctx)) return false;
  return QUALIFIED_ROLES_BY_GATE[gate].includes(req.ctx.role);
}

describe('accessControlService.authorize — Property 30', () => {
  it('permits the entitled and denies the rest with a reason naming action, role, and gate', () => {
    assertProperty(
      fc.property(arbAuthRequest(), (req: AuthRequest) => {
        const targetSnapshot = JSON.parse(JSON.stringify(req.target));
        const result = authorize(req.ctx, req.action, req.target);

        const gate = expectedRequiredGate(req);
        // The decision always reports the gate the action sits behind.
        expect(result.requiredGate).toBe(gate);

        if (shouldPermit(req)) {
          // Entitled: in-tenant role clears any required gate.
          expect(result.outcome).toBe('permitted');
        } else {
          // Denied: reason must name the action type, the role, and the gate,
          // and must not leak any target field values.
          expect(result.outcome).toBe('denied');
          expect(typeof result.reason).toBe('string');
          const reason = result.reason ?? '';
          expect(reason).toContain(req.action);
          expect(reason).toContain(req.ctx.role);
          expect(reason).toContain(gate);
        }

        // The target record is never mutated by an authorization decision.
        expect(req.target).toEqual(targetSnapshot);
      }),
    );
  });
});
