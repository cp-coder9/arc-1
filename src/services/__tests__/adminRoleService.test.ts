import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock firebase-admin for project access role assignment/revocation tests
const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockDocRef = { get: mockGet, set: mockSet, delete: mockDelete };
const mockDoc = vi.fn(() => mockDocRef);
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: mockCollection,
        doc: mockDoc,
        get: mockGet,
        set: mockSet,
        delete: mockDelete,
      })),
    })),
  },
}));

import {
  buildRoleChangeAuditInput,
  buildRoleChangeDecision,
  buildRoleChangePatch,
  isServerAuthoritativeAdmin,
  assignProjectAccessRole,
  revokeProjectAccessRole,
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

  describe('assignProjectAccessRole', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('assigns lead_consultant to a compatible user and writes to Firestore', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const result = await assignProjectAccessRole(
        { uid: 'user-1', role: 'architect' },
        'lead_consultant',
        'project-1',
        'admin-1',
      );

      expect(result).toMatchObject({
        userId: 'user-1',
        projectId: 'project-1',
        accessRole: 'lead_consultant',
        assignedBy: 'admin-1',
        userProfessionalRole: 'architect',
      });
      expect('error' in result).toBe(false);
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        accessRole: 'lead_consultant',
      }));
    });

    it('assigns project_administrator to a compatible user', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const result = await assignProjectAccessRole(
        { uid: 'user-2', role: 'contractor' },
        'project_administrator',
        'project-2',
        'admin-1',
      );

      expect(result).toMatchObject({
        userId: 'user-2',
        projectId: 'project-2',
        accessRole: 'project_administrator',
        assignedBy: 'admin-1',
        userProfessionalRole: 'contractor',
      });
      expect('error' in result).toBe(false);
    });

    it('returns 400 error for incompatible role assignment (client + lead_consultant)', async () => {
      const result = await assignProjectAccessRole(
        { uid: 'user-1', role: 'client' },
        'lead_consultant',
        'project-1',
        'admin-1',
      );

      expect(result).toMatchObject({
        error: 'Role client is not compatible with project access role lead_consultant',
        status: 400,
      });
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('returns 400 error for incompatible role assignment (freelancer + project_administrator)', async () => {
      const result = await assignProjectAccessRole(
        { uid: 'user-1', role: 'freelancer' },
        'project_administrator',
        'project-1',
        'admin-1',
      );

      expect(result).toMatchObject({
        error: 'Role freelancer is not compatible with project access role project_administrator',
        status: 400,
      });
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('returns 409 error when user already holds opposite role (mutual exclusivity)', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          userId: 'user-1',
          projectId: 'project-1',
          accessRole: 'lead_consultant',
          assignedBy: 'admin-1',
          assignedAt: '2026-01-01T00:00:00.000Z',
          userProfessionalRole: 'architect',
        }),
      });

      const result = await assignProjectAccessRole(
        { uid: 'user-1', role: 'architect' },
        'project_administrator',
        'project-1',
        'admin-2',
      );

      expect(result).toMatchObject({
        error: 'User already holds lead_consultant on project project-1; revoke it first',
        status: 409,
      });
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('allows re-assignment of the same role (overwrite)', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          userId: 'user-1',
          projectId: 'project-1',
          accessRole: 'lead_consultant',
          assignedBy: 'admin-old',
          assignedAt: '2026-01-01T00:00:00.000Z',
          userProfessionalRole: 'architect',
        }),
      });

      const result = await assignProjectAccessRole(
        { uid: 'user-1', role: 'architect' },
        'lead_consultant',
        'project-1',
        'admin-new',
      );

      // Same role re-assignment is allowed (not mutually exclusive)
      expect(result).toMatchObject({
        userId: 'user-1',
        accessRole: 'lead_consultant',
        assignedBy: 'admin-new',
      });
      expect(mockSet).toHaveBeenCalled();
    });

    it('returns 400 when user has no role (undefined)', async () => {
      const result = await assignProjectAccessRole(
        { uid: 'user-1' },
        'lead_consultant',
        'project-1',
        'admin-1',
      );

      expect(result).toMatchObject({
        error: 'Role unknown is not compatible with project access role lead_consultant',
        status: 400,
      });
    });
  });

  describe('revokeProjectAccessRole', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('deletes the access role document from Firestore', async () => {
      await revokeProjectAccessRole(
        { uid: 'user-1', role: 'architect' },
        'lead_consultant',
        'project-1',
        'admin-1',
      );

      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
