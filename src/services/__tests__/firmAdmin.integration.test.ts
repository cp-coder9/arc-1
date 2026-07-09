import { describe, expect, it, vi } from 'vitest';

// Mock firebase modules to prevent transitive import failures
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', READ: 'READ', UPDATE: 'UPDATE', DELETE: 'DELETE', LIST: 'LIST', UPLOAD: 'UPLOAD', GET: 'GET', WRITE: 'WRITE' },
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ set: vi.fn() })) })),
  },
}));

vi.mock('@/services/siteAuditTrailService', () => ({
  siteAuditTrailService: { log: vi.fn() },
}));

import {
  getRolePermissions,
  isProjectAccessRoleCompatibleWithUserRole,
} from '../permissionService';
import {
  architexNavigation,
  getNavigationForRole,
} from '@/navigation/architexNavigationConfig';

/**
 * Integration tests for firm_admin scope preservation.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 *
 * These tests verify that the role architecture refinement preserves
 * firm_admin's permissions, navigation access, and project access role
 * eligibility while ensuring firm_admin has no platform-level permissions.
 */
describe('firm_admin scope and integration scenarios', () => {
  describe('Requirement 7.1: firm_admin permission set', () => {
    it('getRolePermissions("firm_admin") includes project:read, profile:read, profile:update, audit:read', () => {
      const permissions = getRolePermissions('firm_admin');

      expect(permissions).toContain('project:read');
      expect(permissions).toContain('profile:read');
      expect(permissions).toContain('profile:update');
      expect(permissions).toContain('audit:read');
    });

    it('getRolePermissions("firm_admin") returns exactly the expected permission set', () => {
      const permissions = getRolePermissions('firm_admin');

      expect(new Set(permissions)).toEqual(
        new Set(['project:read', 'profile:read', 'profile:update', 'audit:read']),
      );
    });
  });

  describe('Requirement 7.4: firm_admin excluded from platform permissions', () => {
    it('getRolePermissions("firm_admin") does NOT include admin:override', () => {
      const permissions = getRolePermissions('firm_admin');
      expect(permissions).not.toContain('admin:override');
    });

    it('getRolePermissions("firm_admin") does NOT include verification:review', () => {
      const permissions = getRolePermissions('firm_admin');
      expect(permissions).not.toContain('verification:review');
    });

    it('getRolePermissions("firm_admin") does NOT include escrow:release', () => {
      const permissions = getRolePermissions('firm_admin');
      expect(permissions).not.toContain('escrow:release');
    });

    it('getRolePermissions("firm_admin") does NOT include payment:manage', () => {
      const permissions = getRolePermissions('firm_admin');
      expect(permissions).not.toContain('payment:manage');
    });
  });

  describe('Requirement 7.2: firm_admin navigation access', () => {
    it('getNavigationForRole("firm_admin") returns correct modules', () => {
      const modules = getNavigationForRole('firm_admin');
      const moduleKeys = modules.map((m) => m.key);

      expect(moduleKeys).toContain('command_centre');
      expect(moduleKeys).toContain('inbox');
      expect(moduleKeys).toContain('toolboxes');
      expect(moduleKeys).toContain('documents');
      expect(moduleKeys).toContain('analytics');
      expect(moduleKeys).toContain('messages');
    });

    it('getNavigationForRole("firm_admin") does NOT include platform-only modules', () => {
      const modules = getNavigationForRole('firm_admin');
      const moduleKeys = modules.map((m) => m.key);

      expect(moduleKeys).not.toContain('settings');
      expect(moduleKeys).not.toContain('verification_queue');
      expect(moduleKeys).not.toContain('ai_review_queue');
      expect(moduleKeys).not.toContain('system_health');
    });
  });

  describe('Requirement 7.3: firm_admin eligible for project_administrator', () => {
    it('isProjectAccessRoleCompatibleWithUserRole("project_administrator", "firm_admin") returns true', () => {
      expect(
        isProjectAccessRoleCompatibleWithUserRole('project_administrator', 'firm_admin'),
      ).toBe(true);
    });

    it('isProjectAccessRoleCompatibleWithUserRole("lead_consultant", "firm_admin") returns false', () => {
      expect(
        isProjectAccessRoleCompatibleWithUserRole('lead_consultant', 'firm_admin'),
      ).toBe(false);
    });
  });

  describe('Requirement 2.5/2.6: platform_admin excluded from professional module navigation', () => {
    /**
     * Professional workflow modules that platform_admin should NOT have access to.
     * These correspond to the groups: 'BEP tools', 'Construction tools',
     * 'Client tools', 'Freelancer tools' in route definitions.
     */
    const PROFESSIONAL_MODULE_KEYS = [
      'projects',
      'toolboxes',
      'cpd_learning',
      'documents',
      'marketplace',
      'finance',
      'analytics',
      'messages',
    ] as const;

    it('platform_admin navigation does NOT include professional workflow modules', () => {
      const platformAdminNav = getNavigationForRole('platform_admin');
      const platformAdminKeys = platformAdminNav.map((m) => m.key);

      for (const moduleKey of PROFESSIONAL_MODULE_KEYS) {
        expect(platformAdminKeys).not.toContain(moduleKey);
      }
    });

    it('platform_admin navigation includes only platform administration modules', () => {
      const platformAdminNav = getNavigationForRole('platform_admin');
      const platformAdminKeys = platformAdminNav.map((m) => m.key);

      // Platform admin should have access to command centre, inbox, and platform-only modules
      expect(platformAdminKeys).toContain('command_centre');
      expect(platformAdminKeys).toContain('inbox');
      expect(platformAdminKeys).toContain('settings');
      expect(platformAdminKeys).toContain('verification_queue');
      expect(platformAdminKeys).toContain('ai_review_queue');
      expect(platformAdminKeys).toContain('system_health');
    });

    it('professional modules in navigation config do NOT list platform_admin in their roles', () => {
      for (const moduleKey of PROFESSIONAL_MODULE_KEYS) {
        const module = architexNavigation.find((m) => m.key === moduleKey);
        if (module?.roles) {
          expect(module.roles).not.toContain('platform_admin');
        }
      }
    });
  });
});
