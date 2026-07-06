import { describe, expect, it, vi } from 'vitest';

// Mock firebase-admin (used by permissionService for admin override audit)
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ set: vi.fn() })) })),
  },
}));

// Mock firebase client (imported transitively via siteAuditTrailService → fieldAccessService → navigationConfig)
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', READ: 'READ', UPDATE: 'UPDATE', DELETE: 'DELETE', LIST: 'LIST', UPLOAD: 'UPLOAD', GET: 'GET', WRITE: 'WRITE' },
}));

// Mock siteAuditTrailService (the real source of the firebase dependency in the nav config chain)
vi.mock('@/services/siteAuditTrailService', () => ({
  siteAuditTrailService: {
    logAction: vi.fn(),
    getAuditTrail: vi.fn().mockResolvedValue([]),
  },
}));

import {
  getRolePermissions,
  isProjectAccessRoleCompatibleWithUserRole,
} from '../services/permissionService';
import { getNavigationForRole } from '../navigation/architexNavigationConfig';

/**
 * Task 9.2: Verify firm_admin scope is preserved unchanged.
 *
 * This test confirms that the role architecture refinement has not altered
 * the firm_admin role's permissions, navigation access, project access role
 * eligibility, or platform-level permission exclusion.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */
describe('firm_admin scope preservation (Task 9.2)', () => {
  it('retains permission set: project:read, profile:read, profile:update, audit:read', () => {
    const permissions = getRolePermissions('firm_admin');
    expect(permissions).toEqual(['project:read', 'profile:read', 'profile:update', 'audit:read']);
  });

  it('retains navigation access to: command_centre, inbox, projects, toolboxes, documents, analytics, messages', () => {
    const modules = getNavigationForRole('firm_admin');
    const moduleKeys = modules.map((m) => m.key);

    expect(moduleKeys).toContain('command_centre');
    expect(moduleKeys).toContain('inbox');
    expect(moduleKeys).toContain('projects');
    expect(moduleKeys).toContain('toolboxes');
    expect(moduleKeys).toContain('documents');
    expect(moduleKeys).toContain('analytics');
    expect(moduleKeys).toContain('messages');
  });

  it('is eligible for project_administrator assignment', () => {
    expect(isProjectAccessRoleCompatibleWithUserRole('project_administrator', 'firm_admin')).toBe(true);
  });

  it('has no platform-level permissions', () => {
    const permissions = getRolePermissions('firm_admin');
    const platformPermissions = ['admin:override', 'verification:review', 'escrow:release', 'payment:manage'];

    for (const platformPerm of platformPermissions) {
      expect(permissions).not.toContain(platformPerm);
    }
  });
});
