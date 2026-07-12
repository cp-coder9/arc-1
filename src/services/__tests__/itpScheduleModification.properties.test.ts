// @vitest-environment node
/**
 * Property-based tests — Schedule Modification Scope.
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 13: Schedule modifications only affect future tests
 *   Validates: Requirements 5.7
 *   For any testing schedule modification made after M material tests already exist,
 *   all M existing tests shall retain the original parameters (threshold, frequency),
 *   and only tests created after the modification date shall use the updated parameters.
 *
 * The key insight: updateTestingSchedule() updates ONLY the schedule document itself
 * (via a single updateDoc call on the schedule). It does NOT touch any existing
 * material test documents. Existing tests were created with snapshot values from
 * the schedule at creation time, so updating the schedule doesn't retroactively
 * change them.
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
import { updateTestingSchedule, type UpdateTestingScheduleInput } from '@/services/itpService';

import type {
  MaterialType,
  SANSTestCategory,
  ConstructionStage,
  TestingSchedule,
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

const CONSTRUCTION_STAGES: ConstructionStage[] = [
  'site_establishment',
  'earthworks',
  'foundations',
  'substructure',
  'superstructure',
  'roof',
  'external_envelope',
  'internal_finishes',
  'mechanical_electrical',
  'external_works',
  'commissioning',
];

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for a valid project ID (lowercase alpha). */
const arbProjectId = fc
  .array(fc.integer({ min: 97, max: 122 }), { minLength: 5, maxLength: 20 })
  .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/** Arbitrary for a valid schedule ID (lowercase alpha). */
const arbScheduleId = fc
  .array(fc.integer({ min: 97, max: 122 }), { minLength: 5, maxLength: 20 })
  .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/** Arbitrary for a valid user ID. */
const arbUserId = fc
  .array(fc.integer({ min: 97, max: 122 }), { minLength: 5, maxLength: 15 })
  .map((codes) => 'user-' + codes.map((c) => String.fromCharCode(c)).join(''));

/** Arbitrary for material type. */
const arbMaterialType: fc.Arbitrary<MaterialType> = fc.constantFrom(...MATERIAL_TYPES);

/** Arbitrary for test category. */
const arbTestCategory: fc.Arbitrary<SANSTestCategory> = fc.constantFrom(...TEST_CATEGORIES);

/** Arbitrary for construction stage. */
const arbConstructionStage: fc.Arbitrary<ConstructionStage> = fc.constantFrom(...CONSTRUCTION_STAGES);

/** Arbitrary for threshold direction. */
const arbThresholdDirection = fc.constantFrom<'gte' | 'lte'>('gte', 'lte');

/** Arbitrary for frequency ratio (positive). */
const arbFrequencyRatio = fc.integer({ min: 1, max: 10 });

/** Arbitrary for frequency quantity (positive). */
const arbFrequencyQuantity = fc.integer({ min: 1, max: 500 });

/** Arbitrary for acceptance threshold. */
const arbThreshold = fc.double({ min: 0.01, max: 999_999.99, noNaN: true });

/** Arbitrary for expected turnaround days (1-90). */
const arbTurnaroundDays = fc.integer({ min: 1, max: 90 });

/** Arbitrary for min samples per test (1-10). */
const arbMinSamples = fc.integer({ min: 1, max: 10 });

/** Arbitrary number of existing material tests (1-50). */
const arbExistingTestCount = fc.integer({ min: 1, max: 50 });

/**
 * Arbitrary for a schedule update — generates a partial update with at least
 * one field changed. This models any schedule modification scenario.
 */
const arbScheduleUpdate = fc.record({
  acceptanceThreshold: fc.option(arbThreshold, { nil: undefined }),
  testFrequencyRatio: fc.option(arbFrequencyRatio, { nil: undefined }),
  testFrequencyQuantity: fc.option(arbFrequencyQuantity, { nil: undefined }),
  expectedTurnaroundDays: fc.option(arbTurnaroundDays, { nil: undefined }),
  minSamplesPerTest: fc.option(arbMinSamples, { nil: undefined }),
  thresholdDirection: fc.option(arbThresholdDirection, { nil: undefined }),
  materialType: fc.option(arbMaterialType, { nil: undefined }),
  testCategory: fc.option(arbTestCategory, { nil: undefined }),
  constructionStage: fc.option(arbConstructionStage, { nil: undefined }),
}).filter((rec) => {
  // Ensure at least one field is defined
  return Object.values(rec).some((v) => v !== undefined);
});

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Creates a mock existing testing schedule record.
 */
function createMockSchedule(overrides?: Partial<TestingSchedule>): Omit<TestingSchedule, 'id'> {
  return {
    projectId: 'proj-123',
    materialType: 'concrete',
    sansTestMethodReference: 'SANS 3001-CO1',
    testCategory: 'concrete_28day',
    testFrequencyRatio: 1,
    testFrequencyQuantity: 50,
    unitOfMeasure: 'm³',
    minSamplesPerTest: 3,
    acceptanceThreshold: 25,
    thresholdUnit: 'MPa',
    thresholdDirection: 'gte',
    expectedTurnaroundDays: 28,
    constructionStage: 'superstructure',
    approvedLaboratories: [
      {
        name: 'Test Lab SA',
        sanasAccreditationNumber: 'SANAS-001',
        accreditedTestMethods: ['SANS 3001-CO1'],
        isActive: true,
      },
    ],
    createdBy: 'user-engineer',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-03-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Set up Firestore mocks for updateTestingSchedule.
 * - getDoc: returns the existing schedule
 * - updateDoc: records calls (should only be called on schedule doc)
 * - addDoc: records calls (should NOT be called for material test updates)
 */
function setupMocks(scheduleId: string, existingSchedule: Omit<TestingSchedule, 'id'>) {
  const updateDocCalls: Array<{ ref: any; data: any }> = [];

  // Mock getDoc to return the existing schedule
  vi.mocked(firestore.getDoc).mockResolvedValue({
    exists: () => true,
    id: scheduleId,
    data: () => ({ ...existingSchedule }),
    ref: { id: scheduleId },
  } as any);

  // Mock updateDoc to capture calls
  vi.mocked(firestore.updateDoc).mockImplementation(async (ref: any, data: any) => {
    updateDocCalls.push({ ref, data });
  });

  // Mock addDoc for audit records
  vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'audit-record-id' } as any);

  return { updateDocCalls };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 13: Schedule modifications only affect future tests
// Validates: Requirements 5.7
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 13: Schedule modifications only affect future tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 5.7**
   *
   * For any schedule update, updateTestingSchedule() only calls updateDoc on the
   * schedule document itself — it never calls updateDoc on material test documents.
   * This ensures existing tests retain their original parameters.
   */
  it('updateTestingSchedule only updates the schedule document, never existing material test documents', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbScheduleId,
        arbUserId,
        arbScheduleUpdate,
        arbExistingTestCount,
        async (projectId, scheduleId, userId, scheduleUpdate, _existingTestCount) => {
          vi.clearAllMocks();

          const existingSchedule = createMockSchedule();
          const { updateDocCalls } = setupMocks(scheduleId, existingSchedule);

          const input: UpdateTestingScheduleInput = {
            ...scheduleUpdate,
            actorUserId: userId,
          };

          await updateTestingSchedule(projectId, scheduleId, input);

          // updateDoc should have been called exactly once — on the schedule document only
          // The first updateDoc call is the schedule update itself
          expect(updateDocCalls.length).toBe(1);

          // Verify no material test documents were updated (updateDoc was only called once)
          // The single call should be to the schedule document ref
          const scheduleUpdateCall = updateDocCalls[0];
          expect(scheduleUpdateCall).toBeDefined();
          expect(scheduleUpdateCall.data).toHaveProperty('updatedAt');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.7**
   *
   * The schedule update payload contains the new parameter values from the modification.
   * These new values will only be read by tests created AFTER the modification.
   */
  it('schedule update payload contains the new parameter values', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbScheduleId,
        arbUserId,
        arbScheduleUpdate,
        async (projectId, scheduleId, userId, scheduleUpdate) => {
          vi.clearAllMocks();

          const existingSchedule = createMockSchedule();
          const { updateDocCalls } = setupMocks(scheduleId, existingSchedule);

          const input: UpdateTestingScheduleInput = {
            ...scheduleUpdate,
            actorUserId: userId,
          };

          await updateTestingSchedule(projectId, scheduleId, input);

          expect(updateDocCalls.length).toBe(1);
          const writtenData = updateDocCalls[0].data;

          // Each defined field in the update should appear in the written data
          if (scheduleUpdate.acceptanceThreshold !== undefined) {
            expect(writtenData.acceptanceThreshold).toBe(scheduleUpdate.acceptanceThreshold);
          }
          if (scheduleUpdate.testFrequencyRatio !== undefined) {
            expect(writtenData.testFrequencyRatio).toBe(scheduleUpdate.testFrequencyRatio);
          }
          if (scheduleUpdate.testFrequencyQuantity !== undefined) {
            expect(writtenData.testFrequencyQuantity).toBe(scheduleUpdate.testFrequencyQuantity);
          }
          if (scheduleUpdate.expectedTurnaroundDays !== undefined) {
            expect(writtenData.expectedTurnaroundDays).toBe(scheduleUpdate.expectedTurnaroundDays);
          }
          if (scheduleUpdate.minSamplesPerTest !== undefined) {
            expect(writtenData.minSamplesPerTest).toBe(scheduleUpdate.minSamplesPerTest);
          }
          if (scheduleUpdate.thresholdDirection !== undefined) {
            expect(writtenData.thresholdDirection).toBe(scheduleUpdate.thresholdDirection);
          }
          if (scheduleUpdate.materialType !== undefined) {
            expect(writtenData.materialType).toBe(scheduleUpdate.materialType);
          }
          if (scheduleUpdate.testCategory !== undefined) {
            expect(writtenData.testCategory).toBe(scheduleUpdate.testCategory);
          }
          if (scheduleUpdate.constructionStage !== undefined) {
            expect(writtenData.constructionStage).toBe(scheduleUpdate.constructionStage);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.7**
   *
   * Regardless of how many existing material tests are associated with the schedule,
   * updateTestingSchedule never queries or modifies the material_tests collection.
   * getDocs is never called to fetch existing material tests during a schedule update.
   */
  it('updateTestingSchedule does not query or modify existing material tests', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbScheduleId,
        arbUserId,
        arbScheduleUpdate,
        arbExistingTestCount,
        async (projectId, scheduleId, userId, scheduleUpdate, _existingTestCount) => {
          vi.clearAllMocks();

          const existingSchedule = createMockSchedule();
          setupMocks(scheduleId, existingSchedule);

          const input: UpdateTestingScheduleInput = {
            ...scheduleUpdate,
            actorUserId: userId,
          };

          await updateTestingSchedule(projectId, scheduleId, input);

          // getDocs should never be called — schedule update doesn't need to query material tests
          expect(firestore.getDocs).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.7**
   *
   * The schedule update always records an updatedAt timestamp, indicating when
   * the modification occurred. Tests created after this timestamp will pick up
   * the new values; tests created before retain original values.
   */
  it('schedule update always includes an updatedAt timestamp marking modification time', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbScheduleId,
        arbUserId,
        arbScheduleUpdate,
        async (projectId, scheduleId, userId, scheduleUpdate) => {
          vi.clearAllMocks();

          const existingSchedule = createMockSchedule();
          const { updateDocCalls } = setupMocks(scheduleId, existingSchedule);

          const input: UpdateTestingScheduleInput = {
            ...scheduleUpdate,
            actorUserId: userId,
          };

          await updateTestingSchedule(projectId, scheduleId, input);

          expect(updateDocCalls.length).toBe(1);
          const writtenData = updateDocCalls[0].data;

          // updatedAt must be present and be a valid ISO timestamp
          expect(writtenData.updatedAt).toBeDefined();
          expect(typeof writtenData.updatedAt).toBe('string');
          const parsedDate = new Date(writtenData.updatedAt as string);
          expect(parsedDate.getTime()).not.toBeNaN();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.7**
   *
   * Fields NOT included in the update are NOT written to the schedule document
   * (only explicitly changed fields are persisted, preserving unmodified fields).
   */
  it('only explicitly provided update fields are written to the schedule document', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbScheduleId,
        arbUserId,
        arbScheduleUpdate,
        async (projectId, scheduleId, userId, scheduleUpdate) => {
          vi.clearAllMocks();

          const existingSchedule = createMockSchedule();
          const { updateDocCalls } = setupMocks(scheduleId, existingSchedule);

          const input: UpdateTestingScheduleInput = {
            ...scheduleUpdate,
            actorUserId: userId,
          };

          await updateTestingSchedule(projectId, scheduleId, input);

          expect(updateDocCalls.length).toBe(1);
          const writtenData = updateDocCalls[0].data;

          // Fields that were undefined in the update should NOT appear in the written data
          // (except updatedAt which is always added)
          if (scheduleUpdate.acceptanceThreshold === undefined) {
            expect(writtenData).not.toHaveProperty('acceptanceThreshold');
          }
          if (scheduleUpdate.testFrequencyRatio === undefined) {
            expect(writtenData).not.toHaveProperty('testFrequencyRatio');
          }
          if (scheduleUpdate.testFrequencyQuantity === undefined) {
            expect(writtenData).not.toHaveProperty('testFrequencyQuantity');
          }
          if (scheduleUpdate.expectedTurnaroundDays === undefined) {
            expect(writtenData).not.toHaveProperty('expectedTurnaroundDays');
          }
          if (scheduleUpdate.minSamplesPerTest === undefined) {
            expect(writtenData).not.toHaveProperty('minSamplesPerTest');
          }
          if (scheduleUpdate.thresholdDirection === undefined) {
            expect(writtenData).not.toHaveProperty('thresholdDirection');
          }
          if (scheduleUpdate.materialType === undefined) {
            expect(writtenData).not.toHaveProperty('materialType');
          }
          if (scheduleUpdate.testCategory === undefined) {
            expect(writtenData).not.toHaveProperty('testCategory');
          }
          if (scheduleUpdate.constructionStage === undefined) {
            expect(writtenData).not.toHaveProperty('constructionStage');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
