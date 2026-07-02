/**
 * Unit tests for ContractRbacService
 *
 * Tests the role-feature-permission matrix per Requirements 9.1–9.9
 */

import { describe, expect, it } from 'vitest';
import {
  getPermissions,
  canAccess,
  resolveMultiRolePermissions,
  assertAccess,
  DEFAULT_APPROVAL_THRESHOLD,
} from '../contractRbacService';
import type { ContractProjectAssignment } from '../contractTypes';
import type { UserRole } from '@/types';

// ══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ══════════════════════════════════════════════════════════════════════════════

function makeAssignment(overrides: Partial<ContractProjectAssignment> = {}): ContractProjectAssignment {
  return {
    projectId: 'proj-1',
    userId: 'user-1',
    roles: [],
    isAssignedTeamMember: false,
    isAssignedContractor: false,
    isAssignedSubcontractor: false,
    isProjectOwner: false,
    isAssignedSiteManager: false,
    ...overrides,
  };
}

const teamMember = makeAssignment({ isAssignedTeamMember: true });
const assignedContractor = makeAssignment({ isAssignedContractor: true });
const assignedSubcontractor = makeAssignment({ isAssignedSubcontractor: true });
const projectOwner = makeAssignment({ isProjectOwner: true });
const assignedSiteManager = makeAssignment({ isAssignedSiteManager: true });
const noAssignment = makeAssignment();

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('contractRbacService', () => {
  describe('getPermissions', () => {
    describe('Requirement 9.1: architect, bep, quantity_surveyor (assigned team member)', () => {
      const roles: UserRole[] = ['architect', 'bep', 'quantity_surveyor'];

      for (const role of roles) {
        it(`${role} with team assignment has read+write on contract_setup`, () => {
          const perms = getPermissions(role, 'contract_setup', teamMember);
          expect(perms).toContain('read');
          expect(perms).toContain('write');
        });

        it(`${role} with team assignment has read+write on notices`, () => {
          const perms = getPermissions(role, 'notices', teamMember);
          expect(perms).toContain('read');
          expect(perms).toContain('write');
        });

        it(`${role} with team assignment has read+write on variations`, () => {
          const perms = getPermissions(role, 'variations', teamMember);
          expect(perms).toContain('read');
          expect(perms).toContain('write');
        });

        it(`${role} with team assignment has read+write on payment_schedule`, () => {
          const perms = getPermissions(role, 'payment_schedule', teamMember);
          expect(perms).toContain('read');
          expect(perms).toContain('write');
        });

        it(`${role} with team assignment has read+write on claims`, () => {
          const perms = getPermissions(role, 'claims', teamMember);
          expect(perms).toContain('read');
          expect(perms).toContain('write');
        });

        it(`${role} with team assignment has read+write on eot`, () => {
          const perms = getPermissions(role, 'eot', teamMember);
          expect(perms).toContain('read');
          expect(perms).toContain('write');
        });

        it(`${role} with team assignment has read on data_sheet_view`, () => {
          const perms = getPermissions(role, 'data_sheet_view', teamMember);
          expect(perms).toContain('read');
        });

        it(`${role} with team assignment has read+write on data_sheet_edit`, () => {
          const perms = getPermissions(role, 'data_sheet_edit', teamMember);
          expect(perms).toContain('read');
          expect(perms).toContain('write');
        });

        it(`${role} without team assignment returns empty permissions`, () => {
          const perms = getPermissions(role, 'contract_setup', noAssignment);
          expect(perms).toEqual([]);
        });
      }
    });

    describe('Requirement 9.2: contractor (assigned contractor)', () => {
      it('contractor can write claims', () => {
        const perms = getPermissions('contractor', 'claims', assignedContractor);
        expect(perms).toContain('write');
      });

      it('contractor can write notices (respond)', () => {
        const perms = getPermissions('contractor', 'notices', assignedContractor);
        expect(perms).toContain('write');
      });

      it('contractor can write eot (request)', () => {
        const perms = getPermissions('contractor', 'eot', assignedContractor);
        expect(perms).toContain('write');
      });

      it('contractor can read data_sheet_view', () => {
        const perms = getPermissions('contractor', 'data_sheet_view', assignedContractor);
        expect(perms).toContain('read');
      });

      it('contractor can read variations', () => {
        const perms = getPermissions('contractor', 'variations', assignedContractor);
        expect(perms).toContain('read');
      });

      it('contractor cannot access contract_setup', () => {
        const perms = getPermissions('contractor', 'contract_setup', assignedContractor);
        expect(perms).toEqual([]);
      });

      it('contractor without assignment returns empty', () => {
        const perms = getPermissions('contractor', 'claims', noAssignment);
        expect(perms).toEqual([]);
      });
    });

    describe('Requirement 9.3: subcontractor (assigned subcontractor)', () => {
      it('subcontractor can read data_sheet_view (scope)', () => {
        const perms = getPermissions('subcontractor', 'data_sheet_view', assignedSubcontractor);
        expect(perms).toContain('read');
      });

      it('subcontractor can read claims', () => {
        const perms = getPermissions('subcontractor', 'claims', assignedSubcontractor);
        expect(perms).toContain('read');
      });

      it('subcontractor can read notices', () => {
        const perms = getPermissions('subcontractor', 'notices', assignedSubcontractor);
        expect(perms).toContain('read');
      });

      it('subcontractor cannot write claims directly', () => {
        const perms = getPermissions('subcontractor', 'claims', assignedSubcontractor);
        expect(perms).not.toContain('write');
      });

      it('subcontractor cannot access contract_setup', () => {
        const perms = getPermissions('subcontractor', 'contract_setup', assignedSubcontractor);
        expect(perms).toEqual([]);
      });

      it('subcontractor without assignment returns empty', () => {
        const perms = getPermissions('subcontractor', 'data_sheet_view', noAssignment);
        expect(perms).toEqual([]);
      });
    });

    describe('Requirement 9.4: client, developer (project owner)', () => {
      const roles: UserRole[] = ['client', 'developer'];

      for (const role of roles) {
        it(`${role} can read data_sheet_view (contract status)`, () => {
          const perms = getPermissions(role, 'data_sheet_view', projectOwner);
          expect(perms).toContain('read');
        });

        it(`${role} can approve variations`, () => {
          const perms = getPermissions(role, 'variations', projectOwner);
          expect(perms).toContain('approve');
        });

        it(`${role} can read claims summary`, () => {
          const perms = getPermissions(role, 'claims', projectOwner);
          expect(perms).toContain('read');
        });

        it(`${role} cannot write to contract_setup`, () => {
          const perms = getPermissions(role, 'contract_setup', projectOwner);
          expect(perms).toEqual([]);
        });

        it(`${role} without owner assignment returns empty`, () => {
          const perms = getPermissions(role, 'variations', noAssignment);
          expect(perms).toEqual([]);
        });
      }
    });

    describe('Requirement 9.5: site_manager (assigned site manager)', () => {
      it('site_manager can read+write notices', () => {
        const perms = getPermissions('site_manager', 'notices', assignedSiteManager);
        expect(perms).toContain('read');
        expect(perms).toContain('write');
      });

      it('site_manager can read variations', () => {
        const perms = getPermissions('site_manager', 'variations', assignedSiteManager);
        expect(perms).toContain('read');
      });

      it('site_manager cannot access contract_setup', () => {
        const perms = getPermissions('site_manager', 'contract_setup', assignedSiteManager);
        expect(perms).toEqual([]);
      });

      it('site_manager without assignment returns empty', () => {
        const perms = getPermissions('site_manager', 'notices', noAssignment);
        expect(perms).toEqual([]);
      });
    });

    describe('Requirement 9.6: admin, platform_admin (no assignment needed)', () => {
      const roles: UserRole[] = ['admin', 'platform_admin'];

      for (const role of roles) {
        it(`${role} has full read+write on all features regardless of assignment`, () => {
          const features = [
            'contract_setup',
            'notices',
            'variations',
            'payment_schedule',
            'claims',
            'eot',
            'data_sheet_view',
            'data_sheet_edit',
          ] as const;

          for (const feature of features) {
            const perms = getPermissions(role, feature, noAssignment);
            expect(perms).toContain('read');
            if (feature !== 'data_sheet_view') {
              expect(perms).toContain('write');
            }
          }
        });

        it(`${role} can approve variations`, () => {
          const perms = getPermissions(role, 'variations', noAssignment);
          expect(perms).toContain('approve');
        });
      }
    });

    it('returns empty array for unrecognized roles', () => {
      const perms = getPermissions('freelancer' as UserRole, 'contract_setup', teamMember);
      expect(perms).toEqual([]);
    });
  });

  describe('canAccess', () => {
    it('returns true when user has the required permission', () => {
      expect(canAccess('architect', 'notices', 'write', teamMember)).toBe(true);
    });

    it('returns false when user lacks the required permission', () => {
      expect(canAccess('subcontractor', 'claims', 'write', assignedSubcontractor)).toBe(false);
    });

    it('returns false when user lacks project assignment', () => {
      expect(canAccess('architect', 'notices', 'write', noAssignment)).toBe(false);
    });

    it('returns true for admin without any project assignment', () => {
      expect(canAccess('admin', 'contract_setup', 'write', noAssignment)).toBe(true);
    });
  });

  describe('resolveMultiRolePermissions — Requirement 9.8', () => {
    it('returns union of permissions from multiple roles (least restrictive)', () => {
      // subcontractor can only read claims, contractor can read+write claims
      const assignment = makeAssignment({
        isAssignedContractor: true,
        isAssignedSubcontractor: true,
      });
      const perms = resolveMultiRolePermissions(
        ['subcontractor', 'contractor'],
        'claims',
        assignment
      );
      expect(perms).toContain('read');
      expect(perms).toContain('write');
    });

    it('grants write if any role grants write', () => {
      // site_manager has write on notices, subcontractor only has read
      const assignment = makeAssignment({
        isAssignedSiteManager: true,
        isAssignedSubcontractor: true,
      });
      const perms = resolveMultiRolePermissions(
        ['site_manager', 'subcontractor'],
        'notices',
        assignment
      );
      expect(perms).toContain('write');
      expect(perms).toContain('read');
    });

    it('grants approve if any role grants approve', () => {
      const assignment = makeAssignment({
        isProjectOwner: true,
        isAssignedContractor: true,
      });
      const perms = resolveMultiRolePermissions(
        ['client', 'contractor'],
        'variations',
        assignment
      );
      expect(perms).toContain('approve');
      expect(perms).toContain('read');
    });

    it('returns empty array if no role has any permission for the feature', () => {
      const assignment = makeAssignment({
        isAssignedSubcontractor: true,
        isAssignedSiteManager: true,
      });
      const perms = resolveMultiRolePermissions(
        ['subcontractor', 'site_manager'],
        'contract_setup',
        assignment
      );
      expect(perms).toEqual([]);
    });

    it('deduplicates permissions across roles', () => {
      // Both architect and bep grant read+write on notices
      const assignment = makeAssignment({ isAssignedTeamMember: true });
      const perms = resolveMultiRolePermissions(
        ['architect', 'bep'],
        'notices',
        assignment
      );
      const readCount = perms.filter((p) => p === 'read').length;
      const writeCount = perms.filter((p) => p === 'write').length;
      expect(readCount).toBe(1);
      expect(writeCount).toBe(1);
    });
  });

  describe('assertAccess — Requirement 9.7', () => {
    it('does not throw when access is granted', () => {
      expect(() => {
        assertAccess('architect', 'notices', 'write', teamMember);
      }).not.toThrow();
    });

    it('throws UNAUTHORIZED error when access is denied', () => {
      try {
        assertAccess('subcontractor', 'contract_setup', 'write', assignedSubcontractor);
        expect.fail('should have thrown');
      } catch (err: unknown) {
        const error = err as { code: string; message: string };
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.message).toContain('Access denied');
        expect(error.message).toContain('write');
        expect(error.message).toContain('contract_setup');
      }
    });

    it('throws UNAUTHORIZED when assignment is missing', () => {
      try {
        assertAccess('architect', 'notices', 'write', noAssignment);
        expect.fail('should have thrown');
      } catch (err: unknown) {
        const error = err as { code: string };
        expect(error.code).toBe('UNAUTHORIZED');
      }
    });

    it('supports multi-role array input', () => {
      const assignment = makeAssignment({
        isAssignedContractor: true,
        isAssignedSubcontractor: true,
      });
      expect(() => {
        assertAccess(['subcontractor', 'contractor'], 'claims', 'write', assignment);
      }).not.toThrow();
    });
  });

  describe('DEFAULT_APPROVAL_THRESHOLD — Requirement 9.9', () => {
    it('defaults to 0 (all variations need client/developer approval)', () => {
      expect(DEFAULT_APPROVAL_THRESHOLD).toBe(0);
    });
  });
});
