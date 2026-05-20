import { describe, expect, it } from 'vitest';
import {
  buildRoleChangeAuditInput,
  buildRoleChangeDecision,
  buildRoleChangePatch,
  isServerAuthoritativeAdmin,
} from '../adminRoleService';

const adminActor = { uid: 'admin-1', role: 'admin' as const, email: 'admin@example.com' };
const clientActor = { uid: 'client-1', role: 'client' as const, email: 'client@example.com' };

describe('adminRoleService', () => {
  it('recognizes server-authoritative admin actors from role or custom claim', () => {
    expect(isServerAuthoritativeAdmin(adminActor)).toBe(true);
    expect(isServerAuthoritativeAdmin({ uid: 'claims-admin', admin: true })).toBe(true);
    expect(isServerAuthoritativeAdmin(clientActor)).toBe(false);
  });

  it('allows admins to assign canonical roles with a durable reason', () => {
    const decision = buildRoleChangeDecision({
      actor: adminActor,
      targetUserId: 'user-1',
      currentRole: 'client',
      requestedRole: 'contractor',
      reason: 'Verified contractor onboarding correction',
      reasonCode: 'admin_correction',
      createdAt: '2026-05-20T18:00:00.000Z',
    });

    expect(decision).toMatchObject({
      allowed: true,
      targetUserId: 'user-1',
      previousRole: 'client',
      assignedRole: 'contractor',
      normalizedAssignedRole: 'contractor',
      requiresAdmin: true,
    });
    expect(buildRoleChangePatch(decision)).toEqual({
      role: 'contractor',
      normalizedRole: 'contractor',
      roleUpdatedAt: '2026-05-20T18:00:00.000Z',
      roleChangeReasonCode: 'admin_correction',
      updatedAt: '2026-05-20T18:00:00.000Z',
    });
  });

  it('normalizes architect assignments to BEP for authorization while preserving visible role', () => {
    const decision = buildRoleChangeDecision({
      actor: adminActor,
      targetUserId: 'architect-1',
      currentRole: 'client',
      requestedRole: 'architect',
      reason: 'Legacy SACAP architect account migration',
      reasonCode: 'legacy_migration',
    });

    expect(decision.assignedRole).toBe('architect');
    expect(decision.normalizedAssignedRole).toBe('bep');
  });

  it('blocks non-admin role changes for other users', () => {
    expect(() => buildRoleChangeDecision({
      actor: clientActor,
      targetUserId: 'other-user',
      currentRole: 'client',
      requestedRole: 'bep',
      reason: 'Trying to change another user role',
      reasonCode: 'support_request',
    })).toThrow(/Admin access required/);
  });

  it('blocks self-service admin escalation even when self-service is enabled', () => {
    expect(() => buildRoleChangeDecision({
      actor: clientActor,
      targetUserId: 'client-1',
      currentRole: 'client',
      requestedRole: 'admin',
      reason: 'Attempted self-service admin role escalation',
      reasonCode: 'user_onboarding',
      allowSelfService: true,
    })).toThrow(/Admin access required/);
  });

  it('allows controlled self-service selection for non-admin onboarding roles', () => {
    const decision = buildRoleChangeDecision({
      actor: clientActor,
      targetUserId: 'client-1',
      currentRole: 'client',
      requestedRole: 'supplier',
      reason: 'Initial onboarding role selection by user',
      reasonCode: 'user_onboarding',
      allowSelfService: true,
    });

    expect(decision.requiresAdmin).toBe(false);
    expect(decision.assignedRole).toBe('supplier');
  });

  it('rejects unsupported roles and short reasons', () => {
    expect(() => buildRoleChangeDecision({
      actor: adminActor,
      targetUserId: 'user-1',
      requestedRole: 'owner',
      reason: 'Unsupported role assignment',
      reasonCode: 'admin_correction',
    })).toThrow(/Unsupported role/);

    expect(() => buildRoleChangeDecision({
      actor: adminActor,
      targetUserId: 'user-1',
      requestedRole: 'client',
      reason: 'short',
      reasonCode: 'admin_correction',
    })).toThrow(/reason/);
  });

  it('builds immutable audit input for assigned roles', () => {
    const decision = buildRoleChangeDecision({
      actor: adminActor,
      targetUserId: 'user-1',
      currentRole: 'client',
      requestedRole: 'bep',
      reason: 'Verified professional status approved',
      reasonCode: 'verification_approved',
      createdAt: '2026-05-20T18:00:00.000Z',
    });

    expect(buildRoleChangeAuditInput(adminActor, decision)).toMatchObject({
      category: 'role',
      action: 'role.admin_assigned',
      immutable: true,
      reason: 'Verified professional status approved',
      target: { type: 'user', id: 'user-1' },
      metadata: {
        previousRole: 'client',
        assignedRole: 'bep',
        normalizedAssignedRole: 'bep',
        reasonCode: 'verification_approved',
        requiresAdmin: true,
      },
    });
  });
});
