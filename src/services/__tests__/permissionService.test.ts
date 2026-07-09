import { describe, expect, it, vi } from 'vitest';
import { UserRoleEnum } from '../../lib/schemas';

// Mock firebase-admin for admin override audit logging tests
const mockSet = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ set: mockSet })),
    })),
  },
}));

import {
  CANONICAL_USER_ROLES,
  assertCanUserPerform,
  canAdminOverrideSeparationOfDuty,
  canUserPerform,
  getActiveProjectAccessRoles,
  getRolePermissions,
  isCanonicalUserRole,
  isProjectAccessRoleCompatibleWithUserRole,
  normalizeUserRole,
} from '../permissionService';

const project = {
  projectId: 'project-1',
  clientId: 'client-1',
  leadBepId: 'bep-1',
  memberships: [
    { userId: 'contractor-1', accessRole: 'contractor' as const, status: 'active' as const },
    { userId: 'supplier-1', accessRole: 'supplier_package_assignee' as const, status: 'active' as const },
    { userId: 'removed-1', accessRole: 'contractor' as const, status: 'removed' as const },
  ],
};

describe('permissionService', () => {
  it('recognizes the full Full_scope.md role taxonomy', () => {
    expect(isCanonicalUserRole('client')).toBe(true);
    expect(isCanonicalUserRole('bep')).toBe(true);
    expect(isCanonicalUserRole('subcontractor')).toBe(true);
    expect(isCanonicalUserRole('supplier')).toBe(true);
    expect(isCanonicalUserRole('unknown')).toBe(false);
  });

  it('keeps runtime role schema aligned with canonical permission roles', () => {
    expect(new Set(UserRoleEnum.options)).toEqual(new Set(CANONICAL_USER_ROLES));
  });

  it('treats architect as a BEP subtype for authorization', () => {
    expect(normalizeUserRole('architect')).toBe('bep');
    expect(getRolePermissions('architect')).toEqual(getRolePermissions('bep'));
  });

  it('resolves active project access roles from ownership, lead BEP, and membership', () => {
    expect(getActiveProjectAccessRoles({ uid: 'client-1', role: 'client' }, project)).toEqual(['project_owner']);
    expect(getActiveProjectAccessRoles({ uid: 'bep-1', role: 'bep' }, project)).toEqual(['lead_bep']);
    expect(getActiveProjectAccessRoles({ uid: 'contractor-1', role: 'contractor' }, project)).toEqual(['contractor']);
    expect(getActiveProjectAccessRoles({ uid: 'removed-1', role: 'contractor' }, project)).toEqual([]);
  });

  it('requires both role permission and project access for scoped project actions', () => {
    expect(canUserPerform({ uid: 'client-1', role: 'client' }, 'project:read', project)).toBe(true);
    expect(canUserPerform({ uid: 'client-1', role: 'client' }, 'municipal:manage', project)).toBe(false);
    expect(canUserPerform({ uid: 'bep-1', role: 'bep' }, 'municipal:manage', project)).toBe(true);
    expect(canUserPerform({ uid: 'outsider-1', role: 'bep' }, 'project:read', project)).toBe(false);
  });

  it('limits package participants to package/project read and payment visibility', () => {
    expect(canUserPerform({ uid: 'supplier-1', role: 'supplier' }, 'project:read', project)).toBe(true);
    expect(canUserPerform({ uid: 'supplier-1', role: 'supplier' }, 'payment:read', project)).toBe(true);
    expect(canUserPerform({ uid: 'supplier-1', role: 'supplier' }, 'project:update', project)).toBe(false);
  });

  it('keeps subcontractor package assignees read/payment scoped without project mutation rights', () => {
    const subcontractorProject = {
      ...project,
      memberships: [
        ...project.memberships,
        { userId: 'subcontractor-1', accessRole: 'subcontractor_package_assignee' as const, status: 'active' as const },
        { userId: 'suspended-subcontractor', accessRole: 'subcontractor_package_assignee' as const, status: 'suspended' as const },
      ],
    };

    expect(getActiveProjectAccessRoles({ uid: 'subcontractor-1', role: 'subcontractor' }, subcontractorProject)).toEqual(['subcontractor_package_assignee']);
    expect(canUserPerform({ uid: 'subcontractor-1', role: 'subcontractor' }, 'project:read', subcontractorProject)).toBe(true);
    expect(canUserPerform({ uid: 'subcontractor-1', role: 'subcontractor' }, 'payment:read', subcontractorProject)).toBe(true);
    expect(canUserPerform({ uid: 'subcontractor-1', role: 'subcontractor' }, 'project:update', subcontractorProject)).toBe(false);
    expect(canUserPerform({ uid: 'subcontractor-1', role: 'subcontractor' }, 'municipal:view_insight', subcontractorProject)).toBe(false);
    expect(getActiveProjectAccessRoles({ uid: 'suspended-subcontractor', role: 'subcontractor' }, subcontractorProject)).toEqual([]);
  });



  it('rejects mismatched subcontractor and supplier package memberships', () => {
    const packageProject = {
      ...project,
      memberships: [
        { userId: 'supplier-correct', accessRole: 'supplier_package_assignee' as const, status: 'active' as const },
        { userId: 'supplier-wrong', accessRole: 'subcontractor_package_assignee' as const, status: 'active' as const },
        { userId: 'subcontractor-correct', accessRole: 'subcontractor_package_assignee' as const, status: 'active' as const },
        { userId: 'subcontractor-wrong', accessRole: 'supplier_package_assignee' as const, status: 'active' as const },
        { userId: 'supplier-suspended', accessRole: 'supplier_package_assignee' as const, status: 'suspended' as const },
      ],
    };

    expect(isProjectAccessRoleCompatibleWithUserRole('supplier_package_assignee', 'supplier')).toBe(true);
    expect(isProjectAccessRoleCompatibleWithUserRole('supplier_package_assignee', 'subcontractor')).toBe(false);
    expect(isProjectAccessRoleCompatibleWithUserRole('subcontractor_package_assignee', 'subcontractor')).toBe(true);
    expect(isProjectAccessRoleCompatibleWithUserRole('subcontractor_package_assignee', 'supplier')).toBe(false);

    expect(getActiveProjectAccessRoles({ uid: 'supplier-correct', role: 'supplier' }, packageProject)).toEqual(['supplier_package_assignee']);
    expect(canUserPerform({ uid: 'supplier-correct', role: 'supplier' }, 'project:read', packageProject)).toBe(true);
    expect(canUserPerform({ uid: 'supplier-correct', role: 'supplier' }, 'payment:read', packageProject)).toBe(true);

    expect(getActiveProjectAccessRoles({ uid: 'supplier-wrong', role: 'supplier' }, packageProject)).toEqual([]);
    expect(canUserPerform({ uid: 'supplier-wrong', role: 'supplier' }, 'project:read', packageProject)).toBe(false);
    expect(canUserPerform({ uid: 'supplier-wrong', role: 'supplier' }, 'payment:read', packageProject)).toBe(false);

    expect(getActiveProjectAccessRoles({ uid: 'subcontractor-correct', role: 'subcontractor' }, packageProject)).toEqual(['subcontractor_package_assignee']);
    expect(canUserPerform({ uid: 'subcontractor-correct', role: 'subcontractor' }, 'project:read', packageProject)).toBe(true);
    expect(canUserPerform({ uid: 'subcontractor-correct', role: 'subcontractor' }, 'payment:read', packageProject)).toBe(true);

    expect(getActiveProjectAccessRoles({ uid: 'subcontractor-wrong', role: 'subcontractor' }, packageProject)).toEqual([]);
    expect(canUserPerform({ uid: 'subcontractor-wrong', role: 'subcontractor' }, 'project:read', packageProject)).toBe(false);
    expect(canUserPerform({ uid: 'subcontractor-wrong', role: 'subcontractor' }, 'payment:read', packageProject)).toBe(false);

    expect(getActiveProjectAccessRoles({ uid: 'supplier-suspended', role: 'supplier' }, packageProject)).toEqual([]);
  });

  it('evaluates platform_admin against defined permission set without unconditional bypass', () => {
    const platformAdmin = { uid: 'admin-1', role: 'platform_admin' as const };
    const adminFlagUser = { uid: 'claims-admin', admin: true, role: 'platform_admin' as const };

    // platform_admin gets project:read on any project without membership
    expect(canUserPerform(platformAdmin, 'project:read', project)).toBe(true);
    // platform_admin with admin:true flag also gets project:read
    expect(canUserPerform(adminFlagUser, 'project:read', project)).toBe(true);

    // platform_admin can perform actions in PLATFORM_ADMIN_PERMISSIONS (non-project-scoped)
    expect(canUserPerform(platformAdmin, 'verification:review')).toBe(true);
    expect(canUserPerform(platformAdmin, 'audit:read')).toBe(true);
    expect(canUserPerform(platformAdmin, 'admin:override')).toBe(true);

    // platform_admin is denied project-scoped writes without project membership
    expect(canUserPerform(platformAdmin, 'escrow:release', project)).toBe(false);
    expect(canUserPerform(platformAdmin, 'project:update', project)).toBe(false);
    expect(canUserPerform(platformAdmin, 'compliance:sign', project)).toBe(false);
    expect(canUserPerform(platformAdmin, 'municipal:manage', project)).toBe(false);
    expect(canUserPerform(platformAdmin, 'payment:manage', project)).toBe(false);

    // platform_admin with actual project membership CAN perform writes
    const adminWithMembership = {
      ...project,
      memberships: [
        ...project.memberships,
        { userId: 'admin-1', accessRole: 'lead_consultant' as const, status: 'active' as const },
      ],
    };
    expect(canUserPerform(platformAdmin, 'project:update', adminWithMembership)).toBe(true);
    expect(canUserPerform(platformAdmin, 'compliance:sign', adminWithMembership)).toBe(true);
    expect(canUserPerform(platformAdmin, 'municipal:manage', adminWithMembership)).toBe(true);

    // platform_admin is denied actions NOT in PLATFORM_ADMIN_PERMISSIONS (non-project-scoped)
    expect(canUserPerform(platformAdmin, 'profile:read')).toBe(false);
    expect(canUserPerform(platformAdmin, 'profile:update')).toBe(false);

    // getRolePermissions still returns admin permissions for backward compatibility
    expect(getRolePermissions('admin')).toContain('audit:read');
  });

  it('allows admin separation-of-duty override only with an auditable reason', async () => {
    expect(await canAdminOverrideSeparationOfDuty({
      admin: { uid: 'admin-1', role: 'platform_admin' },
      action: 'project:update',
      projectId: 'project-1',
      reason: 'Emergency operational override approved by platform owner',
    })).toBe(true);

    expect(await canAdminOverrideSeparationOfDuty({
      admin: { uid: 'admin-1', admin: true },
      action: 'project:update',
      projectId: 'project-1',
      reason: 'Emergency operational override approved by platform owner',
    })).toBe(true);

    expect(await canAdminOverrideSeparationOfDuty({
      admin: { uid: 'client-1', role: 'client' },
      action: 'project:update',
      projectId: 'project-1',
      reason: 'Emergency operational override approved by platform owner',
    })).toBe(false);

    expect(await canAdminOverrideSeparationOfDuty({
      admin: { uid: 'admin-1', role: 'platform_admin' },
      action: 'project:update',
      projectId: 'project-1',
      reason: 'too short',
    })).toBe(false);
  });

  it('throws a 403 error from assertCanUserPerform', () => {
    expect(() => assertCanUserPerform({ uid: 'client-1', role: 'client' }, 'escrow:release', project)).toThrow(/Permission denied/);
  });
});
