import { describe, it, expect } from 'vitest';
import {
  PERMISSION_MATRIX,
  isAdminRole,
  getEffectivePermissions,
  checkPermission,
} from '../services/accessControl';
import type { TownPlanningAction } from '../types';
import type { UserRole } from '@/types';

describe('accessControl', () => {
  describe('PERMISSION_MATRIX', () => {
    it('town_planner has all actions except approve_costs', () => {
      const actions = PERMISSION_MATRIX['town_planner'];
      expect(actions).not.toContain('approve_costs');
      expect(actions).toContain('create_application');
      expect(actions).toContain('manage_workflow');
      expect(actions).toContain('manage_comments');
      expect(actions).toContain('manage_conditions');
      expect(actions).toContain('configure_municipality');
      expect(actions).toContain('manage_sdp');
      expect(actions).toContain('view_application');
      expect(actions).toContain('view_property');
      expect(actions).toContain('update_property');
      expect(actions).toContain('manage_subdivision');
      expect(actions).toContain('manage_surveyor');
      expect(actions).toContain('link_drawings');
      expect(actions).toContain('view_conditions');
      expect(actions).toContain('view_documents');
      expect(actions).toHaveLength(14);
    });

    it('land_surveyor has correct permissions', () => {
      const actions = PERMISSION_MATRIX['land_surveyor'];
      expect(actions).toEqual(expect.arrayContaining([
        'view_application',
        'view_property',
        'update_property',
        'manage_subdivision',
        'manage_surveyor',
        'view_conditions',
        'view_documents',
      ]));
      expect(actions).toHaveLength(7);
    });

    it('architect has correct permissions', () => {
      const actions = PERMISSION_MATRIX['architect'];
      expect(actions).toEqual(expect.arrayContaining([
        'view_application',
        'view_property',
        'update_property',
        'link_drawings',
        'view_conditions',
        'view_documents',
      ]));
      expect(actions).toHaveLength(6);
    });

    it('bep has same permissions as architect', () => {
      expect(PERMISSION_MATRIX['bep']).toEqual(PERMISSION_MATRIX['architect']);
    });

    it('client has view + approve_costs permissions', () => {
      const actions = PERMISSION_MATRIX['client'];
      expect(actions).toEqual(expect.arrayContaining([
        'view_application',
        'view_conditions',
        'approve_costs',
        'view_documents',
      ]));
      expect(actions).toHaveLength(4);
    });

    it('developer has same permissions as client', () => {
      expect(PERMISSION_MATRIX['developer']).toEqual(PERMISSION_MATRIX['client']);
    });

    it('site_manager has view-only permissions', () => {
      const actions = PERMISSION_MATRIX['site_manager'];
      expect(actions).toEqual(expect.arrayContaining([
        'view_application',
        'view_conditions',
        'view_documents',
      ]));
      expect(actions).toHaveLength(3);
    });

    it('admin has ALL actions', () => {
      const actions = PERMISSION_MATRIX['admin'];
      expect(actions).toHaveLength(15);
      expect(actions).toContain('approve_costs');
      expect(actions).toContain('create_application');
    });

    it('platform_admin has ALL actions', () => {
      const actions = PERMISSION_MATRIX['platform_admin'];
      expect(actions).toHaveLength(15);
      expect(actions).toContain('approve_costs');
      expect(actions).toContain('create_application');
    });

    it('roles with no access have empty arrays', () => {
      const noAccessRoles: UserRole[] = [
        'engineer',
        'quantity_surveyor',
        'energy_professional',
        'fire_engineer',
        'contractor',
        'subcontractor',
        'supplier',
        'freelancer',
        'firm_admin',
        'cpm',
      ];
      for (const role of noAccessRoles) {
        expect(PERMISSION_MATRIX[role]).toEqual([]);
      }
    });
  });

  describe('isAdminRole', () => {
    it('returns true for admin', () => {
      expect(isAdminRole('admin')).toBe(true);
    });

    it('returns true for platform_admin', () => {
      expect(isAdminRole('platform_admin')).toBe(true);
    });

    it('returns false for town_planner', () => {
      expect(isAdminRole('town_planner')).toBe(false);
    });

    it('returns false for client', () => {
      expect(isAdminRole('client')).toBe(false);
    });
  });

  describe('getEffectivePermissions', () => {
    it('returns full access for admin role', () => {
      const result = getEffectivePermissions(['admin']);
      expect(result.isAdmin).toBe(true);
      expect(result.allowedActions).toHaveLength(15);
    });

    it('returns full access when any role is admin', () => {
      const result = getEffectivePermissions(['client', 'platform_admin']);
      expect(result.isAdmin).toBe(true);
      expect(result.allowedActions).toHaveLength(15);
    });

    it('computes union of permissions for multiple roles', () => {
      // client has: view_application, view_conditions, approve_costs, view_documents
      // land_surveyor has: view_application, view_property, update_property, manage_subdivision, manage_surveyor, view_conditions, view_documents
      const result = getEffectivePermissions(['client', 'land_surveyor']);
      expect(result.isAdmin).toBe(false);
      expect(result.allowedActions).toContain('approve_costs'); // from client
      expect(result.allowedActions).toContain('manage_subdivision'); // from land_surveyor
      expect(result.allowedActions).toContain('view_application'); // both
      expect(result.allowedActions).toContain('update_property'); // from land_surveyor
      // Union should have 8 unique actions
      expect(result.allowedActions).toHaveLength(8);
    });

    it('returns empty actions for roles with no access', () => {
      const result = getEffectivePermissions(['engineer']);
      expect(result.isAdmin).toBe(false);
      expect(result.allowedActions).toHaveLength(0);
    });

    it('handles empty roles array', () => {
      const result = getEffectivePermissions([]);
      expect(result.isAdmin).toBe(false);
      expect(result.allowedActions).toHaveLength(0);
    });

    it('preserves roles in result', () => {
      const roles: UserRole[] = ['town_planner', 'client'];
      const result = getEffectivePermissions(roles);
      expect(result.roles).toEqual(roles);
    });
  });

  describe('checkPermission', () => {
    it('denies access when no roles are provided', async () => {
      const result = await checkPermission({
        userId: 'user1',
        projectId: 'project1',
        action: 'view_application',
        roles: [],
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No roles assigned');
    });

    it('denies access when action not in permission matrix', async () => {
      const result = await checkPermission({
        userId: 'user1',
        projectId: 'project1',
        action: 'create_application',
        roles: ['client'],
        isProjectMember: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted');
    });

    it('allows admin without project membership check', async () => {
      const result = await checkPermission({
        userId: 'admin1',
        projectId: 'project1',
        action: 'create_application',
        roles: ['admin'],
        // isProjectMember intentionally omitted — admin bypasses membership
      });
      expect(result.allowed).toBe(true);
    });

    it('allows platform_admin without project membership check', async () => {
      const result = await checkPermission({
        userId: 'admin2',
        projectId: 'project1',
        action: 'manage_conditions',
        roles: ['platform_admin'],
      });
      expect(result.allowed).toBe(true);
    });

    it('denies non-admin when not a project member', async () => {
      const result = await checkPermission({
        userId: 'user1',
        projectId: 'project1',
        action: 'view_application',
        roles: ['town_planner'],
        isProjectMember: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not a member');
    });

    it('allows non-admin when project member and action permitted', async () => {
      const result = await checkPermission({
        userId: 'user1',
        projectId: 'project1',
        action: 'create_application',
        roles: ['town_planner'],
        isProjectMember: true,
      });
      expect(result.allowed).toBe(true);
    });

    it('uses multi-role union for permission check', async () => {
      // client alone cannot create_application, but combined with town_planner they can
      const result = await checkPermission({
        userId: 'user1',
        projectId: 'project1',
        action: 'create_application',
        roles: ['client', 'town_planner'],
        isProjectMember: true,
      });
      expect(result.allowed).toBe(true);
    });

    it('multi-role union grants approve_costs to client+town_planner', async () => {
      const result = await checkPermission({
        userId: 'user1',
        projectId: 'project1',
        action: 'approve_costs',
        roles: ['client', 'town_planner'],
        isProjectMember: true,
      });
      expect(result.allowed).toBe(true);
    });

    it('denies when no role has the action even with multi-role', async () => {
      const result = await checkPermission({
        userId: 'user1',
        projectId: 'project1',
        action: 'create_application',
        roles: ['client', 'land_surveyor'],
        isProjectMember: true,
      });
      expect(result.allowed).toBe(false);
    });

    it('falls back to Firestore lookup when isProjectMember not provided (returns false)', async () => {
      // The mock Firestore lookup returns false by default
      const result = await checkPermission({
        userId: 'user1',
        projectId: 'project1',
        action: 'view_application',
        roles: ['town_planner'],
        // isProjectMember not provided — falls back to lookupProjectMembership which returns false
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not a member');
    });
  });
});
