/**
 * Property-based tests — Role RBAC Drift Fix
 *
 * Feature: role-rbac-drift-fix
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * Bug Condition Exploration:
 * - Asserts 'cpm' is included in CANONICAL_USER_ROLES
 * - Asserts UserRoleEnum.safeParse('cpm').success returns true
 * - Asserts 'cpm' is accepted as a valid key in Record<UserRole, ...> contexts (type-level)
 *
 * CRITICAL: This test MUST FAIL on unfixed code — failure confirms the bug exists.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CANONICAL_USER_ROLES, normalizeUserRole } from '@/services/permissionService';
import { UserRoleEnum } from '@/lib/schemas';
import type { UserRole } from '@/types';

describe('Role RBAC Drift — Bug Condition Exploration', () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3**
   *
   * Property: 'cpm' must be a recognized canonical user role.
   * On unfixed code this FAILS because 'cpm' is missing from UserRole,
   * CANONICAL_USER_ROLES, and UserRoleEnum.
   */
  it('cpm is included in CANONICAL_USER_ROLES', () => {
    fc.assert(
      fc.property(fc.constant('cpm'), (role) => {
        expect((CANONICAL_USER_ROLES as readonly string[]).includes(role)).toBe(true);
      }),
      { numRuns: 1 }
    );
  });

  it('UserRoleEnum.safeParse(cpm) succeeds', () => {
    fc.assert(
      fc.property(fc.constant('cpm'), (role) => {
        const result = UserRoleEnum.safeParse(role);
        expect(result.success).toBe(true);
      }),
      { numRuns: 1 }
    );
  });

  it('cpm is accepted as a valid key in Record<UserRole, ...> context', () => {
    // Type-level assertion: if 'cpm' is in UserRole, this compiles.
    // At runtime we verify the role string is assignable to UserRole via the Zod schema.
    fc.assert(
      fc.property(fc.constant('cpm'), (role) => {
        // Runtime check that 'cpm' can be used as a UserRole value
        const parsed = UserRoleEnum.safeParse(role);
        expect(parsed.success).toBe(true);

        if (parsed.success) {
          // Simulate Record<UserRole, string> key usage
          const record: Partial<Record<UserRole, string>> = {};
          record[parsed.data as UserRole] = 'Construction Project Manager';
          expect(record[parsed.data as UserRole]).toBe('Construction Project Manager');
        }
      }),
      { numRuns: 1 }
    );
  });
});

describe('Role RBAC Drift — Preservation (Existing 19 Roles)', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
   *
   * The 19 existing canonical roles that must remain valid after any fix.
   */
  const EXISTING_19_ROLES = [
    'client',
    'architect',
    'freelancer',
    'bep',
    'contractor',
    'subcontractor',
    'supplier',
    'engineer',
    'quantity_surveyor',
    'town_planner',
    'energy_professional',
    'fire_engineer',
    'site_manager',
    'developer',
    'firm_admin',
    'platform_admin',
    'admin',
    'land_surveyor',
    'health_safety',
  ] as const;

  /**
   * **Validates: Requirements 3.4, 3.7**
   *
   * Property: For all 19 existing canonical roles, UserRoleEnum.safeParse(role).success === true
   */
  it('all 19 existing roles are accepted by UserRoleEnum', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXISTING_19_ROLES),
        (role) => {
          const result = UserRoleEnum.safeParse(role);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.4, 3.6**
   *
   * Property: For all 19 existing canonical roles, CANONICAL_USER_ROLES.includes(role) === true
   */
  it('all 19 existing roles are included in CANONICAL_USER_ROLES', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXISTING_19_ROLES),
        (role) => {
          expect((CANONICAL_USER_ROLES as readonly string[]).includes(role)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.5**
   *
   * Property: NormalizedUserRole excludes 'architect'
   * We verify this by checking that normalizing 'architect' maps to 'bep', not 'architect'.
   */
  it('NormalizedUserRole excludes architect (architect normalizes to bep)', () => {
    fc.assert(
      fc.property(fc.constant('architect'), (role) => {
        const normalized = normalizeUserRole(role);
        // architect is excluded from NormalizedUserRole — it normalizes to 'bep'
        expect(normalized).toBe('bep');
        expect(normalized).not.toBe('architect');
      }),
      { numRuns: 1 }
    );
  });

  /**
   * **Validates: Requirements 3.4, 3.7**
   *
   * Property: For random strings NOT in the canonical role set,
   * UserRoleEnum.safeParse(randomString).success === false
   */
  it('random strings not in canonical roles are rejected by UserRoleEnum', () => {
    const canonicalSet = new Set<string>(CANONICAL_USER_ROLES as unknown as string[]);

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !canonicalSet.has(s)),
        (randomString) => {
          const result = UserRoleEnum.safeParse(randomString);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 3.6, 3.7**
   *
   * Property: UserRoleEnum.options set-equals CANONICAL_USER_ROLES (alignment check)
   */
  it('UserRoleEnum.options set-equals CANONICAL_USER_ROLES', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const enumOptions = new Set(UserRoleEnum.options);
        const canonicalRoles = new Set(CANONICAL_USER_ROLES as unknown as string[]);

        // Every enum option must be in canonical roles
        for (const opt of enumOptions) {
          expect(canonicalRoles.has(opt)).toBe(true);
        }
        // Every canonical role must be in enum options
        for (const role of canonicalRoles) {
          expect(enumOptions.has(role)).toBe(true);
        }
        // Sets must have equal size
        expect(enumOptions.size).toBe(canonicalRoles.size);
      }),
      { numRuns: 1 }
    );
  });
});
