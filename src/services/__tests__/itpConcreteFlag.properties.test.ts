// @vitest-environment node
/**
 * Property-based tests — ITP 7-day Concrete Failure Flagging
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 15: 7-day concrete failure flags corresponding 28-day test
 *   **Validates: Requirements 6.4**
 *   For any concrete cube test at 7 days that fails, if a 28-day material test
 *   exists with the same sample identification number, that 28-day test shall
 *   be flagged as `isPriority = true`.
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
import { recordLabResult } from '@/services/itpService';
import type {
  MaterialTest,
  TestingSchedule,
  SANSTestCategory,
  MaterialTestStatus,
  MaterialType,
} from '@/types';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for a project ID. */
const arbProjectId = fc.uuid();

/** Arbitrary for a material test ID. */
const arbMaterialTestId = fc.uuid();

/** Arbitrary for a sample identification number. */
const arbSampleId = fc.string({ minLength: 3, maxLength: 20 });

/** Arbitrary for a testing schedule ID. */
const arbScheduleId = fc.uuid();

/**
 * Arbitrary for a threshold value (positive number).
 * Using integer values with a minimum of 10 to ensure we can generate failing values below.
 */
const arbThreshold = fc.integer({ min: 10, max: 1000 });

/**
 * Arbitrary for a result value that FAILS a 'gte' threshold.
 * The value is strictly less than the threshold.
 */
function arbFailingValue(threshold: number): fc.Arbitrary<number> {
  // Value is between 0 and threshold - 1 (integer below threshold)
  return fc.integer({ min: 0, max: Math.max(0, threshold - 1) });
}

/**
 * Arbitrary for a result value that PASSES a 'gte' threshold.
 * The value meets or exceeds the threshold.
 */
function arbPassingValue(threshold: number): fc.Arbitrary<number> {
  return fc.integer({ min: threshold, max: threshold + 500 });
}

/** Arbitrary for a lab report reference. */
const arbLabReportRef = fc.string({ minLength: 1, maxLength: 50 });

/** Arbitrary for a lab name. */
const arbLabName = fc.string({ minLength: 3, maxLength: 50 });

/** Arbitrary for a user ID (recordedBy). */
const arbUserId = fc.uuid();

/** Non-concrete test categories. */
const nonConcreteCategories: SANSTestCategory[] = [
  'soil_compaction',
  'steel_tensile',
  'aggregate_grading',
  'bituminous_binder',
];

const arbNonConcreteCategory = fc.constantFrom(...nonConcreteCategories);

/** Non-concrete material types (matching non-concrete categories). */
const nonConcreteMaterials: MaterialType[] = ['soil', 'steel', 'aggregate', 'bituminous'];
const arbNonConcreteMaterial = fc.constantFrom(...nonConcreteMaterials);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMaterialTest(overrides: Partial<MaterialTest> & { id: string }): MaterialTest {
  return {
    projectId: 'proj-1',
    testingScheduleId: 'sched-1',
    sampleId: 'SAMPLE-001',
    materialType: 'concrete',
    testCategory: 'concrete_7day',
    sansTestMethodReference: 'SANS 3001-CO1',
    dateSampled: '2025-01-01T00:00:00.000Z',
    dateTestDue: '2025-01-08T00:00:00.000Z',
    testingLaboratoryName: 'TestLab',
    status: 'submitted_to_lab' as MaterialTestStatus,
    linkedInspectionItemIds: [],
    isPriority: false,
    createdBy: 'user-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildTestingSchedule(overrides: Partial<TestingSchedule> & { id: string }): TestingSchedule {
  return {
    projectId: 'proj-1',
    materialType: 'concrete',
    sansTestMethodReference: 'SANS 3001-CO1',
    testCategory: 'concrete_7day',
    testFrequencyRatio: 1,
    testFrequencyQuantity: 50,
    unitOfMeasure: 'm³',
    minSamplesPerTest: 3,
    acceptanceThreshold: 25,
    thresholdUnit: 'MPa',
    thresholdDirection: 'gte' as const,
    expectedTurnaroundDays: 7,
    constructionStage: 'superstructure' as const,
    approvedLaboratories: [
      {
        name: 'TestLab',
        sanasAccreditationNumber: 'SANAS-001',
        accreditedTestMethods: ['SANS 3001-CO1'],
        isActive: true,
      },
    ],
    createdBy: 'user-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 15: 7-day concrete failure flags corresponding 28-day test
// **Validates: Requirements 6.4**
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 15: 7-day concrete failure flags corresponding 28-day test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * For any concrete 7-day test that fails (result < threshold with gte direction),
   * if a matching 28-day test with the same sampleId exists, that 28-day test
   * shall be flagged as isPriority = true.
   */
  it('flags matching 28-day test as isPriority when 7-day concrete test fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbMaterialTestId,
        arbSampleId,
        arbScheduleId,
        arbThreshold,
        arbLabReportRef,
        arbLabName,
        arbUserId,
        async (projectId, materialTestId, sampleId, scheduleId, threshold, labRef, labName, userId) => {
          vi.clearAllMocks();

          const failingValue = Math.max(0, threshold - 1); // guaranteed to fail gte threshold

          const materialTest = buildMaterialTest({
            id: materialTestId,
            projectId,
            testingScheduleId: scheduleId,
            sampleId,
            materialType: 'concrete',
            testCategory: 'concrete_7day',
            testingLaboratoryName: labName,
            sansTestMethodReference: 'SANS 3001-CO1',
          });

          const schedule = buildTestingSchedule({
            id: scheduleId,
            projectId,
            acceptanceThreshold: threshold,
            thresholdUnit: 'MPa',
            thresholdDirection: 'gte',
            approvedLaboratories: [
              {
                name: labName,
                sanasAccreditationNumber: 'SANAS-001',
                accreditedTestMethods: ['SANS 3001-CO1'],
                isActive: true,
              },
            ],
          });

          // Mock 28-day test doc reference
          const mock28DayRef = { id: '28day-test-id', path: `projects/${projectId}/material_tests/28day-test-id` };

          // Setup getDoc to return the material test and testing schedule
          let getDocCallCount = 0;
          vi.mocked(firestore.getDoc).mockImplementation(async () => {
            getDocCallCount++;
            if (getDocCallCount === 1) {
              // First call: fetch the material test
              return {
                exists: () => true,
                id: materialTestId,
                data: () => ({ ...materialTest, id: undefined }),
                ref: { id: materialTestId },
              } as any;
            }
            // Second call: fetch the testing schedule
            return {
              exists: () => true,
              id: scheduleId,
              data: () => ({ ...schedule, id: undefined }),
              ref: { id: scheduleId },
            } as any;
          });

          // Mock getDocs: first call for duplicate check (no duplicates), second for 28-day query
          let getDocsCallCount = 0;
          vi.mocked(firestore.getDocs).mockImplementation(async () => {
            getDocsCallCount++;
            if (getDocsCallCount === 1) {
              // Duplicate check — no existing results
              return { empty: true, size: 0, docs: [], forEach: vi.fn() } as any;
            }
            // 28-day test query — return one matching test
            return {
              empty: false,
              size: 1,
              docs: [{ id: '28day-test-id', ref: mock28DayRef, data: () => ({ sampleId, testCategory: 'concrete_28day' }) }],
              forEach: vi.fn(),
            } as any;
          });

          // Track updateDoc calls
          const updateDocCalls: Array<{ ref: any; data: Record<string, unknown> }> = [];
          vi.mocked(firestore.updateDoc).mockImplementation(async (docRef: any, data: any) => {
            updateDocCalls.push({ ref: docRef, data: { ...data } });
            return undefined;
          });

          // Mock addDoc for lab result storage and audit
          vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'lab-result-id' } as any);

          await recordLabResult({
            projectId,
            materialTestId,
            testDate: '2025-01-08T00:00:00.000Z',
            resultValue: failingValue,
            resultUnit: 'MPa',
            testingLaboratoryName: labName,
            labReportReference: labRef,
            recordedBy: userId,
          });

          // Verify that updateDoc was called on the 28-day test with isPriority: true
          const priorityUpdate = updateDocCalls.find(
            (call) => call.ref === mock28DayRef && call.data.isPriority === true,
          );
          expect(priorityUpdate).toBeDefined();
          expect(priorityUpdate!.data.isPriority).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * When no matching 28-day test exists for the same sampleId, no error occurs
   * and no isPriority flagging happens.
   */
  it('does not error when no matching 28-day test exists for failing 7-day concrete test', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbMaterialTestId,
        arbSampleId,
        arbScheduleId,
        arbThreshold,
        arbLabReportRef,
        arbLabName,
        arbUserId,
        async (projectId, materialTestId, sampleId, scheduleId, threshold, labRef, labName, userId) => {
          vi.clearAllMocks();

          const failingValue = Math.max(0, threshold - 1);

          const materialTest = buildMaterialTest({
            id: materialTestId,
            projectId,
            testingScheduleId: scheduleId,
            sampleId,
            materialType: 'concrete',
            testCategory: 'concrete_7day',
            testingLaboratoryName: labName,
            sansTestMethodReference: 'SANS 3001-CO1',
          });

          const schedule = buildTestingSchedule({
            id: scheduleId,
            projectId,
            acceptanceThreshold: threshold,
            thresholdUnit: 'MPa',
            thresholdDirection: 'gte',
            approvedLaboratories: [
              {
                name: labName,
                sanasAccreditationNumber: 'SANAS-001',
                accreditedTestMethods: ['SANS 3001-CO1'],
                isActive: true,
              },
            ],
          });

          let getDocCallCount = 0;
          vi.mocked(firestore.getDoc).mockImplementation(async () => {
            getDocCallCount++;
            if (getDocCallCount === 1) {
              return {
                exists: () => true,
                id: materialTestId,
                data: () => ({ ...materialTest, id: undefined }),
                ref: { id: materialTestId },
              } as any;
            }
            return {
              exists: () => true,
              id: scheduleId,
              data: () => ({ ...schedule, id: undefined }),
              ref: { id: scheduleId },
            } as any;
          });

          // Mock getDocs: duplicate check returns empty, 28-day query returns empty
          let getDocsCallCount = 0;
          vi.mocked(firestore.getDocs).mockImplementation(async () => {
            getDocsCallCount++;
            // Both calls return empty
            return { empty: true, size: 0, docs: [], forEach: vi.fn() } as any;
          });

          const updateDocCalls: Array<{ ref: any; data: Record<string, unknown> }> = [];
          vi.mocked(firestore.updateDoc).mockImplementation(async (docRef: any, data: any) => {
            updateDocCalls.push({ ref: docRef, data: { ...data } });
            return undefined;
          });

          vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'lab-result-id' } as any);

          // Should not throw
          await recordLabResult({
            projectId,
            materialTestId,
            testDate: '2025-01-08T00:00:00.000Z',
            resultValue: failingValue,
            resultUnit: 'MPa',
            testingLaboratoryName: labName,
            labReportReference: labRef,
            recordedBy: userId,
          });

          // Only the parent test status update should occur, no isPriority update
          const priorityUpdates = updateDocCalls.filter(
            (call) => call.data.isPriority === true,
          );
          expect(priorityUpdates.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * When the 7-day concrete test PASSES, no 28-day test should be flagged as priority.
   */
  it('does not flag 28-day test when 7-day concrete test passes', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbMaterialTestId,
        arbSampleId,
        arbScheduleId,
        arbThreshold,
        arbLabReportRef,
        arbLabName,
        arbUserId,
        async (projectId, materialTestId, sampleId, scheduleId, threshold, labRef, labName, userId) => {
          vi.clearAllMocks();

          const passingValue = threshold; // exactly meets threshold for 'gte' → pass

          const materialTest = buildMaterialTest({
            id: materialTestId,
            projectId,
            testingScheduleId: scheduleId,
            sampleId,
            materialType: 'concrete',
            testCategory: 'concrete_7day',
            testingLaboratoryName: labName,
            sansTestMethodReference: 'SANS 3001-CO1',
          });

          const schedule = buildTestingSchedule({
            id: scheduleId,
            projectId,
            acceptanceThreshold: threshold,
            thresholdUnit: 'MPa',
            thresholdDirection: 'gte',
            approvedLaboratories: [
              {
                name: labName,
                sanasAccreditationNumber: 'SANAS-001',
                accreditedTestMethods: ['SANS 3001-CO1'],
                isActive: true,
              },
            ],
          });

          let getDocCallCount = 0;
          vi.mocked(firestore.getDoc).mockImplementation(async () => {
            getDocCallCount++;
            if (getDocCallCount === 1) {
              return {
                exists: () => true,
                id: materialTestId,
                data: () => ({ ...materialTest, id: undefined }),
                ref: { id: materialTestId },
              } as any;
            }
            return {
              exists: () => true,
              id: scheduleId,
              data: () => ({ ...schedule, id: undefined }),
              ref: { id: scheduleId },
            } as any;
          });

          // Only one getDocs call for duplicate check (no 28-day query since test passes)
          vi.mocked(firestore.getDocs).mockResolvedValue({
            empty: true,
            size: 0,
            docs: [],
            forEach: vi.fn(),
          } as any);

          const updateDocCalls: Array<{ ref: any; data: Record<string, unknown> }> = [];
          vi.mocked(firestore.updateDoc).mockImplementation(async (docRef: any, data: any) => {
            updateDocCalls.push({ ref: docRef, data: { ...data } });
            return undefined;
          });

          vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'lab-result-id' } as any);

          await recordLabResult({
            projectId,
            materialTestId,
            testDate: '2025-01-08T00:00:00.000Z',
            resultValue: passingValue,
            resultUnit: 'MPa',
            testingLaboratoryName: labName,
            labReportReference: labRef,
            recordedBy: userId,
          });

          // No isPriority flagging should occur
          const priorityUpdates = updateDocCalls.filter(
            (call) => call.data.isPriority === true,
          );
          expect(priorityUpdates.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * When a non-concrete test fails, no 28-day flagging occurs regardless
   * of whether a matching 28-day test exists.
   */
  it('does not flag 28-day test for non-concrete test failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbMaterialTestId,
        arbSampleId,
        arbScheduleId,
        arbThreshold,
        arbLabReportRef,
        arbLabName,
        arbUserId,
        arbNonConcreteCategory,
        arbNonConcreteMaterial,
        async (projectId, materialTestId, sampleId, scheduleId, threshold, labRef, labName, userId, testCategory, materialType) => {
          vi.clearAllMocks();

          const failingValue = Math.max(0, threshold - 1);

          const materialTest = buildMaterialTest({
            id: materialTestId,
            projectId,
            testingScheduleId: scheduleId,
            sampleId,
            materialType,
            testCategory,
            testingLaboratoryName: labName,
            sansTestMethodReference: 'SANS 3001-GR1',
          });

          const schedule = buildTestingSchedule({
            id: scheduleId,
            projectId,
            materialType,
            testCategory,
            sansTestMethodReference: 'SANS 3001-GR1',
            acceptanceThreshold: threshold,
            thresholdUnit: '%',
            thresholdDirection: 'gte',
            approvedLaboratories: [
              {
                name: labName,
                sanasAccreditationNumber: 'SANAS-002',
                accreditedTestMethods: ['SANS 3001-GR1'],
                isActive: true,
              },
            ],
          });

          let getDocCallCount = 0;
          vi.mocked(firestore.getDoc).mockImplementation(async () => {
            getDocCallCount++;
            if (getDocCallCount === 1) {
              return {
                exists: () => true,
                id: materialTestId,
                data: () => ({ ...materialTest, id: undefined }),
                ref: { id: materialTestId },
              } as any;
            }
            return {
              exists: () => true,
              id: scheduleId,
              data: () => ({ ...schedule, id: undefined }),
              ref: { id: scheduleId },
            } as any;
          });

          // Only one getDocs call for duplicate check (no 28-day query for non-concrete)
          vi.mocked(firestore.getDocs).mockResolvedValue({
            empty: true,
            size: 0,
            docs: [],
            forEach: vi.fn(),
          } as any);

          const updateDocCalls: Array<{ ref: any; data: Record<string, unknown> }> = [];
          vi.mocked(firestore.updateDoc).mockImplementation(async (docRef: any, data: any) => {
            updateDocCalls.push({ ref: docRef, data: { ...data } });
            return undefined;
          });

          vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'lab-result-id' } as any);

          await recordLabResult({
            projectId,
            materialTestId,
            testDate: '2025-01-08T00:00:00.000Z',
            resultValue: failingValue,
            resultUnit: '%',
            testingLaboratoryName: labName,
            labReportReference: labRef,
            recordedBy: userId,
          });

          // No isPriority flagging should occur for non-concrete tests
          const priorityUpdates = updateDocCalls.filter(
            (call) => call.data.isPriority === true,
          );
          expect(priorityUpdates.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
