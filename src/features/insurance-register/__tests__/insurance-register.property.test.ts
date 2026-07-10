// @vitest-environment node
//
// Feature: p1-platform-extensions, Properties 2-6: Insurance Register
//
// Property 2: Policy Expiry Notification Thresholds — Validates: Requirements 1.3, 1.4, 1.5
// Property 3: Insurance Compliance Determination — Validates: Requirements 2.1, 2.2, 2.3, 2.4
// Property 4: Claims Notification State Machine — Validates: Requirements 3.2
// Property 5: Claims Notification Deadline Calculation — Validates: Requirements 3.3, 3.4, 3.5
// Property 6: Claims Summary Aggregation — Validates: Requirements 3.8

import * as fc from 'fast-check';
import { createInsuranceRegisterService } from '../services/insuranceRegisterService';
import { createClaimsNotificationService } from '../services/claimsNotificationService';
import { createPolicyCheckerService } from '../services/policyCheckerService';
import type {
  InsurancePolicy,
  InsurancePolicyType,
  ClaimNotificationStatus,
  ContractForm,
  ContractDataSheet,
} from '../types';

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a valid ISO date string between 2024-01-01 and 2027-12-28 */
const dateArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 2024, max: 2027 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

/** Generate a policy type */
const policyTypeArb: fc.Arbitrary<InsurancePolicyType> = fc.constantFrom(
  'CAR', 'PI', 'public_liability', 'SASRIA', 'LDI',
);

/** Generate a claim notification status */
const claimStatusArb: fc.Arbitrary<ClaimNotificationStatus> = fc.constantFrom(
  'reported',
  'notified_to_insurer',
  'under_investigation',
  'claim_lodged',
  'settled',
  'rejected',
  'withdrawn',
);

/** Generate a contract form */
const contractFormArb: fc.Arbitrary<ContractForm> = fc.constantFrom(
  'JBCC_PBA', 'NEC_ECC', 'GCC_2025', 'FIDIC',
);

/** Generate a positive sum insured value */
const sumInsuredArb: fc.Arbitrary<number> = fc.integer({ min: 100, max: 999_999_999 });

/** Generate days-until-expiry values covering all thresholds */
const daysUntilExpiryArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 120 });

/** Generate a custom notification period (1–60 days) */
const customPeriodArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 60 });

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

function addCalendarDays(isoDate: string, days: number): string {
  const date = new Date(isoDate + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffCalendarDays(from: string, to: string): number {
  const fromDate = new Date(from + 'T00:00:00Z');
  const toDate = new Date(to + 'T00:00:00Z');
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

/** Get a sequence of transitions to reach a target state from 'reported' */
function getPathToState(target: ClaimNotificationStatus): ClaimNotificationStatus[] {
  if (target === 'reported') return [];
  if (target === 'notified_to_insurer') return ['notified_to_insurer'];
  if (target === 'under_investigation') return ['notified_to_insurer', 'under_investigation'];
  if (target === 'claim_lodged') return ['notified_to_insurer', 'under_investigation', 'claim_lodged'];
  if (target === 'settled') return ['notified_to_insurer', 'under_investigation', 'claim_lodged', 'settled'];
  if (target === 'rejected') return ['notified_to_insurer', 'under_investigation', 'claim_lodged', 'rejected'];
  if (target === 'withdrawn') return ['withdrawn'];
  return [];
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 2: Policy Expiry Notification Thresholds
// **Validates: Requirements 1.3, 1.4, 1.5**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 2: Policy Expiry Notification Thresholds', () => {
  it('notifications fire at exactly 60, 30, and 14 days before expiry and at no other time', async () => {
    await fc.assert(
      fc.asyncProperty(daysUntilExpiryArb, policyTypeArb, async (daysUntilExpiry, policyType) => {
        const notifications: Array<{ threshold: number; daysUntilExpiry: number }> = [];

        const today = '2025-06-15';
        const expiryDate = addCalendarDays(today, daysUntilExpiry);
        const inceptionDate = '2024-01-01';

        // Only test valid policies where expiry is after inception
        if (expiryDate <= inceptionDate) return;

        const service = createInsuranceRegisterService({
          now: () => new Date(today + 'T00:00:00Z'),
          onExpiryNotification: (notification) => {
            notifications.push({
              threshold: notification.threshold,
              daysUntilExpiry: notification.daysUntilExpiry,
            });
          },
        });

        // Register a policy
        await service.registerPolicy(
          'proj-1',
          {
            projectId: 'proj-1',
            policyType,
            insurerName: 'Test Insurer',
            policyNumber: `POL-${daysUntilExpiry}`,
            policyholderName: 'Test Holder',
            inceptionDate,
            expiryDate,
            sumInsured: 10_000_000,
            excessAmount: 50_000,
            brokerContactName: 'Broker A',
            brokerEmail: 'broker@test.co.za',
            createdBy: 'actor-1',
          },
          'actor-1',
        );

        await service.processExpiryNotifications('proj-1');

        const expectedThresholds = [60, 30, 14];

        if (expectedThresholds.includes(daysUntilExpiry)) {
          // Should have fired a notification at the matching threshold
          expect(notifications.length).toBeGreaterThan(0);
          for (const n of notifications) {
            expect(n.daysUntilExpiry).toBe(daysUntilExpiry);
            expect(n.threshold).toBe(daysUntilExpiry);
          }
        } else {
          // No notifications should fire for non-threshold days
          expect(notifications.length).toBe(0);
        }
      }),
      { numRuns: 120 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 3: Insurance Compliance Determination
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 3: Insurance Compliance Determination', () => {
  const CONTRACT_FORM_REQUIREMENTS: Record<ContractForm, InsurancePolicyType[]> = {
    JBCC_PBA: ['CAR', 'public_liability'],
    NEC_ECC: ['CAR', 'public_liability', 'PI'],
    GCC_2025: ['CAR', 'public_liability'],
    FIDIC: ['CAR', 'public_liability', 'PI'],
  };

  it('compliance per type is correctly determined based on policy status and sum insured', async () => {
    await fc.assert(
      fc.asyncProperty(
        contractFormArb,
        fc.array(
          fc.record({
            policyType: policyTypeArb,
            sumInsured: sumInsuredArb,
            daysUntilExpiry: fc.integer({ min: -30, max: 200 }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        fc.boolean(),
        fc.boolean(),
        async (contractForm, policyDefs, sasriaRequired, ldiRequired) => {
          const todayStr = '2025-06-15';
          const today = new Date(todayStr + 'T00:00:00Z');

          // Build policies array
          const policies: InsurancePolicy[] = policyDefs.map((def, i) => {
            const expiryDate = addCalendarDays(todayStr, def.daysUntilExpiry);
            const isExpired = def.daysUntilExpiry <= 0;
            return {
              id: `pol-${i}`,
              projectId: 'proj-1',
              policyType: def.policyType,
              insurerName: 'Insurer',
              policyNumber: `POL-${i}`,
              policyholderName: 'Holder',
              inceptionDate: '2024-01-01',
              expiryDate,
              sumInsured: def.sumInsured,
              excessAmount: 10_000,
              brokerContactName: 'Broker',
              brokerEmail: 'b@t.co.za',
              status: isExpired ? 'expired' : 'active',
              createdBy: 'actor',
              createdAt: '2024-01-01',
              updatedAt: '2024-01-01',
            };
          });

          const minimumSumInsured: Partial<Record<InsurancePolicyType, number>> = {
            CAR: 5_000_000,
            PI: 2_000_000,
            public_liability: 1_000_000,
            SASRIA: 1_000_000,
            LDI: 500_000,
          };

          const contractDataSheet: ContractDataSheet = {
            contractForm,
            minimumSumInsured,
            sasriaRequired,
            ldiRequired,
          };

          const checker = createPolicyCheckerService({
            getPolicies: async () => policies,
            getContractDataSheet: async () => contractDataSheet,
            now: () => today,
          });

          const summary = await checker.checkCompliance('proj-1');

          // Determine required types
          const requiredTypes = [...CONTRACT_FORM_REQUIREMENTS[contractForm]];
          if (sasriaRequired && !requiredTypes.includes('SASRIA')) requiredTypes.push('SASRIA');
          if (ldiRequired && !requiredTypes.includes('LDI')) requiredTypes.push('LDI');

          // Verify each required type
          for (const reqType of requiredTypes) {
            const result = summary.results.find(r => r.policyType === reqType);
            expect(result).toBeDefined();
            if (!result) continue;

            const activePoliciesOfType = policies.filter(
              p => p.policyType === reqType && p.status === 'active'
            );

            if (activePoliciesOfType.length === 0) {
              expect(result.status).toBe('non_compliant');
            } else {
              const bestPolicy = activePoliciesOfType.reduce((a, b) =>
                b.sumInsured > a.sumInsured ? b : a
              );
              const minRequired = minimumSumInsured[reqType] ?? null;

              if (minRequired !== null && bestPolicy.sumInsured < minRequired) {
                expect(result.status).toBe('non_compliant');
              } else {
                const daysToExpiry = diffCalendarDays(todayStr, bestPolicy.expiryDate);
                if (daysToExpiry <= 0) {
                  expect(result.status).toBe('non_compliant');
                } else if (daysToExpiry <= 60) {
                  expect(result.status).toBe('expiring_soon');
                } else {
                  expect(result.status).toBe('compliant');
                }
              }
            }
          }

          // Overall status: 'compliant' only when ALL required types individually compliant
          if (summary.results.length > 0) {
            const allCompliant = summary.results.every(r => r.status === 'compliant');
            const noneCompliant = summary.results.every(r => r.status === 'non_compliant');

            if (allCompliant) {
              expect(summary.overallStatus).toBe('compliant');
            } else if (noneCompliant) {
              expect(summary.overallStatus).toBe('non_compliant');
            } else {
              expect(summary.overallStatus).toBe('partially_compliant');
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 4: Claims Notification State Machine
// **Validates: Requirements 3.2**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 4: Claims Notification State Machine', () => {
  const PERMITTED_TRANSITIONS: Record<ClaimNotificationStatus, ClaimNotificationStatus[]> = {
    reported: ['notified_to_insurer', 'withdrawn'],
    notified_to_insurer: ['under_investigation', 'withdrawn'],
    under_investigation: ['claim_lodged', 'withdrawn'],
    claim_lodged: ['settled', 'rejected', 'withdrawn'],
    settled: [],
    rejected: [],
    withdrawn: [],
  };

  it('transition succeeds iff target is permitted; terminal states permit no transitions', async () => {
    await fc.assert(
      fc.asyncProperty(claimStatusArb, claimStatusArb, async (currentState, targetState) => {
        const service = createClaimsNotificationService({
          now: () => '2025-06-15',
        });

        const projectId = 'proj-sm';

        // Register a claim
        const claim = await service.registerClaim(
          projectId,
          {
            projectId,
            incidentDate: '2025-06-01',
            discoveryDate: '2025-06-01',
            affectedPolicyId: 'pol-1',
            affectedPolicyType: 'CAR',
            description: 'Test claim for state machine property',
            estimatedLoss: 100_000,
            locationOnSite: 'Site A',
            evidenceRefs: [],
            createdBy: 'actor-1',
          },
          'actor-1',
        );

        // Walk the claim to currentState using valid transitions
        const path = getPathToState(currentState);
        let current = claim;
        for (const step of path) {
          current = await service.transitionStatus(projectId, current.id, step, 'actor-1');
        }

        // Now attempt the target transition
        const permitted = PERMITTED_TRANSITIONS[currentState];
        const shouldSucceed = permitted.includes(targetState);

        try {
          await service.transitionStatus(projectId, current.id, targetState, 'actor-1');
          // Transition succeeded
          expect(shouldSucceed).toBe(true);
        } catch (_e) {
          // Transition was rejected
          expect(shouldSucceed).toBe(false);
        }
      }),
      { numRuns: 150 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 5: Claims Notification Deadline Calculation
// **Validates: Requirements 3.3, 3.4, 3.5**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 5: Claims Notification Deadline Calculation', () => {
  it('deadline = min(incident + 30 days, incident + custom period); overdue detection correct', async () => {
    await fc.assert(
      fc.asyncProperty(
        dateArb,
        fc.option(customPeriodArb, { nil: undefined }),
        fc.integer({ min: 0, max: 90 }),
        async (incidentDate, customPeriod, daysSinceIncident) => {
          const today = addCalendarDays(incidentDate, daysSinceIncident);

          const service = createClaimsNotificationService({
            now: () => today,
            getNotificationPeriod: customPeriod !== undefined
              ? (_policyId: string) => customPeriod
              : undefined,
          });

          const projectId = 'proj-dl';

          const claim = await service.registerClaim(
            projectId,
            {
              projectId,
              incidentDate,
              discoveryDate: incidentDate,
              affectedPolicyId: 'pol-1',
              affectedPolicyType: 'CAR',
              description: 'Claim for deadline property test',
              estimatedLoss: 50_000,
              locationOnSite: 'Location A',
              evidenceRefs: [],
              createdBy: 'actor-1',
            },
            'actor-1',
          );

          // Verify deadline calculation: min(incident + 30, incident + customPeriod)
          const defaultDeadline = addCalendarDays(incidentDate, 30);
          let expectedDeadline: string;

          if (customPeriod !== undefined && customPeriod > 0) {
            const customDeadline = addCalendarDays(incidentDate, customPeriod);
            expectedDeadline = customDeadline < defaultDeadline ? customDeadline : defaultDeadline;
          } else {
            expectedDeadline = defaultDeadline;
          }

          expect(claim.notificationDeadline).toBe(expectedDeadline);

          // Verify overdue detection
          const overdue = await service.getOverdueNotifications(projectId);
          const isOverdue = today > expectedDeadline && claim.status === 'reported';

          if (isOverdue) {
            expect(overdue.some(o => o.id === claim.id)).toBe(true);
          } else {
            expect(overdue.some(o => o.id === claim.id)).toBe(false);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 6: Claims Summary Aggregation
// **Validates: Requirements 3.8**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 6: Claims Summary Aggregation', () => {
  const claimDescriptorArb = fc.record({
    policyType: policyTypeArb,
    estimatedLoss: fc.double({ min: 0.01, max: 100_000, noNaN: true }),
    status: claimStatusArb,
  });

  it('summary aggregates correctly: totalByPolicyType, totalEstimatedLoss, countByStatus, totalSettledAmount', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(claimDescriptorArb, { minLength: 1, maxLength: 20 }),
        async (claimDescriptors) => {
          const service = createClaimsNotificationService({
            now: () => '2025-06-15',
          });

          const projectId = 'proj-agg';

          // Register all claims and transition to desired status
          const registeredClaims = [];
          for (let i = 0; i < claimDescriptors.length; i++) {
            const desc = claimDescriptors[i];
            const claim = await service.registerClaim(
              projectId,
              {
                projectId,
                incidentDate: '2025-06-01',
                discoveryDate: '2025-06-01',
                affectedPolicyId: `pol-${i}`,
                affectedPolicyType: desc.policyType,
                description: `Claim ${i}`,
                estimatedLoss: desc.estimatedLoss,
                locationOnSite: `Location ${i}`,
                evidenceRefs: [],
                createdBy: 'actor-1',
              },
              'actor-1',
            );

            // Transition to the desired status if not 'reported'
            if (desc.status !== 'reported') {
              const path = getPathToState(desc.status);
              let current = claim;
              for (const step of path) {
                current = await service.transitionStatus(projectId, current.id, step, 'actor-1');
              }
            }

            registeredClaims.push(desc);
          }

          const summary = await service.getClaimsSummary(projectId);

          // Verify totalByPolicyType
          const allPolicyTypes: InsurancePolicyType[] = ['CAR', 'PI', 'public_liability', 'SASRIA', 'LDI'];
          for (const pt of allPolicyTypes) {
            const expectedCount = registeredClaims.filter(c => c.policyType === pt).length;
            expect(summary.totalByPolicyType[pt]).toBe(expectedCount);
          }

          // Verify totalEstimatedLoss (sum of all)
          const expectedTotalLoss = registeredClaims.reduce((sum, c) => sum + c.estimatedLoss, 0);
          expect(summary.totalEstimatedLoss).toBeCloseTo(expectedTotalLoss, 5);

          // Verify countByStatus
          const allStatuses: ClaimNotificationStatus[] = [
            'reported', 'notified_to_insurer', 'under_investigation',
            'claim_lodged', 'settled', 'rejected', 'withdrawn',
          ];
          for (const status of allStatuses) {
            const expectedCount = registeredClaims.filter(c => c.status === status).length;
            expect(summary.countByStatus[status]).toBe(expectedCount);
          }

          // Verify totalSettledAmount (sum of estimatedLoss for settled claims)
          const expectedSettledAmount = registeredClaims
            .filter(c => c.status === 'settled')
            .reduce((sum, c) => sum + c.estimatedLoss, 0);
          expect(summary.totalSettledAmount).toBeCloseTo(expectedSettledAmount, 5);
        },
      ),
      { numRuns: 100 },
    );
  });
});
