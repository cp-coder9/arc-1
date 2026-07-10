// Feature: p1-platform-extensions, Properties 14-18: NHBRC
//
// Property 14: NHBRC Enrolment Readiness Percentage — Validates: Requirements 11.2
// Property 15: NHBRC Fee Calculation — Validates: Requirements 11.3
// Property 16: Inspection Stage Sequence Enforcement — Validates: Requirements 12.1, 12.8
// Property 17: Warranty Period Validation — Validates: Requirements 13.3
// Property 18: Warranty Claim State Machine — Validates: Requirements 13.4
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { createNHBRCEngineService } from '../services/nhbrcEngineService';
import { createInspectionTrackerService, STAGE_ORDER } from '../services/inspectionTrackerService';
import { createWarrantyManagerService } from '../services/warrantyManagerService';

import type { ChecklistItemStatus, FeeBand, InspectionStage, WarrantyClaimStage } from '../types';

// ══════════════════════════════════════════════════════════════════════════════
// Generators
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a checklist item status */
const checklistItemStatusArb: fc.Arbitrary<ChecklistItemStatus> = fc.constantFrom(
  'not_started',
  'in_progress',
  'completed',
  'not_applicable',
);

/** Generate a checklist of N items with random statuses (1–30 items) */
const checklistArb: fc.Arbitrary<{ status: ChecklistItemStatus }[]> = fc.array(
  fc.record({ status: checklistItemStatusArb }),
  { minLength: 1, maxLength: 30 },
);

/** Generate number of units (1–10000) */
const unitsArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 10000 });

/** Generate estimated value per unit (0.01 to 999_999_999.99) */
const valuePerUnitArb: fc.Arbitrary<number> = fc
  .integer({ min: 1, max: 99_999_999_999 })
  .map((n) => n / 100);

/** Generate a fee band set covering 0.01 to some high value */
const feeBandArb: fc.Arbitrary<FeeBand[]> = fc
  .integer({ min: 2, max: 5 })
  .chain((bandCount) => {
    return fc.array(
      fc.integer({ min: 100, max: 50000 }),
      { minLength: bandCount, maxLength: bandCount },
    ).map((feeRates) => {
      const bands: FeeBand[] = [];
      let currentMin = 0.01;
      const step = 999_999_999.99 / bandCount;
      for (let i = 0; i < bandCount; i++) {
        const maxVal = i === bandCount - 1 ? 999_999_999.99 : Math.round((i + 1) * step * 100) / 100;
        bands.push({
          id: `band-${i + 1}`,
          minValue: currentMin,
          maxValue: maxVal,
          feePerUnit: feeRates[i],
          effectiveFrom: '2024-01-01',
        });
        currentMin = Math.round((maxVal + 0.01) * 100) / 100;
      }
      return bands;
    });
  });

/** Generate inspection stages */
const inspectionStageArb: fc.Arbitrary<InspectionStage> = fc.constantFrom(
  'foundation',
  'wall_plate',
  'roof',
  'completion',
);

/** All warranty claim stages */
const ALL_WARRANTY_STAGES: WarrantyClaimStage[] = [
  'reported',
  'acknowledged',
  'inspection_scheduled',
  'inspected',
  'liability_determined',
  'rectification_ordered',
  'rectification_in_progress',
  'rectification_complete',
  'claim_closed',
];

/** Generate a warranty claim stage */
const warrantyStageArb: fc.Arbitrary<WarrantyClaimStage> = fc.constantFrom(...ALL_WARRANTY_STAGES);

/** Generate a date string (YYYY-MM-DD) within a reasonable range */
const dateArb: fc.Arbitrary<string> = fc
  .integer({ min: 0, max: 3650 }) // 0 to 10 years from 2015-01-01
  .map((daysOffset) => {
    const base = new Date('2015-01-01');
    base.setDate(base.getDate() + daysOffset);
    return base.toISOString().split('T')[0];
  });

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Pure readiness calculation matching the service logic.
 * N = total items, K = not_applicable items, C = completed items among applicable.
 * readiness = floor(C / (N - K) * 100) when N - K > 0, else 0.
 */
function expectedReadiness(items: { status: ChecklistItemStatus }[]): number {
  const applicable = items.filter((i) => i.status !== 'not_applicable');
  const totalApplicable = applicable.length;
  if (totalApplicable === 0) return 0;
  const completed = applicable.filter((i) => i.status === 'completed').length;
  return Math.floor((completed / totalApplicable) * 100);
}

/**
 * Find the matching fee band for a given value.
 */
function findMatchingBand(bands: FeeBand[], value: number): FeeBand | undefined {
  return bands.find((b) => value >= b.minValue && value <= b.maxValue);
}

/**
 * Get the next sequential warranty claim stage.
 */
function getNextWarrantyStage(current: WarrantyClaimStage): WarrantyClaimStage | undefined {
  const idx = ALL_WARRANTY_STAGES.indexOf(current);
  if (idx < 0 || idx >= ALL_WARRANTY_STAGES.length - 1) return undefined;
  return ALL_WARRANTY_STAGES[idx + 1];
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 14: NHBRC Enrolment Readiness Percentage
// **Validates: Requirements 11.2**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 14: NHBRC Enrolment Readiness Percentage', () => {
  it('readiness = floor(C/(N-K)*100) when N-K > 0, 0 otherwise', async () => {
    await fc.assert(
      fc.asyncProperty(checklistArb, async (items) => {
        const service = createNHBRCEngineService();

        // Create an enrolment
        const enrolment = await service.createEnrolment(
          'proj-test',
          { numberOfUnits: 1, estimatedValuePerUnit: 100000 },
          'actor-1',
        );

        // Update each checklist item to match the generated statuses
        // The service creates default items, so we update them with our statuses
        const checklistItems = enrolment.items;
        const numToUpdate = Math.min(items.length, checklistItems.length);

        let updatedEnrolment = enrolment;
        for (let i = 0; i < numToUpdate; i++) {
          updatedEnrolment = await service.updateChecklistItem(
            'proj-test',
            checklistItems[i].id,
            items[i].status,
            'actor-1',
          );
        }

        // Build the effective items array (same shape as what the service uses)
        const effectiveItems = updatedEnrolment.items.map((item) => ({
          status: item.status as ChecklistItemStatus,
        }));

        const expected = expectedReadiness(effectiveItems);
        expect(updatedEnrolment.readinessPercentage).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('all items not_applicable yields readiness 0', async () => {
    const service = createNHBRCEngineService();
    const enrolment = await service.createEnrolment(
      'proj-na',
      { numberOfUnits: 1, estimatedValuePerUnit: 100000 },
      'actor-1',
    );

    let result = enrolment;
    for (const item of enrolment.items) {
      result = await service.updateChecklistItem('proj-na', item.id, 'not_applicable', 'actor-1');
    }

    expect(result.readinessPercentage).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 15: NHBRC Fee Calculation
// **Validates: Requirements 11.3**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 15: NHBRC Fee Calculation', () => {
  it('fee = U * feeRate from matching band, null if no band matches', async () => {
    await fc.assert(
      fc.asyncProperty(feeBandArb, unitsArb, valuePerUnitArb, async (bands, units, value) => {
        const service = createNHBRCEngineService({ feeBands: bands });
        const result = await service.calculateFee(units, value);

        const matchingBand = findMatchingBand(bands, value);

        if (matchingBand) {
          expect(result.fee).toBe(units * matchingBand.feePerUnit);
        } else {
          expect(result.fee).toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('empty fee bands always returns null fee', async () => {
    await fc.assert(
      fc.asyncProperty(unitsArb, valuePerUnitArb, async (units, value) => {
        const service = createNHBRCEngineService({ feeBands: [] });
        const result = await service.calculateFee(units, value);
        expect(result.fee).toBeNull();
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 16: Inspection Stage Sequence Enforcement
// **Validates: Requirements 12.1, 12.8**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 16: Inspection Stage Sequence Enforcement', () => {
  it('recording stage N requires all preceding stages passed or waived', async () => {
    await fc.assert(
      fc.asyncProperty(inspectionStageArb, async (targetStage) => {
        const service = createInspectionTrackerService({
          now: (() => {
            let counter = 0;
            return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
          })(),
        });

        const projectId = 'proj-seq';
        const unitId = 'unit-1';
        const stageIndex = STAGE_ORDER.indexOf(targetStage);

        // Pass all preceding stages
        for (let i = 0; i < stageIndex; i++) {
          await service.recordInspection(projectId, {
            unitId,
            stage: STAGE_ORDER[i],
            inspectionDate: '2024-01-01',
            inspectorName: 'Inspector',
            outcome: 'passed',
            evidenceRefs: [],
          }, 'actor-1');
        }

        // Target stage should now be allowed
        const check = await service.canRecordStage(projectId, unitId, targetStage);
        expect(check.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('failed stage blocks subsequent stages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(0, 1, 2) as fc.Arbitrary<number>, // index of stage to fail (not completion)
        async (failIndex) => {
          const service = createInspectionTrackerService({
            now: (() => {
              let counter = 0;
              return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
            })(),
          });

          const projectId = 'proj-fail';
          const unitId = 'unit-1';

          // Pass all stages before the fail index
          for (let i = 0; i < failIndex; i++) {
            await service.recordInspection(projectId, {
              unitId,
              stage: STAGE_ORDER[i],
              inspectionDate: '2024-01-01',
              inspectorName: 'Inspector',
              outcome: 'passed',
              evidenceRefs: [],
            }, 'actor-1');
          }

          // Fail the stage at failIndex
          await service.recordInspection(projectId, {
            unitId,
            stage: STAGE_ORDER[failIndex],
            inspectionDate: '2024-01-01',
            inspectorName: 'Inspector',
            outcome: 'failed',
            conditionsOrDefects: 'Test failure',
            evidenceRefs: [],
          }, 'actor-1');

          // All subsequent stages should be blocked
          for (let i = failIndex + 1; i < STAGE_ORDER.length; i++) {
            const check = await service.canRecordStage(projectId, unitId, STAGE_ORDER[i]);
            expect(check.allowed).toBe(false);
            expect(check.blockedBy).toBe(STAGE_ORDER[failIndex]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('waived stage satisfies the preceding requirement', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(0, 1, 2) as fc.Arbitrary<number>,
        async (waiveIndex) => {
          const service = createInspectionTrackerService({
            now: (() => {
              let counter = 0;
              return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
            })(),
          });

          const projectId = 'proj-waive';
          const unitId = 'unit-1';

          // Pass all stages before waiveIndex
          for (let i = 0; i < waiveIndex; i++) {
            await service.recordInspection(projectId, {
              unitId,
              stage: STAGE_ORDER[i],
              inspectionDate: '2024-01-01',
              inspectorName: 'Inspector',
              outcome: 'passed',
              evidenceRefs: [],
            }, 'actor-1');
          }

          // Waive the stage at waiveIndex
          await service.waiveStage(projectId, unitId, STAGE_ORDER[waiveIndex], 'actor-1', 'architect');

          // The next stage should be allowed
          if (waiveIndex + 1 < STAGE_ORDER.length) {
            const check = await service.canRecordStage(projectId, unitId, STAGE_ORDER[waiveIndex + 1]);
            expect(check.allowed).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 17: Warranty Period Validation
// **Validates: Requirements 13.3**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 17: Warranty Period Validation', () => {
  it('warrantyExpiryDate = practicalCompletionDate + 5 years, isOutsideWarranty = defectDate > expiry', async () => {
    await fc.assert(
      fc.asyncProperty(dateArb, dateArb, async (completionDate, discoveredDate) => {
        const service = createWarrantyManagerService({
          now: () => '2025-01-01T00:00:00.000Z',
        });

        const claim = await service.registerClaim(
          'proj-warranty',
          {
            unitId: 'unit-1',
            claimantName: 'Test Claimant',
            claimantContact: 'test@example.com',
            defectDescription: 'Test defect for property testing',
            defectCategory: 'structural',
            defectDiscoveredDate: discoveredDate,
            practicalCompletionDate: completionDate,
            evidenceRefs: ['evidence-1.jpg'],
          },
          'actor-1',
        );

        // Calculate expected expiry: completionDate + 5 years
        const expectedExpiry = new Date(completionDate);
        expectedExpiry.setFullYear(expectedExpiry.getFullYear() + 5);
        const expectedExpiryStr = expectedExpiry.toISOString().split('T')[0];

        expect(claim.warrantyExpiryDate).toBe(expectedExpiryStr);

        // isOutsideWarranty = discoveredDate > warrantyExpiryDate (string comparison)
        const expectedOutside = discoveredDate > expectedExpiryStr;
        expect(claim.isOutsideWarranty).toBe(expectedOutside);
      }),
      { numRuns: 200 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 18: Warranty Claim State Machine
// **Validates: Requirements 13.4**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 18: Warranty Claim State Machine', () => {
  it('sequential transitions are valid: each stage transitions to the next', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Pick a random starting point in the sequence to test from
        fc.integer({ min: 0, max: ALL_WARRANTY_STAGES.length - 2 }),
        async (startIdx) => {
          const service = createWarrantyManagerService({
            now: (() => {
              let counter = 0;
              return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
            })(),
          });

          // Create a claim
          const claim = await service.registerClaim(
            'proj-sm',
            {
              unitId: 'unit-1',
              claimantName: 'Claimant',
              claimantContact: 'contact@test.com',
              defectDescription: 'State machine test defect',
              defectCategory: 'structural',
              defectDiscoveredDate: '2024-06-01',
              practicalCompletionDate: '2020-01-01',
              evidenceRefs: ['img.jpg'],
            },
            'actor-1',
          );

          // Advance through stages sequentially up to startIdx
          let currentClaim = claim;
          for (let i = 0; i <= startIdx; i++) {
            const currentStage = ALL_WARRANTY_STAGES[i];
            const nextStage = getNextWarrantyStage(currentStage);
            if (!nextStage) break;

            // Provide required data for specific stages
            let data = undefined;
            if (nextStage === 'liability_determined') {
              data = { liabilityOutcome: 'builder_liable' as const };
            } else if (nextStage === 'rectification_ordered') {
              data = {
                rectificationDescription: 'Fix the defect',
                rectificationDeadline: '2025-06-01',
                rectificationResponsibleParty: 'Builder Corp',
              };
            }

            currentClaim = await service.transitionClaim(
              'proj-sm',
              claim.id,
              nextStage,
              data,
              'actor-1',
            );

            expect(currentClaim.currentStage).toBe(nextStage);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('invalid transitions are rejected', async () => {
    await fc.assert(
      fc.asyncProperty(warrantyStageArb, warrantyStageArb, async (fromStage, toStage) => {
        // Skip if toStage is the valid next stage or the no_liability shortcut
        const validNext = getNextWarrantyStage(fromStage);
        const isNoLiabilityShortcut =
          fromStage === 'liability_determined' && toStage === 'claim_closed';

        if (toStage === validNext || isNoLiabilityShortcut) return;
        // Also skip if fromStage is terminal
        if (fromStage === 'claim_closed') return;

        const service = createWarrantyManagerService({
          now: (() => {
            let counter = 0;
            return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
          })(),
        });

        // Create a claim and advance to fromStage
        const claim = await service.registerClaim(
          'proj-invalid',
          {
            unitId: 'unit-1',
            claimantName: 'Claimant',
            claimantContact: 'contact@test.com',
            defectDescription: 'Invalid transition test',
            defectCategory: 'roof_waterproofing',
            defectDiscoveredDate: '2024-06-01',
            practicalCompletionDate: '2020-01-01',
            evidenceRefs: ['img.jpg'],
          },
          'actor-1',
        );

        // Advance to fromStage
        const fromIdx = ALL_WARRANTY_STAGES.indexOf(fromStage);
        for (let i = 0; i < fromIdx; i++) {
          const next = ALL_WARRANTY_STAGES[i + 1];
          let data = undefined;
          if (next === 'liability_determined') {
            data = { liabilityOutcome: 'builder_liable' as const };
          } else if (next === 'rectification_ordered') {
            data = {
              rectificationDescription: 'Fix it',
              rectificationDeadline: '2025-06-01',
              rectificationResponsibleParty: 'Builder',
            };
          }
          await service.transitionClaim('proj-invalid', claim.id, next, data, 'actor-1');
        }

        // Now attempt the invalid transition
        await expect(
          service.transitionClaim('proj-invalid', claim.id, toStage, undefined, 'actor-1'),
        ).rejects.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('no_liability at liability_determined transitions directly to claim_closed', async () => {
    const service = createWarrantyManagerService({
      now: (() => {
        let counter = 0;
        return () => new Date(2024, 0, 1, 0, 0, counter++).toISOString();
      })(),
    });

    // Create and advance to liability_determined
    const claim = await service.registerClaim(
      'proj-nol',
      {
        unitId: 'unit-1',
        claimantName: 'Claimant',
        claimantContact: 'contact@test.com',
        defectDescription: 'No liability test',
        defectCategory: 'wall_waterproofing',
        defectDiscoveredDate: '2024-06-01',
        practicalCompletionDate: '2020-01-01',
        evidenceRefs: ['img.jpg'],
      },
      'actor-1',
    );

    // Advance: reported → acknowledged → inspection_scheduled → inspected → liability_determined
    await service.transitionClaim('proj-nol', claim.id, 'acknowledged', undefined, 'actor-1');
    await service.transitionClaim('proj-nol', claim.id, 'inspection_scheduled', undefined, 'actor-1');
    await service.transitionClaim('proj-nol', claim.id, 'inspected', undefined, 'actor-1');
    await service.transitionClaim('proj-nol', claim.id, 'liability_determined', { liabilityOutcome: 'no_liability' }, 'actor-1');

    // Now the no_liability shortcut: liability_determined → claim_closed
    const result = await service.transitionClaim(
      'proj-nol',
      claim.id,
      'claim_closed',
      { liabilityOutcome: 'no_liability' },
      'actor-1',
    );

    expect(result.currentStage).toBe('claim_closed');
  });
});
