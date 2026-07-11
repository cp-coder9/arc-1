// @vitest-environment node
/**
 * Property-based tests — ITP Hold Point: Conditional Expiration
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 9: Conditional pass expiration transitions item to failed
 *   Validates: Requirements 3.7, 3.8
 *   For any inspection item with status 'conditional' whose follow-up action
 *   deadline has passed without resolution, the item's status shall transition
 *   to 'failed' and subsequent items shall be blocked from 'in_progress'.
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
import { checkConditionalExpiration } from '@/services/itpService';
import type { ITPInspectionItem, ConditionalFollowUp, InspectionItemStatus } from '@/types';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for a positive integer used as deadline days (1–30). */
const arbDeadlineDays = fc.integer({ min: 1, max: 30 });

/** Arbitrary for a valid action ID. */
const arbActionId = fc.uuid();

/** Arbitrary for a project ID. */
const arbProjectId = fc.uuid();

/** Arbitrary for an ITP ID. */
const arbItpId = fc.uuid();

/** Arbitrary for an item ID. */
const arbItemId = fc.uuid();

/**
 * Generates a deadline date in the past (already expired).
 * Produces dates between 1 hour and 365 days ago.
 */
const arbPastDeadline = fc.integer({ min: 1, max: 365 * 24 }).map((hoursAgo) => {
  const now = new Date();
  return new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
});

/**
 * Generates a deadline date in the future (not yet expired).
 * Produces dates between 1 hour and 30 days in the future.
 */
const arbFutureDeadline = fc.integer({ min: 1, max: 30 * 24 }).map((hoursAhead) => {
  const now = new Date();
  return new Date(now.getTime() + hoursAhead * 60 * 60 * 1000).toISOString();
});

/**
 * Generates a ConditionalFollowUp with status 'open' and a deadline in the past.
 */
const arbExpiredFollowUp: fc.Arbitrary<ConditionalFollowUp> = fc
  .tuple(arbActionId, arbPastDeadline, arbDeadlineDays)
  .map(([actionId, deadlineDate, deadlineDays]) => ({
    actionId,
    deadlineDate,
    deadlineDays,
    status: 'open' as const,
  }));

/**
 * Generates a ConditionalFollowUp with status 'open' and a deadline in the future.
 */
const arbFutureFollowUp: fc.Arbitrary<ConditionalFollowUp> = fc
  .tuple(arbActionId, arbFutureDeadline, arbDeadlineDays)
  .map(([actionId, deadlineDate, deadlineDays]) => ({
    actionId,
    deadlineDate,
    deadlineDays,
    status: 'open' as const,
  }));

/**
 * Generates a ConditionalFollowUp with status 'resolved' (already addressed).
 */
const arbResolvedFollowUp: fc.Arbitrary<ConditionalFollowUp> = fc
  .tuple(arbActionId, arbPastDeadline, arbDeadlineDays)
  .map(([actionId, deadlineDate, deadlineDays]) => ({
    actionId,
    deadlineDate,
    deadlineDays,
    status: 'resolved' as const,
    resolvedAt: new Date().toISOString(),
  }));

/**
 * Build a mock ITPInspectionItem in 'conditional' status with a given follow-up.
 */
function buildConditionalItem(
  itemId: string,
  itpId: string,
  projectId: string,
  followUp: ConditionalFollowUp,
): Omit<ITPInspectionItem, 'id'> {
  return {
    itpId,
    projectId,
    sequenceNumber: 1,
    title: 'Test Hold Point',
    description: 'Test description',
    inspectionType: 'hold_point',
    acceptanceCriteria: 'Must pass all checks',
    responsibleInspectorRole: 'engineer',
    specificationReference: 'SANS 10400 clause 4.2.1',
    linkedMaterialTestIds: [],
    status: 'conditional' as InspectionItemStatus,
    conditionalFollowUp: followUp,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 9: Conditional pass expiration transitions item to failed
// Validates: Requirements 3.7, 3.8
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 9: Conditional pass expiration transitions item to failed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Set "now" to a fixed time so our generated past/future deadlines work predictably
    vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * For any item with status 'conditional', follow-up status 'open', and
   * deadline in the past, checkConditionalExpiration returns true and
   * calls updateDoc to set status='failed' and follow-up status='expired'.
   */
  it('expires a conditional item when deadline is in the past and follow-up is open', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbItpId,
        arbItemId,
        arbExpiredFollowUp,
        async (projectId, itpId, itemId, followUp) => {
          vi.clearAllMocks();

          const itemData = buildConditionalItem(itemId, itpId, projectId, followUp);

          // Mock getDoc to return the conditional item
          vi.mocked(firestore.getDoc).mockResolvedValue({
            exists: () => true,
            id: itemId,
            data: () => itemData,
            ref: { id: itemId },
          } as any);

          // Mock updateDoc to capture calls
          const updateDocCalls: Array<{ data: Record<string, unknown> }> = [];
          vi.mocked(firestore.updateDoc).mockImplementation(async (_docRef: any, data: any) => {
            updateDocCalls.push({ data: { ...data } });
            return undefined;
          });

          // Mock addDoc for audit records
          vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'audit-record-id' } as any);

          const result = await checkConditionalExpiration(projectId, itpId, itemId);

          // Function should return true (item was expired)
          expect(result).toBe(true);

          // updateDoc should have been called with status='failed'
          expect(updateDocCalls.length).toBeGreaterThanOrEqual(1);
          expect(updateDocCalls[0].data.status).toBe('failed');

          // The conditionalFollowUp should be marked as 'expired'
          const updatedFollowUp = updateDocCalls[0].data.conditionalFollowUp as ConditionalFollowUp;
          expect(updatedFollowUp.status).toBe('expired');
          expect(updatedFollowUp.expiredAt).toBeDefined();
          expect(typeof updatedFollowUp.expiredAt).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * For any item with status 'conditional', follow-up status 'open', and
   * deadline in the future, checkConditionalExpiration returns false and
   * no state change occurs.
   */
  it('does NOT expire a conditional item when deadline is in the future', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbItpId,
        arbItemId,
        arbFutureFollowUp,
        async (projectId, itpId, itemId, followUp) => {
          vi.clearAllMocks();

          const itemData = buildConditionalItem(itemId, itpId, projectId, followUp);

          vi.mocked(firestore.getDoc).mockResolvedValue({
            exists: () => true,
            id: itemId,
            data: () => itemData,
            ref: { id: itemId },
          } as any);

          const updateDocCalls: Array<{ data: Record<string, unknown> }> = [];
          vi.mocked(firestore.updateDoc).mockImplementation(async (_docRef: any, data: any) => {
            updateDocCalls.push({ data: { ...data } });
            return undefined;
          });

          const result = await checkConditionalExpiration(projectId, itpId, itemId);

          // Function should return false (not expired)
          expect(result).toBe(false);

          // No updateDoc calls should have been made
          expect(updateDocCalls.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * For any item with status 'conditional' whose follow-up is already resolved
   * (status='resolved'), checkConditionalExpiration returns false regardless
   * of the deadline.
   */
  it('does NOT expire a conditional item when follow-up is already resolved', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbItpId,
        arbItemId,
        arbResolvedFollowUp,
        async (projectId, itpId, itemId, followUp) => {
          vi.clearAllMocks();

          const itemData = buildConditionalItem(itemId, itpId, projectId, followUp);

          vi.mocked(firestore.getDoc).mockResolvedValue({
            exists: () => true,
            id: itemId,
            data: () => itemData,
            ref: { id: itemId },
          } as any);

          const updateDocCalls: Array<{ data: Record<string, unknown> }> = [];
          vi.mocked(firestore.updateDoc).mockImplementation(async (_docRef: any, data: any) => {
            updateDocCalls.push({ data: { ...data } });
            return undefined;
          });

          const result = await checkConditionalExpiration(projectId, itpId, itemId);

          // Function should return false (already resolved, no expiration needed)
          expect(result).toBe(false);

          // No updateDoc calls should have been made
          expect(updateDocCalls.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * For any item NOT in 'conditional' status, checkConditionalExpiration
   * returns false regardless of any follow-up data.
   */
  it('does NOT expire items that are not in conditional status', async () => {
    const nonConditionalStatuses: InspectionItemStatus[] = [
      'pending', 'in_progress', 'passed', 'failed', 'conditional_accepted', 'ncr_resolved', 'review_required',
    ];

    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbItpId,
        arbItemId,
        fc.constantFrom(...nonConditionalStatuses),
        arbExpiredFollowUp,
        async (projectId, itpId, itemId, status, followUp) => {
          vi.clearAllMocks();

          const itemData = {
            ...buildConditionalItem(itemId, itpId, projectId, followUp),
            status,
          };

          vi.mocked(firestore.getDoc).mockResolvedValue({
            exists: () => true,
            id: itemId,
            data: () => itemData,
            ref: { id: itemId },
          } as any);

          const updateDocCalls: Array<{ data: Record<string, unknown> }> = [];
          vi.mocked(firestore.updateDoc).mockImplementation(async (_docRef: any, data: any) => {
            updateDocCalls.push({ data: { ...data } });
            return undefined;
          });

          const result = await checkConditionalExpiration(projectId, itpId, itemId);

          expect(result).toBe(false);
          expect(updateDocCalls.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * When expiration occurs, the original follow-up data (actionId, deadlineDate,
   * deadlineDays) is preserved in the updated record.
   */
  it('preserves original follow-up metadata when expiring', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbProjectId,
        arbItpId,
        arbItemId,
        arbExpiredFollowUp,
        async (projectId, itpId, itemId, followUp) => {
          vi.clearAllMocks();

          const itemData = buildConditionalItem(itemId, itpId, projectId, followUp);

          vi.mocked(firestore.getDoc).mockResolvedValue({
            exists: () => true,
            id: itemId,
            data: () => itemData,
            ref: { id: itemId },
          } as any);

          const updateDocCalls: Array<{ data: Record<string, unknown> }> = [];
          vi.mocked(firestore.updateDoc).mockImplementation(async (_docRef: any, data: any) => {
            updateDocCalls.push({ data: { ...data } });
            return undefined;
          });

          vi.mocked(firestore.addDoc).mockResolvedValue({ id: 'audit-id' } as any);

          await checkConditionalExpiration(projectId, itpId, itemId);

          expect(updateDocCalls.length).toBeGreaterThanOrEqual(1);
          const updatedFollowUp = updateDocCalls[0].data.conditionalFollowUp as ConditionalFollowUp;

          // Original fields should be preserved
          expect(updatedFollowUp.actionId).toBe(followUp.actionId);
          expect(updatedFollowUp.deadlineDate).toBe(followUp.deadlineDate);
          expect(updatedFollowUp.deadlineDays).toBe(followUp.deadlineDays);
        },
      ),
      { numRuns: 100 },
    );
  });
});
