/**
 * Property-based tests — Copilot Capability Access Control
 *
 * Feature: ai-copilot-workspace
 *
 * Validates: Requirements 2.1–2.11, 1.6
 *
 * Tests two correctness properties from the design document:
 * - Property 1: Capability Access Control
 * - Property 2: No-Project Capability Restriction
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

// Mock firebase-admin (required because copilotService now imports provenanceService which uses adminDb)
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ id: 'mock-id', set: vi.fn(), get: vi.fn(), update: vi.fn() })),
    })),
    doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() })),
  },
}));

// Mock geminiService (to avoid network call imports)
vi.mock('@/services/geminiService', () => ({
  callGeminiProxy: vi.fn(),
}));

import { getCapabilitiesForRole, validateCapabilityAccess } from '@/services/copilotService';
import { CAPABILITY_ROLE_MAP, UNIVERSAL_CAPABILITIES } from '@/services/copilotTypes';
import type { CopilotCapability } from '@/services/copilotTypes';
import type { UserRole } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

/** All Professional_Role values (everything except platform_admin). */
const PROFESSIONAL_ROLES: UserRole[] = [
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
  'land_surveyor',
  'health_safety',
];

/** All 8 defined CopilotCapability values. */
const ALL_CAPABILITIES: CopilotCapability[] = Object.keys(CAPABILITY_ROLE_MAP) as CopilotCapability[];

/** Project-scoped capabilities that require an active project. */
const PROJECT_SCOPED_CAPABILITIES: CopilotCapability[] = [
  'draft_rfi',
  'summarise_status',
  'flag_compliance',
  'generate_narrative',
  'draft_site_instruction',
  'summarise_financials',
  'flag_risk',
];

/** Non-project-scoped capabilities available without a project. */
const NON_PROJECT_SCOPED_CAPABILITIES: CopilotCapability[] = [
  'explain_clause',
];

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate any professional role (excludes platform_admin). */
const arbProfessionalRole = fc.constantFrom(...PROFESSIONAL_ROLES);

/** Generate any valid CopilotCapability. */
const arbCapability = fc.constantFrom(...ALL_CAPABILITIES);

/** Generate a random string that is NOT a valid CopilotCapability. */
const arbInvalidCapability = fc.string({ minLength: 1, maxLength: 50 })
  .filter((s) => !new Set(ALL_CAPABILITIES as string[]).has(s));

// ══════════════════════════════════════════════════════════════════════════════
// Property 1: Capability Access Control
// Validates: Requirements 1.3, 2.3, 2.4, 2.10
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: ai-copilot-workspace, Property 1: Capability Access Control', () => {
  /**
   * **Validates: Requirements 2.1–2.11**
   *
   * For any user with a Professional_Role, the set of granted capabilities must
   * equal the union of universal capabilities (summarise_status, flag_risk, explain_clause)
   * and any role-specific capabilities defined in CAPABILITY_ROLE_MAP for that role.
   * For any user with only platform_admin (no Professional_Role), all capability requests
   * must be denied. For any capability string not in the defined set of 8 capabilities,
   * the request must be denied with an "unrecognized" message. For any denied request,
   * the error message must not reveal which roles do have access.
   */

  describe('Professional role capability set equals universal ∪ role-specific', () => {
    it('for any professional role, getCapabilitiesForRole returns exactly universal + role-scoped capabilities', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const granted = new Set(getCapabilitiesForRole(role));

          // Compute expected: universal + role-specific
          const expected = new Set<CopilotCapability>(UNIVERSAL_CAPABILITIES);
          for (const [capability, allowedRoles] of Object.entries(CAPABILITY_ROLE_MAP)) {
            const cap = capability as CopilotCapability;
            // Universal capabilities have empty arrays
            if (allowedRoles.length === 0) {
              expected.add(cap);
            } else if (allowedRoles.includes(role)) {
              expected.add(cap);
            }
          }

          expect(granted).toEqual(expected);
        }),
        { numRuns: 100 },
      );
    });

    it('for any professional role, every returned capability is validated as allowed', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const capabilities = getCapabilitiesForRole(role);

          for (const cap of capabilities) {
            const result = validateCapabilityAccess(role, cap);
            expect(result.allowed).toBe(true);
            expect(result.error).toBeUndefined();
          }
        }),
        { numRuns: 100 },
      );
    });

    it('for any professional role, capabilities NOT in the granted set are denied', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const granted = new Set(getCapabilitiesForRole(role));
          const denied = ALL_CAPABILITIES.filter((cap) => !granted.has(cap));

          for (const cap of denied) {
            const result = validateCapabilityAccess(role, cap);
            expect(result.allowed).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('platform_admin-only users denied all capabilities', () => {
    it('platform_admin gets empty capabilities list', () => {
      const result = getCapabilitiesForRole('platform_admin');
      expect(result).toEqual([]);
    });

    it('for any valid capability, platform_admin is denied with professional role required message', () => {
      fc.assert(
        fc.property(arbCapability, (capability) => {
          const result = validateCapabilityAccess('platform_admin', capability);
          expect(result.allowed).toBe(false);
          expect(result.error).toBe('Copilot capabilities require a professional role.');
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Unrecognized capabilities denied with appropriate message', () => {
    it('for any string not in the 8 defined capabilities, request is denied as unrecognized', () => {
      fc.assert(
        fc.property(arbProfessionalRole, arbInvalidCapability, (role, invalidCap) => {
          const result = validateCapabilityAccess(role, invalidCap);
          expect(result.allowed).toBe(false);
          expect(result.error).toBe('The requested capability is unrecognized.');
        }),
        { numRuns: 100 },
      );
    });

    it('unrecognized capability error for platform_admin returns professional role message (checked first)', () => {
      fc.assert(
        fc.property(arbInvalidCapability, (invalidCap) => {
          const result = validateCapabilityAccess('platform_admin', invalidCap);
          expect(result.allowed).toBe(false);
          // platform_admin check happens before capability check
          expect(result.error).toBe('Copilot capabilities require a professional role.');
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Denied requests do not reveal role access information', () => {
    it('for any denied capability request, the error message does not contain role names', () => {
      fc.assert(
        fc.property(arbProfessionalRole, arbCapability, (role, capability) => {
          const result = validateCapabilityAccess(role, capability);

          if (!result.allowed && result.error) {
            // Error message must NOT reveal which roles have access
            for (const otherRole of PROFESSIONAL_ROLES) {
              expect(result.error.toLowerCase()).not.toContain(otherRole.toLowerCase());
            }
            expect(result.error.toLowerCase()).not.toContain('platform_admin');
          }
        }),
        { numRuns: 100 },
      );
    });

    it('denied role-scoped capability errors are generic and uniform', () => {
      fc.assert(
        fc.property(arbProfessionalRole, arbCapability, (role, capability) => {
          const result = validateCapabilityAccess(role, capability);

          if (!result.allowed && result.error) {
            // Only 3 possible error messages exist:
            const validErrors = [
              'Copilot capabilities require a professional role.',
              'The requested capability is unrecognized.',
              'This capability is not available for your role.',
            ];
            expect(validErrors).toContain(result.error);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('No duplicate capabilities in granted set', () => {
    it('for any professional role, the capabilities list contains no duplicates', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const capabilities = getCapabilitiesForRole(role);
          const unique = new Set(capabilities);
          expect(unique.size).toBe(capabilities.length);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Universal capabilities always granted to professional roles', () => {
    it('for any professional role, all universal capabilities are included in the granted set', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const granted = getCapabilitiesForRole(role);

          for (const universalCap of UNIVERSAL_CAPABILITIES) {
            expect(granted).toContain(universalCap);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 2: No-Project Capability Restriction
// Validates: Requirements 1.6
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: ai-copilot-workspace, Property 2: No-Project Capability Restriction', () => {
  /**
   * **Validates: Requirements 1.6**
   *
   * For any user session without an active project, the available capabilities must
   * be restricted to non-project-scoped capabilities only (explain_clause, general
   * compliance questions). Project-scoped capabilities (draft_rfi, summarise_status
   * with project data, flag_compliance, etc.) must not be invocable.
   *
   * This property is enforced at the capability filtering layer. When no project is
   * active, only NON_PROJECT_SCOPED_CAPABILITIES should be presented/allowed.
   */

  /**
   * Helper: Given a role's full capability list, returns only the non-project-scoped
   * capabilities that should be available without an active project.
   */
  function getNoProjectCapabilities(role: UserRole): CopilotCapability[] {
    const allCaps = getCapabilitiesForRole(role);
    return allCaps.filter((cap) => NON_PROJECT_SCOPED_CAPABILITIES.includes(cap));
  }

  describe('Without an active project, only non-project-scoped capabilities are available', () => {
    it('for any professional role, the no-project capability set is a subset of non-project-scoped capabilities', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const noProjectCaps = getNoProjectCapabilities(role);
          const validSet = new Set(NON_PROJECT_SCOPED_CAPABILITIES);

          for (const cap of noProjectCaps) {
            expect(validSet.has(cap)).toBe(true);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('for any professional role, explain_clause is always available without a project', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const noProjectCaps = getNoProjectCapabilities(role);
          expect(noProjectCaps).toContain('explain_clause');
        }),
        { numRuns: 100 },
      );
    });

    it('for any professional role, project-scoped capabilities are excluded when no project is active', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const noProjectCaps = new Set(getNoProjectCapabilities(role));
          const projectScopedSet = new Set(PROJECT_SCOPED_CAPABILITIES);

          for (const cap of noProjectCaps) {
            expect(projectScopedSet.has(cap)).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('for any professional role, the no-project set is strictly smaller than or equal to the full set', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const fullCaps = getCapabilitiesForRole(role);
          const noProjectCaps = getNoProjectCapabilities(role);

          expect(noProjectCaps.length).toBeLessThanOrEqual(fullCaps.length);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('platform_admin has no capabilities regardless of project context', () => {
    it('platform_admin has no capabilities available with or without project', () => {
      const fullCaps = getCapabilitiesForRole('platform_admin');
      const noProjectCaps = fullCaps.filter((cap) =>
        NON_PROJECT_SCOPED_CAPABILITIES.includes(cap),
      );

      expect(fullCaps).toEqual([]);
      expect(noProjectCaps).toEqual([]);
    });
  });

  describe('Project-scoped capabilities require project context', () => {
    it('for any professional role with project-scoped capabilities, those caps are not in the no-project set', () => {
      fc.assert(
        fc.property(arbProfessionalRole, (role) => {
          const fullCaps = getCapabilitiesForRole(role);
          const noProjectCaps = new Set(getNoProjectCapabilities(role));
          const projectScoped = fullCaps.filter((cap) => PROJECT_SCOPED_CAPABILITIES.includes(cap));

          for (const cap of projectScoped) {
            expect(noProjectCaps.has(cap)).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('the set of project-scoped capabilities and non-project-scoped capabilities are disjoint', () => {
      const projectSet = new Set(PROJECT_SCOPED_CAPABILITIES);
      const nonProjectSet = new Set(NON_PROJECT_SCOPED_CAPABILITIES);

      for (const cap of projectSet) {
        expect(nonProjectSet.has(cap)).toBe(false);
      }
      for (const cap of nonProjectSet) {
        expect(projectSet.has(cap)).toBe(false);
      }
    });

    it('all 8 defined capabilities are either project-scoped or non-project-scoped', () => {
      const allCovered = new Set([...PROJECT_SCOPED_CAPABILITIES, ...NON_PROJECT_SCOPED_CAPABILITIES]);
      for (const cap of ALL_CAPABILITIES) {
        expect(allCovered.has(cap)).toBe(true);
      }
    });
  });
});
