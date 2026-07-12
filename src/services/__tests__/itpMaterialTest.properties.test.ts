// @vitest-environment node
/**
 * Property-based tests — Material Test Due Date Calculation.
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 10: Material test due date calculation
 *   Validates: Requirements 5.3
 *   For any material test with `dateSampled` and a testing schedule specifying
 *   `expectedTurnaroundDays` = D, the computed `dateTestDue` shall equal
 *   `dateSampled + D calendar days`.
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { vi } from 'vitest';
import fc from 'fast-check';

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user' } },
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', READ: 'READ', UPDATE: 'UPDATE', DELETE: 'DELETE', LIST: 'LIST', UPLOAD: 'UPLOAD', GET: 'GET', WRITE: 'WRITE' },
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: vi.fn(),
  getDemoCol: vi.fn(),
  useDemoMode: vi.fn(() => false),
}));

import * as firestore from 'firebase/firestore';
import { createMaterialTest, type CreateMaterialTestInput } from '@/services/itpService';

import type {
  MaterialType,
  SANSTestCategory,
  TestingSchedule,
} from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const MATERIAL_TYPES: MaterialType[] = ['concrete', 'soil', 'steel', 'aggregate', 'bituminous'];

/** Test categories that do NOT have defaults (require schedule lookup) */
const NON_DEFAULT_CATEGORIES: SANSTestCategory[] = [
  'soil_compaction',
  'steel_tensile',
  'aggregate_grading',
  'bituminous_binder',
];

/** Test categories with built-in defaults */
const DEFAULT_CATEGORIES: { category: SANSTestCategory; days: number }[] = [
  { category: 'concrete_7day', days: 7 },
  { category: 'concrete_28day', days: 28 },
];

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for turnaround days between 1 and 90. */
const arbTurnaroundDays = fc.integer({ min: 1, max: 90 });

/** Arbitrary for turnaround days exceeding the max (91-200). */
const arbExcessiveTurnaroundDays = fc.integer({ min: 91, max: 200 });

/** Arbitrary for a valid date (between 2020-01-01 and 2030-12-31) as ISO string. */
const arbDateSampled = fc
  .integer({
    min: new Date('2020-01-01T00:00:00.000Z').getTime(),
    max: new Date('2030-12-31T00:00:00.000Z').getTime(),
  })
  .map((ms) => new Date(ms).toISOString());

/** Arbitrary for a non-default test category. */
const arbNonDefaultCategory: fc.Arbitrary<SANSTestCategory> = fc.constantFrom(...NON_DEFAULT_CATEGORIES);

/** Arbitrary for a material type. */
const arbMaterialType: fc.Arbitrary<MaterialType> = fc.constantFrom(...MATERIAL_TYPES);

/** Generate a valid project ID (non-empty lowercase alpha string). */
const arbProjectId = fc
  .array(fc.integer({ min: 97, max: 122 }), { minLength: 5, maxLength: 20 })
  .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/** Generate a valid sample ID. */
const arbSampleId = fc
  .array(fc.integer({ min: 48, max: 57 }), { minLength: 4, maxLength: 10 })
  .map((codes) => 'SAMPLE-' + codes.map((c) => String.fromCharCode(c)).join(''));

/** Generate a valid user ID. */
const arbUserId = fc
  .array(fc.integer({ min: 97, max: 122 }), { minLength: 5, maxLength: 15 })
  .map((codes) => 'user-' + codes.map((c) => String.fromCharCode(c)).join(''));

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Compute the expected due date by adding D calendar days to dateSampled.
 */
function computeExpectedDueDate(dateSampled: string, turnaroundDays: number): string {
  const sampled = new Date(dateSampled);
  const due = new Date(sampled);
  due.setDate(due.getDate() + turnaroundDays);
  return due.toISOString();
}

/**
 * Set up Firestore mocks for createMaterialTest.
 * - getDoc: returns a testing schedule with the specified expectedTurnaroundDays
 * - addDoc: captures written data and returns a mock ref
 */
function setupMocks(opts: { expectedTurnaroundDays: number }) {
  const capturedData: Record<string, unknown>[] = [];

  // Mock getDoc to return a testing schedule
  vi.mocked(firestore.getDoc).mockResolvedValue({
    exists: () => true,
    id: 'schedule-mock-id',
    data: () => ({
      projectId: 'proj-123',
      materialType: 'soil',
      sansTestMethodReference: 'SANS 3001-GR1',
      testCategory: 'soil_compaction',
      testFrequencyRatio: 1,
      testFrequencyQuantity: 50,
      unitOfMeasure: 'm³',
      minSamplesPerTest: 3,
      acceptanceThreshold: 95,
      thresholdUnit: '%',
      thresholdDirection: 'gte',
      expectedTurnaroundDays: opts.expectedTurnaroundDays,
      constructionStage: 'foundations',
      approvedLaboratories: [],
      createdBy: 'user-engineer',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    } satisfies Omit<TestingSchedule, 'id'>),
    ref: { id: 'schedule-mock-id' },
  } as any);

  // Mock addDoc to capture written data
  vi.mocked(firestore.addDoc).mockImplementation(async (_colRef: any, data: any) => {
    capturedData.push({ ...data });
    return { id: `test-${capturedData.length}` } as any;
  });

  return { capturedData };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 10: Material test due date calculation
// Validates: Requirements 5.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 10: Material test due date calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * For any dateSampled and turnaround days D (1-90) from the testing schedule,
   * the computed dateTestDue shall equal dateSampled + D calendar days.
   */
  it('dateTestDue equals dateSampled + D calendar days for schedule-derived turnaround', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDateSampled,
        arbTurnaroundDays,
        arbNonDefaultCategory,
        arbMaterialType,
        arbProjectId,
        arbSampleId,
        arbUserId,
        async (dateSampled, turnaroundDays, testCategory, materialType, projectId, sampleId, userId) => {
          vi.clearAllMocks();

          const { capturedData } = setupMocks({ expectedTurnaroundDays: turnaroundDays });

          const input: CreateMaterialTestInput = {
            projectId,
            testingScheduleId: 'schedule-mock-id',
            sampleId,
            materialType,
            testCategory,
            sansTestMethodReference: 'SANS 3001-GR1',
            dateSampled,
            testingLaboratoryName: 'Test Lab',
            createdBy: userId,
          };

          await createMaterialTest(input);

          // First addDoc call is the material test record
          expect(capturedData.length).toBeGreaterThan(0);
          const testRecord = capturedData[0];

          const expectedDueDate = computeExpectedDueDate(dateSampled, turnaroundDays);
          expect(testRecord.dateTestDue).toBe(expectedDueDate);
          expect(testRecord.dateSampled).toBe(dateSampled);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * concrete_7day tests always use 7 days turnaround regardless of schedule value.
   */
  it('concrete_7day always uses 7-day turnaround regardless of schedule expectedTurnaroundDays', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDateSampled,
        arbTurnaroundDays, // schedule value (should be ignored)
        arbProjectId,
        arbSampleId,
        arbUserId,
        async (dateSampled, scheduleTurnaround, projectId, sampleId, userId) => {
          vi.clearAllMocks();

          // Set up schedule with arbitrary turnaround (should be overridden by default)
          const { capturedData } = setupMocks({ expectedTurnaroundDays: scheduleTurnaround });

          const input: CreateMaterialTestInput = {
            projectId,
            testingScheduleId: 'schedule-mock-id',
            sampleId,
            materialType: 'concrete',
            testCategory: 'concrete_7day',
            sansTestMethodReference: 'SANS 3001-CO1',
            dateSampled,
            testingLaboratoryName: 'Concrete Lab',
            createdBy: userId,
          };

          await createMaterialTest(input);

          expect(capturedData.length).toBeGreaterThan(0);
          const testRecord = capturedData[0];

          // Should always be 7 days regardless of schedule
          const expectedDueDate = computeExpectedDueDate(dateSampled, 7);
          expect(testRecord.dateTestDue).toBe(expectedDueDate);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * concrete_28day tests always use 28 days turnaround regardless of schedule value.
   */
  it('concrete_28day always uses 28-day turnaround regardless of schedule expectedTurnaroundDays', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDateSampled,
        arbTurnaroundDays, // schedule value (should be ignored)
        arbProjectId,
        arbSampleId,
        arbUserId,
        async (dateSampled, scheduleTurnaround, projectId, sampleId, userId) => {
          vi.clearAllMocks();

          const { capturedData } = setupMocks({ expectedTurnaroundDays: scheduleTurnaround });

          const input: CreateMaterialTestInput = {
            projectId,
            testingScheduleId: 'schedule-mock-id',
            sampleId,
            materialType: 'concrete',
            testCategory: 'concrete_28day',
            sansTestMethodReference: 'SANS 3001-CO1',
            dateSampled,
            testingLaboratoryName: 'Concrete Lab',
            createdBy: userId,
          };

          await createMaterialTest(input);

          expect(capturedData.length).toBeGreaterThan(0);
          const testRecord = capturedData[0];

          // Should always be 28 days regardless of schedule
          const expectedDueDate = computeExpectedDueDate(dateSampled, 28);
          expect(testRecord.dateTestDue).toBe(expectedDueDate);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * Turnaround days exceeding 90 are capped at 90.
   */
  it('turnaround days > 90 from schedule are capped at 90', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDateSampled,
        arbExcessiveTurnaroundDays,
        arbNonDefaultCategory,
        arbMaterialType,
        arbProjectId,
        arbSampleId,
        arbUserId,
        async (dateSampled, excessiveDays, testCategory, materialType, projectId, sampleId, userId) => {
          vi.clearAllMocks();

          const { capturedData } = setupMocks({ expectedTurnaroundDays: excessiveDays });

          const input: CreateMaterialTestInput = {
            projectId,
            testingScheduleId: 'schedule-mock-id',
            sampleId,
            materialType,
            testCategory,
            sansTestMethodReference: 'SANS 3001-GR1',
            dateSampled,
            testingLaboratoryName: 'Test Lab',
            createdBy: userId,
          };

          await createMaterialTest(input);

          expect(capturedData.length).toBeGreaterThan(0);
          const testRecord = capturedData[0];

          // Should be capped at 90 days
          const expectedDueDate = computeExpectedDueDate(dateSampled, 90);
          expect(testRecord.dateTestDue).toBe(expectedDueDate);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * When expectedTurnaroundDaysOverride is provided, it is used directly
   * (capped at 90) instead of reading from schedule.
   */
  it('override turnaround days are used directly when provided (capped at 90)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDateSampled,
        arbTurnaroundDays,
        arbNonDefaultCategory,
        arbMaterialType,
        arbProjectId,
        arbSampleId,
        arbUserId,
        async (dateSampled, overrideDays, testCategory, materialType, projectId, sampleId, userId) => {
          vi.clearAllMocks();

          // Schedule has a different value — should be ignored due to override
          const { capturedData } = setupMocks({ expectedTurnaroundDays: 99 });

          const input: CreateMaterialTestInput = {
            projectId,
            testingScheduleId: 'schedule-mock-id',
            sampleId,
            materialType,
            testCategory,
            sansTestMethodReference: 'SANS 3001-GR1',
            dateSampled,
            testingLaboratoryName: 'Test Lab',
            createdBy: userId,
            expectedTurnaroundDaysOverride: overrideDays,
          };

          await createMaterialTest(input);

          expect(capturedData.length).toBeGreaterThan(0);
          const testRecord = capturedData[0];

          const cappedDays = Math.min(overrideDays, 90);
          const expectedDueDate = computeExpectedDueDate(dateSampled, cappedDays);
          expect(testRecord.dateTestDue).toBe(expectedDueDate);
        },
      ),
      { numRuns: 100 },
    );
  });
});
