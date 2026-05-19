import { describe, expect, it } from 'vitest';
import { UserRoleEnum } from '../../lib/schemas';
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

  it('allows admins to perform governed actions regardless of project membership', () => {
    expect(canUserPerform({ uid: 'admin-1', role: 'admin' }, 'escrow:release', project)).toBe(true);
    expect(canUserPerform({ uid: 'claims-admin', admin: true }, 'admin:override', project)).toBe(true);
    expect(getRolePermissions('admin')).toContain('audit:read');
  });

  it('allows admin separation-of-duty override only with an auditable reason', () => {
    expect(canAdminOverrideSeparationOfDuty({
      admin: { uid: 'admin-1', role: 'admin' },
      policy: 'separation_of_duty',
      reason: 'Emergency operational override approved by platform owner',
    })).toBe(true);

    expect(canAdminOverrideSeparationOfDuty({
      admin: { uid: 'client-1', role: 'client' },
      policy: 'separation_of_duty',
      reason: 'Emergency operational override approved by platform owner',
    })).toBe(false);

    expect(canAdminOverrideSeparationOfDuty({
      admin: { uid: 'admin-1', role: 'admin' },
      policy: 'separation_of_duty',
      reason: 'too short',
    })).toBe(false);
  });

  it('throws a 403 error from assertCanUserPerform', () => {
    expect(() => assertCanUserPerform({ uid: 'client-1', role: 'client' }, 'escrow:release', project)).toThrow(/Permission denied/);
  });
});
