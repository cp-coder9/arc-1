// @vitest-environment node
/**
 * Property-based tests — ITP Lab Result Unit Mismatch Rejection.
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 16: Lab result unit must match testing schedule unit
 *   Validates: Requirements 6.8
 *   For any lab result submission where `resultUnit` does not exactly match the
 *   `thresholdUnit` defined in the testing schedule for the applicable test method,
 *   the submission shall be rejected with an error specifying the expected unit.
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
import { recordLabResult, ITPServiceError, type RecordLabResultInput } from '@/services/itpService';

import type {
  MaterialTest,
  MaterialTestStatus,
  MaterialType,
  SANSTestCategory,
  TestingSchedule,
  ApprovedLaboratory,
  ThresholdDirection,
  ConstructionStage,
} from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const MATERIAL_TYPES: MaterialType[] = ['concrete', 'soil', 'steel', 'aggregate', 'bituminous'];
const SANS_TEST_CATEGORIES: SANSTestCategory[] = [
  'concrete_7day', 'concrete_28day', 'soil_compaction',
  'steel_tensile', 'aggregate_grading', 'bituminous_binder',
];
const THRESHOLD_DIRECTIONS: ThresholdDirection[] = ['gte', 'lte'];
const CONSTRUCTION_STAGES: ConstructionStage[] = [
  'site_establishment', 'earthworks', 'foundations', 'substructure',
  'superstructure', 'roof', 'external_envelope', 'internal_finishes',
  'mechanical_electrical', 'external_works', 'commissioning',
];

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a non-empty printable string (no control chars). */
function arbPrintableString(min: number, max: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 33, max: 126 }), { minLength: min, maxLength: max })
    .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));
}

/** Arbitrary for a unit string (1-20 printable chars). */
const arbUnit = arbPrintableString(1, 20);

/** Arbitrary for a material type. */
const arbMaterialType: fc.Arbitrary<MaterialType> = fc.constantFrom(...MATERIAL_TYPES);

/** Arbitrary for a SANS test category. */
const arbTestCategory: fc.Arbitrary<SANSTestCategory> = fc.constantFrom(...SANS_TEST_CATEGORIES);

/** Arbitrary for a threshold direction. */
const arbThresholdDirection: fc.Arbitrary<ThresholdDirection> = fc.constantFrom(...THRESHOLD_DIRECTIONS);

/** Arbitrary for a construction stage. */
const arbConstructionStage: fc.Arbitrary<ConstructionStage> = fc.constantFrom(...CONSTRUCTION_STAGES);

/**
 * Generate two DISTINCT unit strings (resultUnit !== thresholdUnit).
 * This is the key arbitrary for testing unit mismatch.
 */
const arbMismatchedUnits: fc.Arbitrary<{ resultUnit: string; thresholdUnit: string }> = fc
  .tuple(arbUnit, arbUnit)
  .filter(([a, b]) => a !== b)
  .map(([resultUnit, thresholdUnit]) => ({ resultUnit, thresholdUnit }));

/**
 * Generate a single unit string used as both resultUnit and thresholdUnit (match case).
 */
const arbMatchingUnit: fc.Arbitrary<string> = arbUnit;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a mock MaterialTest record.
 */
function createMockMaterialTest(overrides?: Partial<MaterialTest>): MaterialTest {
  return {
    id: 'test-material-test-id',
    projectId: 'test-project-id',
    testingScheduleId: 'test-schedule-id',
    sampleId: 'SAMPLE-001',
    materialType: 'concrete',
    testCategory: 'concrete_28day',
    sansTestMethodReference: 'SANS 3001-GR1',
    dateSampled: '2025-01-01T00:00:00.000Z',
    dateTestDue: '2025-01-29T00:00:00.000Z',
    testingLaboratoryName: 'Accredited Lab',
    status: 'submitted_to_lab' as MaterialTestStatus,
    linkedInspectionItemIds: [],
    isPriority: false,
    createdBy: 'user-engineer',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Create a mock TestingSchedule record.
 */
function createMockTestingSchedule(thresholdUnit: string, overrides?: Partial<TestingSchedule>): TestingSchedule {
  return {
    id: 'test-schedule-id',
    projectId: 'test-project-id',
    materialType: 'concrete',
    sansTestMethodReference: 'SANS 3001-GR1',
    testCategory: 'concrete_28day',
    testFrequencyRatio: 1,
    testFrequencyQuantity: 50,
    unitOfMeasure: 'm³',
    minSamplesPerTest: 3,
    acceptanceThreshold: 25,
    thresholdUnit,
    thresholdDirection: 'gte' as ThresholdDirection,
    expectedTurnaroundDays: 28,
    constructionStage: 'superstructure' as ConstructionStage,
    approvedLaboratories: [
      {
        name: 'Accredited Lab',
        sanasAccreditationNumber: 'SANAS-001',
        accreditedTestMethods: ['SANS 3001-GR1'],
        isActive: true,
      },
    ],
    createdBy: 'user-engineer',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Set up Firestore mocks for recordLabResult.
 * - getDoc (1st call): returns the MaterialTest
 * - getDoc (2nd call): returns the TestingSchedule with specified thresholdUnit
 * - getDocs: returns empty results (no duplicate lab reports)
 * - addDoc: succeeds (stores the lab result)
 * - updateDoc: succeeds (updates the material test status)
 */
function setupLabResultMocks(thresholdUnit: string) {
  const materialTest = createMockMaterialTest();
  const testingSchedule = createMockTestingSchedule(thresholdUnit);

  let getDocCallCount = 0;
  vi.mocked(firestore.getDoc).mockImplementation(async () => {
    getDocCallCount++;
    if (getDocCallCount === 1) {
      // First call: material test
      return {
        exists: () => true,
        id: materialTest.id,
        data: () => {
          const { id: _id, ...rest } = materialTest;
          return rest;
        },
        ref: { id: materialTest.id },
      } as any;
    }
    // Second call: testing schedule
    return {
      exists: () => true,
      id: testingSchedule.id,
      data: () => {
        const { id: _id, ...rest } = testingSchedule;
        return rest;
      },
      ref: { id: testingSchedule.id },
    } as any;
  });

  // No duplicate lab reports
  vi.mocked(firestore.getDocs).mockResolvedValue({
    empty: true,
    size: 0,
    docs: [],
    forEach: vi.fn(),
  } as any);

  // addDoc succeeds
  vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'new-result-id' } as any);

  // updateDoc succeeds
  vi.mocked(firestore.updateDoc).mockResolvedValue(undefined as any);

  return { materialTest, testingSchedule };
}

/**
 * Build a valid RecordLabResultInput.
 */
function buildLabResultInput(resultUnit: string): RecordLabResultInput {
  return {
    projectId: 'test-project-id',
    materialTestId: 'test-material-test-id',
    testDate: '2025-01-29T10:00:00.000Z',
    resultValue: 30.5,
    resultUnit,
    testingLaboratoryName: 'Accredited Lab',
    labReportReference: 'LAB-REF-001',
    recordedBy: 'user-engineer',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 16: Lab result unit must match testing schedule unit
// Validates: Requirements 6.8
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 16: Lab result unit must match testing schedule unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * For any pair of distinct strings (resultUnit, thresholdUnit) where
   * resultUnit !== thresholdUnit, recordLabResult SHALL throw ITPServiceError
   * with code 'unit_mismatch'.
   */
  it('rejects submission when resultUnit does not match thresholdUnit', async () => {
    await fc.assert(
      fc.asyncProperty(arbMismatchedUnits, async ({ resultUnit, thresholdUnit }) => {
        vi.clearAllMocks();
        setupLabResultMocks(thresholdUnit);

        const input = buildLabResultInput(resultUnit);

        await expect(recordLabResult(input)).rejects.toThrow(ITPServiceError);

        try {
          await recordLabResult(input);
        } catch (error) {
          expect(error).toBeInstanceOf(ITPServiceError);
          expect((error as ITPServiceError).code).toBe('unit_mismatch');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * For any pair of distinct strings (resultUnit, thresholdUnit), the error
   * message SHALL specify the expected unit from the testing schedule.
   */
  it('error message specifies the expected unit', async () => {
    await fc.assert(
      fc.asyncProperty(arbMismatchedUnits, async ({ resultUnit, thresholdUnit }) => {
        vi.clearAllMocks();
        setupLabResultMocks(thresholdUnit);

        const input = buildLabResultInput(resultUnit);

        try {
          await recordLabResult(input);
          // Should not reach here
          expect.fail('recordLabResult should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ITPServiceError);
          const itpError = error as ITPServiceError;
          expect(itpError.message).toContain(thresholdUnit);
          expect(itpError.message).toContain(resultUnit);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * For any unit string U, when resultUnit === thresholdUnit === U,
   * recordLabResult SHALL NOT throw a unit_mismatch error.
   * (It may succeed or throw a different error, but never unit_mismatch.)
   */
  it('does not throw unit_mismatch when resultUnit matches thresholdUnit', async () => {
    await fc.assert(
      fc.asyncProperty(arbMatchingUnit, async (unit) => {
        vi.clearAllMocks();
        setupLabResultMocks(unit);

        const input = buildLabResultInput(unit);

        try {
          await recordLabResult(input);
          // If it succeeds, unit_mismatch was not thrown — pass
        } catch (error) {
          if (error instanceof ITPServiceError) {
            // It may throw other errors (lab_not_accredited, etc.) but NOT unit_mismatch
            expect(error.code).not.toBe('unit_mismatch');
          }
          // Non-ITPServiceError exceptions are acceptable (e.g., mock-related)
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * Edge case: case sensitivity — 'MPa' vs 'mpa' should be treated as mismatch.
   * The comparison is exact string match; no case-insensitive normalization.
   */
  it('treats case differences as unit mismatch (case-sensitive comparison)', async () => {
    const caseSensitivePairs = [
      { resultUnit: 'mpa', thresholdUnit: 'MPa' },
      { resultUnit: 'MPa', thresholdUnit: 'mpa' },
      { resultUnit: 'Mpa', thresholdUnit: 'MPa' },
      { resultUnit: 'KN', thresholdUnit: 'kN' },
      { resultUnit: 'kn', thresholdUnit: 'kN' },
    ];

    for (const { resultUnit, thresholdUnit } of caseSensitivePairs) {
      vi.clearAllMocks();
      setupLabResultMocks(thresholdUnit);

      const input = buildLabResultInput(resultUnit);

      try {
        await recordLabResult(input);
        expect.fail(`Expected unit_mismatch for resultUnit='${resultUnit}' vs thresholdUnit='${thresholdUnit}'`);
      } catch (error) {
        expect(error).toBeInstanceOf(ITPServiceError);
        expect((error as ITPServiceError).code).toBe('unit_mismatch');
      }
    }
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * Edge case: whitespace differences — 'MPa ' vs 'MPa' should be treated as mismatch.
   * The comparison is exact string match; no trimming is performed.
   */
  it('treats whitespace differences as unit mismatch (no trimming)', async () => {
    const whitespacePairs = [
      { resultUnit: ' MPa', thresholdUnit: 'MPa' },
      { resultUnit: 'MPa ', thresholdUnit: 'MPa' },
      { resultUnit: ' MPa ', thresholdUnit: 'MPa' },
      { resultUnit: 'M Pa', thresholdUnit: 'MPa' },
    ];

    for (const { resultUnit, thresholdUnit } of whitespacePairs) {
      vi.clearAllMocks();
      setupLabResultMocks(thresholdUnit);

      const input = buildLabResultInput(resultUnit);

      try {
        await recordLabResult(input);
        expect.fail(`Expected unit_mismatch for resultUnit='${resultUnit}' vs thresholdUnit='${thresholdUnit}'`);
      } catch (error) {
        expect(error).toBeInstanceOf(ITPServiceError);
        expect((error as ITPServiceError).code).toBe('unit_mismatch');
      }
    }
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * Property: the error fields should contain a reference to the expected unit.
   */
  it('error fields include expected unit information', async () => {
    await fc.assert(
      fc.asyncProperty(arbMismatchedUnits, async ({ resultUnit, thresholdUnit }) => {
        vi.clearAllMocks();
        setupLabResultMocks(thresholdUnit);

        const input = buildLabResultInput(resultUnit);

        try {
          await recordLabResult(input);
          expect.fail('recordLabResult should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ITPServiceError);
          const itpError = error as ITPServiceError;
          expect(itpError.fields).toBeDefined();
          expect(itpError.fields?.resultUnit).toContain(thresholdUnit);
        }
      }),
      { numRuns: 100 },
    );
  });
});
