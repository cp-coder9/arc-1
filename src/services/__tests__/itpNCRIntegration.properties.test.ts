// @vitest-environment node
/**
 * Property-based tests — ITP NCR Integration: NCR Lifecycle Constraints
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 22: NCR lifecycle constrains item state
 *   Validates: Requirements 7.4, 7.5
 *   For any inspection item or material test with a linked NCR in status
 *   'open' or 'corrective_action_submitted', the item shall not be markable
 *   as 'passed'; when the linked NCR transitions to 'verified_closed', the
 *   item shall transition to 'ncr_resolved'.
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import * as firestore from 'firebase/firestore';
import { isBlockedByOpenNCR, handleNCRClosed } from '@/services/itpService';
import type {
  ITPInspectionItem,
  MaterialTest,
  NonConformanceReport,
  InspectionItemStatus,
  MaterialTestStatus,
} from '@/types';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for a project ID. */
const arbProjectId = fc.uuid();

/** Arbitrary for an ITP ID. */
const arbItpId = fc.uuid();

/** Arbitrary for an item ID. */
const arbItemId = fc.uuid();

/** Arbitrary for an NCR ID. */
const arbNcrId = fc.uuid();

/** NCR statuses that block the item from being marked as 'passed'. */
const arbBlockingNcrStatus = fc.constantFrom('open', 'corrective_action_submitted');

/** NCR status 'verified_closed' — triggers resolution. */
const arbClosedNcrStatus = fc.constant('verified_closed');

/** Non-blocking NCR statuses (not open, not corrective_action_submitted). */
const arbNonBlockingNcrStatus = fc.constantFrom(
  'verified_closed',
  'closed',
  'rejected',
  'resolved',
);

/** Arbitrary for a valid inspection item status. */
const arbInspectionItemStatus: fc.Arbitrary<InspectionItemStatus> = fc.constantFrom(
  'pending',
  'in_progress',
  'passed',
  'failed',
  'conditional',
  'conditional_accepted',
  'ncr_resolved',
  'review_required',
);

/** Arbitrary for a valid material test status. */
const arbMaterialTestStatus: fc.Arbitrary<MaterialTestStatus> = fc.constantFrom(
  'scheduled',
  'sampled',
  'submitted_to_lab',
  'results_received',
  'passed',
  'failed',
  'ncr_resolved',
);

/**
 * Build a mock ITPInspectionItem with or without an ncrId.
 */
function buildInspectionItem(
  itemId: string,
  itpId: string,
  projectId: string,
  ncrId: string | undefined,
  status: InspectionItemStatus = 'failed',
): ITPInspectionItem {
  return {
    id: itemId,
    itpId,
    projectId,
    sequenceNumber: 1,
    title: 'Test Inspection Item',
    description: 'Test description for inspection',
    inspectionType: 'hold_point',
    acceptanceCriteria: 'Must conform to spec',
    responsibleInspectorRole: 'engineer',
    specificationReference: 'SANS 10400 clause 4.2.1',
    linkedMaterialTestIds: [],
    status,
    ncrId,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  };
}

/**
 * Build a mock MaterialTest with or without an ncrId.
 */
function buildMaterialTest(
  testId: string,
  projectId: string,
  ncrId: string | undefined,
  status: MaterialTestStatus = 'failed',
): MaterialTest {
  return {
    id: testId,
    projectId,
    testingScheduleId: 'schedule-001',
    sampleId: 'SAMPLE-001',
    materialType: 'concrete',
    testCategory: 'concrete_28day',
    sansTestMethodReference: 'SANS 3001-GR1',
    dateSampled: '2025-01-01',
    dateTestDue: '2025-01-29',
    testingLaboratoryName: 'Test Lab',
    status,
    linkedInspectionItemIds: [],
    ncrId,
    isPriority: false,
    createdBy: 'user-001',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  };
}

/**
 * Build a mock NonConformanceReport.
 */
function buildNCR(ncrId: string, projectId: string, status: string): NonConformanceReport {
  return {
    id: ncrId,
    projectId,
    title: 'NCR - Test Failure',
    description: 'Non-conformance from inspection failure',
    severity: 'high',
    responsiblePartyId: 'contractor-001',
    correctiveAction: '',
    evidenceIds: [],
    status,
    blocksPayment: false,
    createdBy: 'system:itp_service',
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 22: NCR lifecycle constrains item state
// Validates: Requirements 7.4, 7.5
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 22: NCR lifecycle constrains item state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── isBlockedByOpenNCR Tests ──────────────────────────────────────────────

  describe('isBlockedByOpenNCR — blocking logic', () => {
    /**
     * **Validates: Requirements 7.5**
     *
     * For any inspection item with a linked NCR in status 'open' or
     * 'corrective_action_submitted', isBlockedByOpenNCR returns { blocked: true }.
     */
    it('returns blocked=true when item has NCR with open or corrective_action_submitted status', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbProjectId,
          arbItpId,
          arbItemId,
          arbNcrId,
          arbBlockingNcrStatus,
          async (projectId, itpId, itemId, ncrId, ncrStatus) => {
            vi.clearAllMocks();

            const item = buildInspectionItem(itemId, itpId, projectId, ncrId, 'failed');
            const ncr = buildNCR(ncrId, projectId, ncrStatus);

            // Mock getDoc to return the inspection item
            vi.mocked(firestore.getDoc).mockResolvedValue({
              exists: () => true,
              id: itemId,
              data: () => {
                const { id: _id, ...rest } = item;
                return rest;
              },
              ref: { id: itemId },
            } as any);

            // Mock getDocs to return the NCR list (getNcrs calls getDocs)
            vi.mocked(firestore.getDocs).mockResolvedValue({
              empty: false,
              size: 1,
              docs: [
                {
                  id: ncrId,
                  data: () => {
                    const { id: _id, ...rest } = ncr;
                    return rest;
                  },
                  ref: { id: ncrId },
                },
              ],
              forEach: vi.fn(),
            } as any);

            const result = await isBlockedByOpenNCR(projectId, itpId, itemId);

            expect(result.blocked).toBe(true);
            expect(result.ncrStatus).toBe(ncrStatus);
            expect(result.ncrId).toBe(ncrId);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 7.5**
     *
     * For any inspection item with a linked NCR in status 'verified_closed',
     * isBlockedByOpenNCR returns { blocked: false }.
     */
    it('returns blocked=false when item has NCR with verified_closed status', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbProjectId,
          arbItpId,
          arbItemId,
          arbNcrId,
          arbNonBlockingNcrStatus,
          async (projectId, itpId, itemId, ncrId, ncrStatus) => {
            vi.clearAllMocks();

            const item = buildInspectionItem(itemId, itpId, projectId, ncrId, 'failed');
            const ncr = buildNCR(ncrId, projectId, ncrStatus);

            vi.mocked(firestore.getDoc).mockResolvedValue({
              exists: () => true,
              id: itemId,
              data: () => {
                const { id: _id, ...rest } = item;
                return rest;
              },
              ref: { id: itemId },
            } as any);

            vi.mocked(firestore.getDocs).mockResolvedValue({
              empty: false,
              size: 1,
              docs: [
                {
                  id: ncrId,
                  data: () => {
                    const { id: _id, ...rest } = ncr;
                    return rest;
                  },
                  ref: { id: ncrId },
                },
              ],
              forEach: vi.fn(),
            } as any);

            const result = await isBlockedByOpenNCR(projectId, itpId, itemId);

            expect(result.blocked).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 7.5**
     *
     * For any inspection item with NO linked NCR (ncrId is undefined),
     * isBlockedByOpenNCR returns { blocked: false }.
     */
    it('returns blocked=false when item has no linked NCR', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbProjectId,
          arbItpId,
          arbItemId,
          arbInspectionItemStatus,
          async (projectId, itpId, itemId, status) => {
            vi.clearAllMocks();

            const item = buildInspectionItem(itemId, itpId, projectId, undefined, status);

            vi.mocked(firestore.getDoc).mockResolvedValue({
              exists: () => true,
              id: itemId,
              data: () => {
                const { id: _id, ...rest } = item;
                return rest;
              },
              ref: { id: itemId },
            } as any);

            const result = await isBlockedByOpenNCR(projectId, itpId, itemId);

            expect(result.blocked).toBe(false);
            expect(result.ncrStatus).toBeUndefined();
            expect(result.ncrId).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 7.5**
     *
     * For any inspection item that does not exist (getDoc returns not exists),
     * isBlockedByOpenNCR returns { blocked: false }.
     */
    it('returns blocked=false when item does not exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbProjectId,
          arbItpId,
          arbItemId,
          async (projectId, itpId, itemId) => {
            vi.clearAllMocks();

            vi.mocked(firestore.getDoc).mockResolvedValue({
              exists: () => false,
              id: itemId,
              data: () => undefined,
              ref: { id: itemId },
            } as any);

            const result = await isBlockedByOpenNCR(projectId, itpId, itemId);

            expect(result.blocked).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── handleNCRClosed Tests ─────────────────────────────────────────────────

  describe('handleNCRClosed — NCR resolution triggers item state transition', () => {
    /**
     * **Validates: Requirements 7.4**
     *
     * When handleNCRClosed is called with a valid ncrId linked to an inspection
     * item, the item status transitions to 'ncr_resolved'.
     */
    it('transitions linked inspection item to ncr_resolved when NCR is closed', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbProjectId,
          arbItpId,
          arbItemId,
          arbNcrId,
          async (projectId, itpId, itemId, ncrId) => {
            vi.clearAllMocks();

            const item = buildInspectionItem(itemId, itpId, projectId, ncrId, 'failed');

            // Mock getDocs for getITPs — returns one ITP
            const getDocsCallResults: any[] = [
              // First call: getITPs → returns one ITP document
              {
                empty: false,
                size: 1,
                docs: [
                  {
                    id: itpId,
                    data: () => ({
                      projectId,
                      title: 'Test ITP',
                      status: 'in_progress',
                      constructionStage: 'foundations',
                      revisionNumber: 1,
                      createdBy: 'user-001',
                      createdAt: '2025-01-01T00:00:00.000Z',
                      updatedAt: '2025-01-01T00:00:00.000Z',
                      isDeleted: false,
                    }),
                    ref: { id: itpId },
                  },
                ],
                forEach: vi.fn(),
              },
              // Second call: getAllItems → returns the linked item
              {
                empty: false,
                size: 1,
                docs: [
                  {
                    id: itemId,
                    data: () => {
                      const { id: _id, ...rest } = item;
                      return rest;
                    },
                    ref: { id: itemId },
                  },
                ],
                forEach: vi.fn(),
              },
            ];

            let getDocsCallIndex = 0;
            vi.mocked(firestore.getDocs).mockImplementation(async () => {
              const result = getDocsCallResults[getDocsCallIndex] || {
                empty: true,
                size: 0,
                docs: [],
                forEach: vi.fn(),
              };
              getDocsCallIndex++;
              return result;
            });

            // Track updateDoc calls
            const updateDocCalls: Array<{ data: Record<string, unknown> }> = [];
            vi.mocked(firestore.updateDoc).mockImplementation(async (_docRef: any, data: any) => {
              updateDocCalls.push({ data: { ...data } });
              return undefined;
            });

            // Mock addDoc for audit records
            vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'audit-record-id' } as any);

            await handleNCRClosed(projectId, ncrId);

            // Should have called updateDoc to set status to 'ncr_resolved'
            expect(updateDocCalls.length).toBeGreaterThanOrEqual(1);
            expect(updateDocCalls[0].data.status).toBe('ncr_resolved');
            expect(updateDocCalls[0].data.updatedAt).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 7.4**
     *
     * When handleNCRClosed is called with a valid ncrId linked to a material
     * test, the test status transitions to 'ncr_resolved'.
     */
    it('transitions linked material test to ncr_resolved when NCR is closed', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbProjectId,
          arbNcrId,
          fc.uuid(),
          async (projectId, ncrId, testId) => {
            vi.clearAllMocks();

            const materialTest = buildMaterialTest(testId, projectId, ncrId, 'failed');

            // Mock getDocs calls:
            // 1st: getITPs → empty (no inspection items linked)
            // 2nd: materialTestsCollection → returns the linked material test
            const getDocsCallResults: any[] = [
              // getITPs → no ITPs with linked items
              {
                empty: true,
                size: 0,
                docs: [],
                forEach: vi.fn(),
              },
              // materialTestsCollection → returns the material test with matching ncrId
              {
                empty: false,
                size: 1,
                docs: [
                  {
                    id: testId,
                    data: () => {
                      const { id: _id, ...rest } = materialTest;
                      return rest;
                    },
                    ref: { id: testId },
                  },
                ],
                forEach: vi.fn(),
              },
            ];

            let getDocsCallIndex = 0;
            vi.mocked(firestore.getDocs).mockImplementation(async () => {
              const result = getDocsCallResults[getDocsCallIndex] || {
                empty: true,
                size: 0,
                docs: [],
                forEach: vi.fn(),
              };
              getDocsCallIndex++;
              return result;
            });

            // Track updateDoc calls
            const updateDocCalls: Array<{ data: Record<string, unknown> }> = [];
            vi.mocked(firestore.updateDoc).mockImplementation(async (_docRef: any, data: any) => {
              updateDocCalls.push({ data: { ...data } });
              return undefined;
            });

            // Mock addDoc for audit records
            vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'audit-record-id' } as any);

            await handleNCRClosed(projectId, ncrId);

            // Should have called updateDoc to set status to 'ncr_resolved'
            expect(updateDocCalls.length).toBeGreaterThanOrEqual(1);
            expect(updateDocCalls[0].data.status).toBe('ncr_resolved');
            expect(updateDocCalls[0].data.updatedAt).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 7.4, 7.5**
     *
     * For any random NCR status that is 'open' or 'corrective_action_submitted',
     * the item remains blocked; only 'verified_closed' triggers resolution.
     * This test verifies the blocking-to-resolution lifecycle end-to-end:
     * first the item is blocked, then when NCR closes, it becomes unblocked
     * and transitions to ncr_resolved.
     */
    it('full lifecycle: item blocked while NCR open, transitions to ncr_resolved on close', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbProjectId,
          arbItpId,
          arbItemId,
          arbNcrId,
          arbBlockingNcrStatus,
          async (projectId, itpId, itemId, ncrId, blockingStatus) => {
            vi.clearAllMocks();

            const item = buildInspectionItem(itemId, itpId, projectId, ncrId, 'failed');
            const ncrBlocking = buildNCR(ncrId, projectId, blockingStatus);

            // ── Phase 1: Verify item is blocked ──
            vi.mocked(firestore.getDoc).mockResolvedValue({
              exists: () => true,
              id: itemId,
              data: () => {
                const { id: _id, ...rest } = item;
                return rest;
              },
              ref: { id: itemId },
            } as any);

            vi.mocked(firestore.getDocs).mockResolvedValue({
              empty: false,
              size: 1,
              docs: [
                {
                  id: ncrId,
                  data: () => {
                    const { id: _id, ...rest } = ncrBlocking;
                    return rest;
                  },
                  ref: { id: ncrId },
                },
              ],
              forEach: vi.fn(),
            } as any);

            const blockedResult = await isBlockedByOpenNCR(projectId, itpId, itemId);
            expect(blockedResult.blocked).toBe(true);
            expect(blockedResult.ncrStatus).toBe(blockingStatus);

            // ── Phase 2: NCR closes → item transitions to ncr_resolved ──
            vi.clearAllMocks();

            // Setup for handleNCRClosed
            const getDocsCallResults: any[] = [
              // getITPs → returns the ITP
              {
                empty: false,
                size: 1,
                docs: [
                  {
                    id: itpId,
                    data: () => ({
                      projectId,
                      title: 'Test ITP',
                      status: 'in_progress',
                      constructionStage: 'foundations',
                      revisionNumber: 1,
                      createdBy: 'user-001',
                      createdAt: '2025-01-01T00:00:00.000Z',
                      updatedAt: '2025-01-01T00:00:00.000Z',
                      isDeleted: false,
                    }),
                    ref: { id: itpId },
                  },
                ],
                forEach: vi.fn(),
              },
              // getAllItems → returns the item with matching ncrId
              {
                empty: false,
                size: 1,
                docs: [
                  {
                    id: itemId,
                    data: () => {
                      const { id: _id, ...rest } = item;
                      return rest;
                    },
                    ref: { id: itemId },
                  },
                ],
                forEach: vi.fn(),
              },
            ];

            let getDocsCallIndex = 0;
            vi.mocked(firestore.getDocs).mockImplementation(async () => {
              const result = getDocsCallResults[getDocsCallIndex] || {
                empty: true,
                size: 0,
                docs: [],
                forEach: vi.fn(),
              };
              getDocsCallIndex++;
              return result;
            });

            const updateDocCalls: Array<{ data: Record<string, unknown> }> = [];
            vi.mocked(firestore.updateDoc).mockImplementation(async (_docRef: any, data: any) => {
              updateDocCalls.push({ data: { ...data } });
              return undefined;
            });

            vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'audit-id' } as any);

            await handleNCRClosed(projectId, ncrId);

            // Item should transition to ncr_resolved
            expect(updateDocCalls.length).toBeGreaterThanOrEqual(1);
            expect(updateDocCalls[0].data.status).toBe('ncr_resolved');
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
