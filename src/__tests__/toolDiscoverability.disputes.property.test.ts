/**
 * Property-based tests — Dispute visibility scoping for tool discoverability routing.
 *
 * Feature: tool-discoverability-routing
 *
 * **Validates: Requirements 6.2**
 *
 * Tests the dispute visibility invariant:
 * - Property 11: Role-scoped dispute visibility
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Dispute, Job, UserProfile } from '@/types';
import { filterDisputesByRoleScope } from '@/components/DisputeResolutionPage';

/** All valid UserRole values as defined in src/types.ts. */
const ALL_USER_ROLES = [
  'client',
  'architect',
  'admin',
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
  'land_surveyor',
  'health_safety',
] as const;

/** Roles that get job-based visibility (assigned jobs). */
const PROFESSIONAL_ROLES = ['architect', 'bep', 'freelancer'] as const;

/** Roles that get job-based visibility via clientId. */
const CLIENT_ROLES = ['client'] as const;

/** Max disputes in cross-project mode. */
const CROSS_PROJECT_LIMIT = 75;

// --- Arbitraries ---

const userIdArb = fc.stringMatching(/^[a-z0-9]{6,12}$/);

const userRoleArb = fc.constantFrom(...ALL_USER_ROLES);

function disputeArb(userIds: fc.Arbitrary<string>, jobIds: fc.Arbitrary<string>): fc.Arbitrary<Dispute> {
  return fc.record({
    id: fc.uuid(),
    jobId: jobIds,
    filedBy: userIds,
    filedAgainst: userIds,
    reason: fc.constant('Test dispute reason'),
    requestedResolution: fc.constant('Refund requested'),
    status: fc.constantFrom('open', 'in_mediation', 'resolved', 'rejected') as fc.Arbitrary<Dispute['status']>,
    createdAt: fc.constant('2025-01-01T00:00:00Z'),
  });
}

function jobArb(userIds: fc.Arbitrary<string>): fc.Arbitrary<Job> {
  return fc.record({
    id: fc.uuid(),
    clientId: userIds,
    title: fc.constant('Test job'),
    description: fc.constant('A test job description'),
    requirements: fc.constant([]),
    deadline: fc.constant('2025-12-31'),
    budget: fc.nat({ max: 1000000 }),
    category: fc.constantFrom('Residential', 'Commercial', 'Industrial', 'Renovation', 'Interior', 'Landscape') as fc.Arbitrary<Job['category']>,
    status: fc.constantFrom('open', 'in-progress', 'completed', 'cancelled') as fc.Arbitrary<Job['status']>,
    selectedProfessionalId: fc.option(userIds, { nil: undefined }),
    selectedBepId: fc.option(userIds, { nil: undefined }),
    selectedArchitectId: fc.option(userIds, { nil: undefined }),
    createdAt: fc.constant('2025-01-01T00:00:00Z'),
  });
}

function userProfileArb(role: typeof ALL_USER_ROLES[number], uid: string): UserProfile {
  return {
    uid,
    email: `${uid}@test.com`,
    displayName: `User ${uid}`,
    role,
    createdAt: '2025-01-01T00:00:00Z',
  };
}

describe('Feature: tool-discoverability-routing, Property 11: Role-scoped dispute visibility', () => {
  it('admin role always sees all disputes (up to 75)', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * For any admin user, filterDisputesByRoleScope returns all disputes
     * (capped at CROSS_PROJECT_LIMIT = 75).
     */
    const userIds = userIdArb;
    const jobIds = fc.uuid();

    fc.assert(
      fc.property(
        fc.array(disputeArb(userIds, jobIds), { minLength: 0, maxLength: 100 }),
        fc.array(jobArb(userIds), { minLength: 0, maxLength: 20 }),
        userIdArb,
        (disputes, jobs, uid) => {
          const user = userProfileArb('admin', uid);
          const result = filterDisputesByRoleScope(disputes, jobs, user);

          // Admin sees all disputes capped at 75
          expect(result.length).toBe(Math.min(disputes.length, CROSS_PROJECT_LIMIT));
          // Every returned dispute is from the input
          for (const d of result) {
            expect(disputes).toContainEqual(d);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('client role only sees disputes on their jobs or filed by/against them', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * For any client user, visible disputes are limited to those on jobs
     * where they are clientId, OR disputes filed by/against them.
     */
    const userIds = userIdArb;
    const jobIds = fc.uuid();

    fc.assert(
      fc.property(
        fc.array(disputeArb(userIds, jobIds), { minLength: 0, maxLength: 100 }),
        fc.array(jobArb(userIds), { minLength: 0, maxLength: 20 }),
        userIdArb,
        (disputes, jobs, uid) => {
          const user = userProfileArb('client', uid);
          const result = filterDisputesByRoleScope(disputes, jobs, user);

          // Compute expected visibility
          const clientJobIds = new Set(
            jobs.filter((j) => j.clientId === uid).map((j) => j.id),
          );

          for (const dispute of result) {
            const isOnClientJob = clientJobIds.has(dispute.jobId);
            const isFiledByUser = dispute.filedBy === uid;
            const isFiledAgainstUser = dispute.filedAgainst === uid;
            expect(isOnClientJob || isFiledByUser || isFiledAgainstUser).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('architect/bep/freelancer roles only see disputes on their assigned jobs or filed by/against them', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * For architect/bep/freelancer users, visible disputes are limited to
     * those on jobs where they are assigned (selectedProfessionalId/selectedBepId/selectedArchitectId)
     * OR disputes filed by/against them.
     */
    const userIds = userIdArb;
    const jobIds = fc.uuid();

    fc.assert(
      fc.property(
        fc.constantFrom(...PROFESSIONAL_ROLES),
        fc.array(disputeArb(userIds, jobIds), { minLength: 0, maxLength: 100 }),
        fc.array(jobArb(userIds), { minLength: 0, maxLength: 20 }),
        userIdArb,
        (role, disputes, jobs, uid) => {
          const user = userProfileArb(role, uid);
          const result = filterDisputesByRoleScope(disputes, jobs, user);

          // Compute expected assigned job IDs
          const assignedJobIds = new Set(
            jobs
              .filter(
                (j) =>
                  j.selectedProfessionalId === uid ||
                  j.selectedBepId === uid ||
                  j.selectedArchitectId === uid,
              )
              .map((j) => j.id),
          );

          for (const dispute of result) {
            const isOnAssignedJob = assignedJobIds.has(dispute.jobId);
            const isFiledByUser = dispute.filedBy === uid;
            const isFiledAgainstUser = dispute.filedAgainst === uid;
            expect(isOnAssignedJob || isFiledByUser || isFiledAgainstUser).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('other roles only see disputes they filed or filed against them', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * For roles that are not admin, client, architect, bep, or freelancer,
     * visible disputes are limited to those where the user is filedBy or filedAgainst.
     */
    const otherRoles = ALL_USER_ROLES.filter(
      (r) => r !== 'admin' && r !== 'client' && !PROFESSIONAL_ROLES.includes(r as any),
    );
    const userIds = userIdArb;
    const jobIds = fc.uuid();

    fc.assert(
      fc.property(
        fc.constantFrom(...otherRoles),
        fc.array(disputeArb(userIds, jobIds), { minLength: 0, maxLength: 100 }),
        fc.array(jobArb(userIds), { minLength: 0, maxLength: 20 }),
        userIdArb,
        (role, disputes, jobs, uid) => {
          const user = userProfileArb(role, uid);
          const result = filterDisputesByRoleScope(disputes, jobs, user);

          for (const dispute of result) {
            const isFiledByUser = dispute.filedBy === uid;
            const isFiledAgainstUser = dispute.filedAgainst === uid;
            expect(isFiledByUser || isFiledAgainstUser).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('result is always ≤75 records regardless of role or input size', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * For any user and dispute set, the filtered result never exceeds
     * the CROSS_PROJECT_LIMIT of 75 records.
     */
    const userIds = userIdArb;
    const jobIds = fc.uuid();

    fc.assert(
      fc.property(
        userRoleArb,
        fc.array(disputeArb(userIds, jobIds), { minLength: 0, maxLength: 150 }),
        fc.array(jobArb(userIds), { minLength: 0, maxLength: 30 }),
        userIdArb,
        (role, disputes, jobs, uid) => {
          const user = userProfileArb(role, uid);
          const result = filterDisputesByRoleScope(disputes, jobs, user);
          expect(result.length).toBeLessThanOrEqual(CROSS_PROJECT_LIMIT);
        },
      ),
      { numRuns: 100 },
    );
  });
});
