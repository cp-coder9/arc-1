// @vitest-environment node
/**
 * Property-based tests — ITP Testing Compliance Gap Detection.
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 12: Testing compliance gap detection
 *   Validates: Requirements 5.6
 *   For any material type on a project where
 *   `floor(cumulativeQuantityPlaced / testFrequencyQuantity) - completedTestCount >= 1`,
 *   the service shall flag a testing compliance gap.
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import * as firestore from 'firebase/firestore';
import { checkTestingComplianceGap } from '@/services/itpService';
import type {
  MaterialType,
  SANSTestCategory,
  MaterialTestStatus,
  TestingSchedule,
  MaterialTest,
} from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const MATERIAL_TYPES: MaterialType[] = ['concrete', 'soil', 'steel', 'aggregate', 'bituminous'];
const TEST_CATEGORIES: SANSTestCategory[] = [
  'concrete_7day',
  'concrete_28day',
  'soil_compaction',
  'steel_tensile',
  'aggregate_grading',
  'bituminous_binder',
];

/** Statuses that count as "completed" for gap calculations. */
const COMPLETED_STATUSES: MaterialTestStatus[] = ['results_received', 'passed', 'failed', 'ncr_resolved'];

/** Statuses that do NOT count as "completed". */
const INCOMPLETE_STATUSES: MaterialTestStatus[] = ['scheduled', 'sampled', 'submitted_to_lab'];

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for cumulative quantity placed (1–10000). */
const arbCumulativeQuantity = fc.integer({ min: 1, max: 10000 });

/** Arbitrary for test frequency quantity (1–500). */
const arbFrequencyQuantity = fc.integer({ min: 1, max: 500 });

/** Arbitrary for completed test count (0–100). */
const arbCompletedTestCount = fc.integer({ min: 0, max: 100 });

/** Arbitrary for a material type. */
const arbMaterialType: fc.Arbitrary<MaterialType> = fc.constantFrom(...MATERIAL_TYPES);

/** Arbitrary for a test category. */
const arbTestCategory: fc.Arbitrary<SANSTestCategory> = fc.constantFrom(...TEST_CATEGORIES);

/** Arbitrary for a schedule ID. */
const arbScheduleId = fc.uuid();

/** Arbitrary for a project ID. */
const arbProjectId = fc.uuid();

/** Arbitrary for a completed test status. */
const arbCompletedStatus: fc.Arbitrary<MaterialTestStatus> = fc.constantFrom(...COMPLETED_STATUSES);

/** Arbitrary for an incomplete test status. */
const arbIncompleteStatus: fc.Arbitrary<MaterialTestStatus> = fc.constantFrom(...INCOMPLETE_STATUSES);

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Build a mock TestingSchedule with the specified frequency quantity.
 */
function buildSchedule(scheduleId: string, materialType: MaterialType, testCategory: SANSTestCategory, frequencyQuantity: number): TestingSchedule {
  return {
    id: scheduleId,
    projectId: 'test-project',
    materialType,
    sansTestMethodReference: 'SANS 3001-GR1',
    testCategory,
    testFrequencyRatio: 1,
    testFrequencyQuantity: frequencyQuantity,
    unitOfMeasure: 'm³',
    minSamplesPerTest: 3,
    acceptanceThreshold: 95,
    thresholdUnit: '%',
    thresholdDirection: 'gte',
    expectedTurnaroundDays: 7,
    constructionStage: 'foundations',
    approvedLaboratories: [],
    createdBy: 'user-engineer',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

/**
 * Build mock MaterialTest records with the specified statuses.
 */
function buildMaterialTests(scheduleId: string, statuses: MaterialTestStatus[]): MaterialTest[] {
  return statuses.map((status, i) => ({
    id: `test-${i}`,
    projectId: 'test-project',
    testingScheduleId: scheduleId,
    sampleId: `SAMPLE-${i}`,
    materialType: 'concrete' as MaterialType,
    testCategory: 'concrete_7day' as SANSTestCategory,
    sansTestMethodReference: 'SANS 3001-GR1',
    dateSampled: '2025-01-01T00:00:00.000Z',
    dateTestDue: '2025-01-08T00:00:00.000Z',
    testingLaboratoryName: 'Test Lab',
    status,
    linkedInspectionItemIds: [],
    isPriority: false,
    createdBy: 'user-engineer',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }));
}

/**
 * Set up Firestore mocks for checkTestingComplianceGap.
 * - First getDocs call: returns testing schedules
 * - Second getDocs call: returns material tests
 */
function setupMocks(schedules: TestingSchedule[], materialTests: MaterialTest[]) {
  let callCount = 0;

  vi.mocked(firestore.getDocs).mockImplementation(async () => {
    callCount++;
    if (callCount === 1) {
      // First call: testing schedules collection
      return {
        empty: schedules.length === 0,
        size: schedules.length,
        docs: schedules.map((s) => ({
          id: s.id,
          data: () => {
            const { id: _id, ...rest } = s;
            return rest;
          },
          ref: { id: s.id },
          exists: () => true,
        })),
        forEach: (fn: any) => schedules.forEach((s, i) => fn({
          id: s.id,
          data: () => {
            const { id: _id, ...rest } = s;
            return rest;
          },
        }, i)),
      } as any;
    }
    // Second call: material tests collection
    return {
      empty: materialTests.length === 0,
      size: materialTests.length,
      docs: materialTests.map((t) => ({
        id: t.id,
        data: () => {
          const { id: _id, ...rest } = t;
          return rest;
        },
        ref: { id: t.id },
        exists: () => true,
      })),
      forEach: (fn: any) => materialTests.forEach((t, i) => fn({
        id: t.id,
        data: () => {
          const { id: _id, ...rest } = t;
          return rest;
        },
      }, i)),
    } as any;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 12: Testing compliance gap detection
// Validates: Requirements 5.6
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 12: Testing compliance gap detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * When floor(cumulativeQuantity / frequencyQuantity) - completedTests >= 1,
   * a compliance gap is detected and returned in results.
   */
  it('detects a gap when requiredTests - completedTests >= 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCumulativeQuantity,
        arbFrequencyQuantity,
        arbCompletedTestCount,
        arbMaterialType,
        arbTestCategory,
        arbScheduleId,
        arbProjectId,
        async (cumulativeQty, freqQty, completedCount, materialType, testCategory, scheduleId, projectId) => {
          const requiredTests = Math.floor(cumulativeQty / freqQty);
          const gapCount = requiredTests - completedCount;

          // Only test the "gap detected" case
          if (gapCount < 1) return;

          vi.clearAllMocks();

          const schedule = buildSchedule(scheduleId, materialType, testCategory, freqQty);
          // Build exactly `completedCount` completed tests
          const completedStatuses = Array.from({ length: completedCount }, () =>
            fc.sample(arbCompletedStatus, 1)[0],
          );
          const materialTests = buildMaterialTests(scheduleId, completedStatuses);

          setupMocks([schedule], materialTests);

          const cumulativeQuantities: Record<string, number> = { [scheduleId]: cumulativeQty };
          const gaps = await checkTestingComplianceGap(projectId, cumulativeQuantities);

          expect(gaps.length).toBe(1);
          expect(gaps[0].testingScheduleId).toBe(scheduleId);
          expect(gaps[0].materialType).toBe(materialType);
          expect(gaps[0].requiredTests).toBe(requiredTests);
          expect(gaps[0].completedTests).toBe(completedCount);
          expect(gaps[0].gapCount).toBe(gapCount);
          expect(gaps[0].gapCount).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * When floor(cumulativeQuantity / frequencyQuantity) - completedTests < 1,
   * no compliance gap is detected.
   */
  it('reports no gap when requiredTests - completedTests < 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCumulativeQuantity,
        arbFrequencyQuantity,
        arbCompletedTestCount,
        arbMaterialType,
        arbTestCategory,
        arbScheduleId,
        arbProjectId,
        async (cumulativeQty, freqQty, completedCount, materialType, testCategory, scheduleId, projectId) => {
          const requiredTests = Math.floor(cumulativeQty / freqQty);
          const gapCount = requiredTests - completedCount;

          // Only test the "no gap" case
          if (gapCount >= 1) return;

          vi.clearAllMocks();

          const schedule = buildSchedule(scheduleId, materialType, testCategory, freqQty);
          // Build enough completed tests so there's no gap
          const completedStatuses = Array.from({ length: completedCount }, () =>
            fc.sample(arbCompletedStatus, 1)[0],
          );
          const materialTests = buildMaterialTests(scheduleId, completedStatuses);

          setupMocks([schedule], materialTests);

          const cumulativeQuantities: Record<string, number> = { [scheduleId]: cumulativeQty };
          const gaps = await checkTestingComplianceGap(projectId, cumulativeQuantities);

          // No gap should be flagged for this schedule
          const scheduleGap = gaps.find((g) => g.testingScheduleId === scheduleId);
          expect(scheduleGap).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * Edge case: when cumulativeQuantity is 0, no gap is detected since
   * floor(0 / freqQty) = 0 and no tests are required.
   */
  it('no gap when cumulativeQuantity is 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFrequencyQuantity,
        arbMaterialType,
        arbTestCategory,
        arbScheduleId,
        arbProjectId,
        async (freqQty, materialType, testCategory, scheduleId, projectId) => {
          vi.clearAllMocks();

          const schedule = buildSchedule(scheduleId, materialType, testCategory, freqQty);
          setupMocks([schedule], []);

          // cumulativeQuantity = 0 — should be skipped (<=0 check in impl)
          const cumulativeQuantities: Record<string, number> = { [scheduleId]: 0 };
          const gaps = await checkTestingComplianceGap(projectId, cumulativeQuantities);

          expect(gaps.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * Edge case: when frequencyQuantity is very large relative to cumulative quantity,
   * floor(cumQty / freqQty) = 0, so no tests are required and no gap exists.
   */
  it('no gap when frequencyQuantity is much larger than cumulativeQuantity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 499 }),  // cumQty always less than freqQty
        arbMaterialType,
        arbTestCategory,
        arbScheduleId,
        arbProjectId,
        async (cumulativeQty, materialType, testCategory, scheduleId, projectId) => {
          vi.clearAllMocks();

          // freqQty > cumQty, so floor(cumQty / freqQty) = 0
          const freqQty = cumulativeQty + 1;
          const schedule = buildSchedule(scheduleId, materialType, testCategory, freqQty);
          setupMocks([schedule], []);

          const cumulativeQuantities: Record<string, number> = { [scheduleId]: cumulativeQty };
          const gaps = await checkTestingComplianceGap(projectId, cumulativeQuantities);

          expect(gaps.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * Edge case: when completedTests exceeds requiredTests, no gap exists.
   */
  it('no gap when completedTests exceeds required tests', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCumulativeQuantity,
        arbFrequencyQuantity,
        arbMaterialType,
        arbTestCategory,
        arbScheduleId,
        arbProjectId,
        async (cumulativeQty, freqQty, materialType, testCategory, scheduleId, projectId) => {
          vi.clearAllMocks();

          const requiredTests = Math.floor(cumulativeQty / freqQty);
          // Ensure completedTests > requiredTests
          const completedCount = requiredTests + fc.sample(fc.integer({ min: 1, max: 10 }), 1)[0];

          const schedule = buildSchedule(scheduleId, materialType, testCategory, freqQty);
          const completedStatuses = Array.from({ length: completedCount }, () =>
            fc.sample(arbCompletedStatus, 1)[0],
          );
          const materialTests = buildMaterialTests(scheduleId, completedStatuses);

          setupMocks([schedule], materialTests);

          const cumulativeQuantities: Record<string, number> = { [scheduleId]: cumulativeQty };
          const gaps = await checkTestingComplianceGap(projectId, cumulativeQuantities);

          expect(gaps.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * Only tests with statuses in ['results_received', 'passed', 'failed', 'ncr_resolved']
   * count as "completed". Tests in other statuses do not reduce the gap.
   */
  it('only completed-status tests reduce the gap count', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCumulativeQuantity,
        arbFrequencyQuantity,
        fc.integer({ min: 1, max: 20 }),  // number of incomplete tests
        arbMaterialType,
        arbTestCategory,
        arbScheduleId,
        arbProjectId,
        async (cumulativeQty, freqQty, incompleteCount, materialType, testCategory, scheduleId, projectId) => {
          const requiredTests = Math.floor(cumulativeQty / freqQty);
          // Only test scenarios where a gap would exist if incomplete tests don't count
          if (requiredTests < 1) return;

          vi.clearAllMocks();

          const schedule = buildSchedule(scheduleId, materialType, testCategory, freqQty);
          // Build only incomplete tests (these should NOT count as completed)
          const incompleteStatuses = Array.from({ length: incompleteCount }, () =>
            fc.sample(arbIncompleteStatus, 1)[0],
          );
          const materialTests = buildMaterialTests(scheduleId, incompleteStatuses);

          setupMocks([schedule], materialTests);

          const cumulativeQuantities: Record<string, number> = { [scheduleId]: cumulativeQty };
          const gaps = await checkTestingComplianceGap(projectId, cumulativeQuantities);

          // Since none of the tests are "completed", gap should equal requiredTests
          expect(gaps.length).toBe(1);
          expect(gaps[0].completedTests).toBe(0);
          expect(gaps[0].gapCount).toBe(requiredTests);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * The gap count is correctly calculated as floor(cumQty / freqQty) - completedTests.
   * This is the fundamental property — test the arithmetic directly.
   */
  it('gapCount equals floor(cumulativeQuantity / frequencyQuantity) - completedTests', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCumulativeQuantity,
        arbFrequencyQuantity,
        arbCompletedTestCount,
        arbMaterialType,
        arbTestCategory,
        arbScheduleId,
        arbProjectId,
        async (cumulativeQty, freqQty, completedCount, materialType, testCategory, scheduleId, projectId) => {
          const requiredTests = Math.floor(cumulativeQty / freqQty);
          const expectedGap = requiredTests - completedCount;

          // Only test cases where a gap exists (otherwise no result to check)
          if (expectedGap < 1) return;

          vi.clearAllMocks();

          const schedule = buildSchedule(scheduleId, materialType, testCategory, freqQty);
          const completedStatuses = Array.from({ length: completedCount }, () =>
            fc.sample(arbCompletedStatus, 1)[0],
          );
          const materialTests = buildMaterialTests(scheduleId, completedStatuses);

          setupMocks([schedule], materialTests);

          const cumulativeQuantities: Record<string, number> = { [scheduleId]: cumulativeQty };
          const gaps = await checkTestingComplianceGap(projectId, cumulativeQuantities);

          expect(gaps.length).toBe(1);
          expect(gaps[0].gapCount).toBe(expectedGap);
          expect(gaps[0].requiredTests).toBe(requiredTests);
          expect(gaps[0].completedTests).toBe(completedCount);
          expect(gaps[0].cumulativeQuantity).toBe(cumulativeQty);
          expect(gaps[0].frequencyQuantity).toBe(freqQty);
        },
      ),
      { numRuns: 100 },
    );
  });
});
