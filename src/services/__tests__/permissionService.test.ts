import { describe, expect, it } from 'vitest';
import {
  assertCanUserPerform,
  canAdminOverrideSeparationOfDuty,
  canUserPerform,
  getActiveProjectAccessRoles,
  getRolePermissions,
  isCanonicalUserRole,
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
