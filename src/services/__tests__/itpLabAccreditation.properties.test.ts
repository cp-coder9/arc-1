// @vitest-environment node
/**
 * Property-based tests — ITP Lab Accreditation Validation.
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 11: Lab accreditation validation
 *   Validates: Requirements 5.5
 *   For any attempt to record a lab result where the specified testing laboratory
 *   is not SANAS-accredited for the applicable test method in the project's approved
 *   laboratory register, the result shall be rejected.
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
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

/** Arbitrary for lab name (1-200 printable chars). */
const arbLabName = arbPrintableString(1, 50);

/** Arbitrary for test method reference string. */
const arbTestMethod = arbPrintableString(3, 30);

/** Arbitrary for SANAS accreditation number. */
const arbSanasNumber = arbPrintableString(3, 20);

/** Arbitrary for a material type. */
const arbMaterialType: fc.Arbitrary<MaterialType> = fc.constantFrom(...MATERIAL_TYPES);

/** Arbitrary for a SANS test category. */
const arbTestCategory: fc.Arbitrary<SANSTestCategory> = fc.constantFrom(...SANS_TEST_CATEGORIES);

/** Arbitrary for a threshold direction. */
const arbThresholdDirection: fc.Arbitrary<ThresholdDirection> = fc.constantFrom(...THRESHOLD_DIRECTIONS);

/** Arbitrary for a construction stage. */
const arbConstructionStage: fc.Arbitrary<ConstructionStage> = fc.constantFrom(...CONSTRUCTION_STAGES);

/**
 * Arbitrary for an approved laboratory entry.
 */
const arbApprovedLab: fc.Arbitrary<ApprovedLaboratory> = fc.record({
  name: arbLabName,
  sanasAccreditationNumber: arbSanasNumber,
  accreditedTestMethods: fc.array(arbTestMethod, { minLength: 1, maxLength: 5 }),
  isActive: fc.boolean(),
});

/**
 * Arbitrary generating test scenario where the lab IS in the approved list
 * and IS accredited for the test method (happy path).
 */
const arbAccreditedScenario = fc.record({
  labName: arbLabName,
  testMethod: arbTestMethod,
  otherLabs: fc.array(arbApprovedLab, { minLength: 0, maxLength: 3 }),
}).map(({ labName, testMethod, otherLabs }) => ({
  labName,
  testMethod,
  approvedLaboratories: [
    ...otherLabs,
    {
      name: labName,
      sanasAccreditationNumber: 'SANAS-VALID-001',
      accreditedTestMethods: [testMethod, 'SANS 3001-OTHER'],
      isActive: true,
    },
  ] as ApprovedLaboratory[],
}));

/**
 * Arbitrary generating test scenario where the lab is NOT in the approved list at all.
 */
const arbLabNotInList = fc.record({
  submittedLabName: arbLabName,
  registeredLabNames: fc.array(arbLabName, { minLength: 1, maxLength: 5 }),
  testMethod: arbTestMethod,
}).filter(({ submittedLabName, registeredLabNames }) =>
  // Ensure submitted lab is NOT in the registered list
  !registeredLabNames.includes(submittedLabName),
).map(({ submittedLabName, registeredLabNames, testMethod }) => ({
  submittedLabName,
  testMethod,
  approvedLaboratories: registeredLabNames.map((name) => ({
    name,
    sanasAccreditationNumber: 'SANAS-REG-001',
    accreditedTestMethods: [testMethod],
    isActive: true,
  })) as ApprovedLaboratory[],
}));

/**
 * Arbitrary generating test scenario where the lab IS in the list but NOT
 * accredited for the specific test method.
 */
const arbLabNotAccreditedForMethod = fc.record({
  labName: arbLabName,
  requestedTestMethod: arbTestMethod,
  otherMethods: fc.array(arbTestMethod, { minLength: 1, maxLength: 5 }),
}).filter(({ requestedTestMethod, otherMethods }) =>
  // Ensure the requested method is not in the other methods
  !otherMethods.includes(requestedTestMethod),
).map(({ labName, requestedTestMethod, otherMethods }) => ({
  labName,
  testMethod: requestedTestMethod,
  approvedLaboratories: [
    {
      name: labName,
      sanasAccreditationNumber: 'SANAS-LAB-001',
      accreditedTestMethods: otherMethods,
      isActive: true,
    },
  ] as ApprovedLaboratory[],
}));

/**
 * Arbitrary generating test scenario where the lab IS in the list and IS accredited
 * for the method, but isActive = false.
 */
const arbLabInactiveScenario = fc.record({
  labName: arbLabName,
  testMethod: arbTestMethod,
}).map(({ labName, testMethod }) => ({
  labName,
  testMethod,
  approvedLaboratories: [
    {
      name: labName,
      sanasAccreditationNumber: 'SANAS-INACTIVE-001',
      accreditedTestMethods: [testMethod],
      isActive: false,
    },
  ] as ApprovedLaboratory[],
}));

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
    testingLaboratoryName: 'Default Lab',
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
 * Create a mock TestingSchedule with specified approved laboratories and test method.
 */
function createMockTestingSchedule(
  approvedLaboratories: ApprovedLaboratory[],
  sansTestMethodReference: string,
  overrides?: Partial<TestingSchedule>,
): TestingSchedule {
  return {
    id: 'test-schedule-id',
    projectId: 'test-project-id',
    materialType: 'concrete',
    sansTestMethodReference,
    testCategory: 'concrete_28day',
    testFrequencyRatio: 1,
    testFrequencyQuantity: 50,
    unitOfMeasure: 'm³',
    minSamplesPerTest: 3,
    acceptanceThreshold: 25,
    thresholdUnit: 'MPa',
    thresholdDirection: 'gte' as ThresholdDirection,
    expectedTurnaroundDays: 28,
    constructionStage: 'superstructure' as ConstructionStage,
    approvedLaboratories,
    createdBy: 'user-engineer',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Set up Firestore mocks for recordLabResult with a specific testing schedule.
 */
function setupMocks(approvedLaboratories: ApprovedLaboratory[], testMethod: string) {
  const materialTest = createMockMaterialTest({ sansTestMethodReference: testMethod });
  const testingSchedule = createMockTestingSchedule(approvedLaboratories, testMethod);

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
 * Build a valid RecordLabResultInput with a specific lab name.
 * Uses 'MPa' as resultUnit to match the default thresholdUnit in mock schedule.
 */
function buildLabResultInput(labName: string): RecordLabResultInput {
  return {
    projectId: 'test-project-id',
    materialTestId: 'test-material-test-id',
    testDate: '2025-01-29T10:00:00.000Z',
    resultValue: 30.5,
    resultUnit: 'MPa',
    testingLaboratoryName: labName,
    labReportReference: 'LAB-REF-001',
    recordedBy: 'user-engineer',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 11: Lab accreditation validation
// Validates: Requirements 5.5
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 11: Lab accreditation validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * For any lab name that is NOT in the approved laboratory register at all,
   * recordLabResult SHALL throw ITPServiceError with code 'lab_not_accredited'.
   */
  it('rejects result when lab is not in the approved laboratory list', async () => {
    await fc.assert(
      fc.asyncProperty(arbLabNotInList, async ({ submittedLabName, testMethod, approvedLaboratories }) => {
        vi.clearAllMocks();
        setupMocks(approvedLaboratories, testMethod);

        const input = buildLabResultInput(submittedLabName);

        await expect(recordLabResult(input)).rejects.toThrow(ITPServiceError);

        try {
          await recordLabResult(input);
        } catch (error) {
          expect(error).toBeInstanceOf(ITPServiceError);
          expect((error as ITPServiceError).code).toBe('lab_not_accredited');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * For any lab name that IS in the approved list but is NOT accredited for the
   * specific test method referenced by the testing schedule, recordLabResult
   * SHALL throw ITPServiceError with code 'lab_not_accredited'.
   */
  it('rejects result when lab is in list but not accredited for the test method', async () => {
    await fc.assert(
      fc.asyncProperty(arbLabNotAccreditedForMethod, async ({ labName, testMethod, approvedLaboratories }) => {
        vi.clearAllMocks();
        setupMocks(approvedLaboratories, testMethod);

        const input = buildLabResultInput(labName);

        await expect(recordLabResult(input)).rejects.toThrow(ITPServiceError);

        try {
          await recordLabResult(input);
        } catch (error) {
          expect(error).toBeInstanceOf(ITPServiceError);
          expect((error as ITPServiceError).code).toBe('lab_not_accredited');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * For any lab that IS in the approved list and IS accredited for the method
   * but has isActive=false, recordLabResult SHALL throw ITPServiceError
   * with code 'lab_not_accredited' (inactive labs are treated as not accredited).
   */
  it('rejects result when lab is in list and accredited but isActive=false', async () => {
    await fc.assert(
      fc.asyncProperty(arbLabInactiveScenario, async ({ labName, testMethod, approvedLaboratories }) => {
        vi.clearAllMocks();
        setupMocks(approvedLaboratories, testMethod);

        const input = buildLabResultInput(labName);

        await expect(recordLabResult(input)).rejects.toThrow(ITPServiceError);

        try {
          await recordLabResult(input);
        } catch (error) {
          expect(error).toBeInstanceOf(ITPServiceError);
          expect((error as ITPServiceError).code).toBe('lab_not_accredited');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * For any lab that IS in the approved list, IS accredited for the test method,
   * and IS active, recordLabResult SHALL NOT throw a 'lab_not_accredited' error.
   * (It may succeed or throw a different error, but never lab_not_accredited.)
   */
  it('does not reject when lab is accredited and active for the test method', async () => {
    await fc.assert(
      fc.asyncProperty(arbAccreditedScenario, async ({ labName, testMethod, approvedLaboratories }) => {
        vi.clearAllMocks();
        setupMocks(approvedLaboratories, testMethod);

        const input = buildLabResultInput(labName);

        try {
          await recordLabResult(input);
          // If it succeeds, lab_not_accredited was not thrown — pass
        } catch (error) {
          if (error instanceof ITPServiceError) {
            // It may throw other errors (duplicate_lab_report, etc.) but NOT lab_not_accredited
            expect(error.code).not.toBe('lab_not_accredited');
          }
          // Non-ITPServiceError exceptions are acceptable (e.g., mock-related)
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * The error message SHALL identify the lab name and the test method
   * for which accreditation is missing.
   */
  it('error message identifies the lab name and test method', async () => {
    await fc.assert(
      fc.asyncProperty(arbLabNotInList, async ({ submittedLabName, testMethod, approvedLaboratories }) => {
        vi.clearAllMocks();
        setupMocks(approvedLaboratories, testMethod);

        const input = buildLabResultInput(submittedLabName);

        try {
          await recordLabResult(input);
          expect.fail('recordLabResult should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ITPServiceError);
          const itpError = error as ITPServiceError;
          expect(itpError.message).toContain(submittedLabName);
          expect(itpError.message).toContain(testMethod);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * The error fields SHALL contain information about the accreditation issue.
   */
  it('error fields include accreditation information', async () => {
    await fc.assert(
      fc.asyncProperty(arbLabNotAccreditedForMethod, async ({ labName, testMethod, approvedLaboratories }) => {
        vi.clearAllMocks();
        setupMocks(approvedLaboratories, testMethod);

        const input = buildLabResultInput(labName);

        try {
          await recordLabResult(input);
          expect.fail('recordLabResult should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ITPServiceError);
          const itpError = error as ITPServiceError;
          expect(itpError.fields).toBeDefined();
          expect(itpError.fields?.testingLaboratoryName).toBeDefined();
          expect(itpError.fields!.testingLaboratoryName).toContain(testMethod);
        }
      }),
      { numRuns: 100 },
    );
  });
});
