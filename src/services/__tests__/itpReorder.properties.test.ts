// @vitest-environment node
/**
 * Property-based tests — Reorder maintains contiguous sequence starting at 1.
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 5: Reorder maintains contiguous sequence starting at 1
 *   **Validates: Requirements 2.7**
 *
 *   For any ITP containing N inspection items, after any reorder operation,
 *   the resulting sequence numbers shall form the contiguous set {1, 2, ..., N}
 *   with no gaps or duplicates.
 *
 * Uses fast-check with minimum 100 iterations per property test.
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
import { reorderInspectionItems, ITPServiceError } from '@/services/itpService';

import type {
  ITP,
  ITPInspectionItem,
  InspectionItemStatus,
} from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a random item count N (1-20). */
const arbItemCount = fc.integer({ min: 1, max: 20 });

/** Generate N unique item IDs. */
function arbItemIds(n: number): fc.Arbitrary<string[]> {
  return fc.array(fc.uuid(), { minLength: n, maxLength: n })
    .filter((ids) => new Set(ids).size === n);
}

/**
 * Generate a random permutation of the given array.
 * Uses Fisher-Yates shuffle seeded by fast-check random values.
 */
function arbPermutation(ids: string[]): fc.Arbitrary<string[]> {
  if (ids.length <= 1) return fc.constant([...ids]);
  // Generate a shuffled version using fc.shuffledSubarray with full length
  return fc.shuffledSubarray(ids, { minLength: ids.length, maxLength: ids.length });
}

// ─── Mock Setup Helper ───────────────────────────────────────────────────────

interface BatchUpdateCall {
  data: Record<string, unknown>;
}

/**
 * Set up Firestore mocks for reorderInspectionItems.
 * - getDoc: returns a draft ITP
 * - getDocs: returns N inspection items with given IDs
 * - writeBatch: captures all update calls
 */
function setupReorderMocks(opts: {
  projectId: string;
  itpId: string;
  itemIds: string[];
}) {
  const { projectId, itpId, itemIds } = opts;

  const batchUpdates: BatchUpdateCall[] = [];
  const mockBatch = {
    update: vi.fn((_docRef: any, data: any) => {
      batchUpdates.push({ data: { ...data } });
    }),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };

  // Mock getDoc - returns a draft ITP
  const mockItp: Omit<ITP, 'id'> = {
    projectId,
    title: 'Test ITP',
    description: 'Test',
    constructionStage: 'foundations',
    revisionNumber: 1,
    status: 'draft',
    createdBy: 'user-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    isDeleted: false,
  };

  vi.mocked(firestore.getDoc).mockResolvedValue({
    exists: () => true,
    id: itpId,
    data: () => mockItp,
    ref: { id: itpId },
  } as any);

  // Mock getDocs - returns inspection items ordered by sequenceNumber
  const items: ITPInspectionItem[] = itemIds.map((id, index) => ({
    id,
    itpId,
    projectId,
    sequenceNumber: index + 1,
    title: `Item ${index + 1}`,
    description: `Description ${index + 1}`,
    inspectionType: 'hold_point' as const,
    acceptanceCriteria: 'Must pass',
    responsibleInspectorRole: 'engineer' as const,
    specificationReference: 'SANS 10400 clause 4.2',
    linkedMaterialTestIds: [],
    status: 'pending' as InspectionItemStatus,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }));

  vi.mocked(firestore.getDocs).mockResolvedValue({
    empty: items.length === 0,
    size: items.length,
    docs: items.map((item) => ({
      id: item.id,
      data: () => {
        const { id: _id, ...rest } = item;
        return rest;
      },
      ref: { id: item.id },
    })),
    forEach: vi.fn(),
  } as any);

  // Mock writeBatch - capture updates
  vi.mocked(firestore.writeBatch).mockReturnValue(mockBatch as any);

  return { batchUpdates, mockBatch, items };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 5: Reorder maintains contiguous sequence starting at 1
// **Validates: Requirements 2.7**
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 5: Reorder maintains contiguous sequence starting at 1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.7**
   *
   * For any N items (1-20) and any permutation of their IDs as the new order,
   * after reorder, the batch writes assign sequence numbers {1, 2, ..., N}
   * with no gaps or duplicates.
   */
  it('reorder assigns contiguous sequence numbers 1..N for any valid permutation', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbItemCount,
        fc.uuid(), // projectId
        fc.uuid(), // itpId
        fc.uuid(), // userId
        async (N, projectId, itpId, userId) => {
          vi.clearAllMocks();

          // Generate N unique item IDs
          const itemIds = fc.sample(arbItemIds(N), 1)[0];

          // Generate a random permutation of the IDs
          const permutedOrder = fc.sample(arbPermutation(itemIds), 1)[0];

          const { batchUpdates, mockBatch } = setupReorderMocks({
            projectId,
            itpId,
            itemIds,
          });

          await reorderInspectionItems(projectId, itpId, permutedOrder, userId);

          // Verify batch.commit was called
          expect(mockBatch.commit).toHaveBeenCalledOnce();

          // Verify the batch writes assign the correct sequence numbers
          // Each item in permutedOrder should get sequenceNumber = index + 1
          expect(batchUpdates.length).toBe(N);

          // Collect all assigned sequence numbers
          const assignedSequences = batchUpdates.map((u) => u.data.sequenceNumber as number);

          // Verify contiguous set {1, 2, ..., N}
          const sortedSequences = [...assignedSequences].sort((a, b) => a - b);
          const expected = Array.from({ length: N }, (_, i) => i + 1);
          expect(sortedSequences).toEqual(expected);

          // Verify no duplicates
          expect(new Set(assignedSequences).size).toBe(N);

          // Verify each item gets the correct position-based sequence number
          for (let i = 0; i < N; i++) {
            const update = batchUpdates[i];
            expect(update.data.sequenceNumber).toBe(i + 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.7**
   *
   * For any valid permutation, exactly N batch update calls are made
   * (one per item), each with a unique sequence number.
   */
  it('exactly N batch update calls are made, each with a unique sequence number', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbItemCount,
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (N, projectId, itpId, userId) => {
          vi.clearAllMocks();

          const itemIds = fc.sample(arbItemIds(N), 1)[0];
          const permutedOrder = fc.sample(arbPermutation(itemIds), 1)[0];

          const { batchUpdates, mockBatch } = setupReorderMocks({
            projectId,
            itpId,
            itemIds,
          });

          await reorderInspectionItems(projectId, itpId, permutedOrder, userId);

          // Exactly N update calls should be made
          expect(batchUpdates.length).toBe(N);
          expect(mockBatch.update).toHaveBeenCalledTimes(N);

          // All sequence numbers should be unique
          const sequences = batchUpdates.map((u) => u.data.sequenceNumber as number);
          expect(new Set(sequences).size).toBe(N);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.7**
   *
   * The identity permutation (same order) still assigns sequence numbers 1..N.
   */
  it('identity permutation (no change in order) still assigns 1..N', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbItemCount,
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (N, projectId, itpId, userId) => {
          vi.clearAllMocks();

          const itemIds = fc.sample(arbItemIds(N), 1)[0];
          // Identity permutation - same order as original
          const sameOrder = [...itemIds];

          const { batchUpdates, mockBatch } = setupReorderMocks({
            projectId,
            itpId,
            itemIds,
          });

          await reorderInspectionItems(projectId, itpId, sameOrder, userId);

          expect(mockBatch.commit).toHaveBeenCalledOnce();

          // Sequence numbers should still be 1..N
          const assignedSequences = batchUpdates.map((u) => u.data.sequenceNumber as number);
          const sortedSequences = [...assignedSequences].sort((a, b) => a - b);
          expect(sortedSequences).toEqual(Array.from({ length: N }, (_, i) => i + 1));
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Invalid cases ─────────────────────────────────────────────────────────

  /**
   * **Validates: Requirements 2.7**
   *
   * Reorder rejects when new order has missing items (fewer IDs than existing).
   */
  it('rejects reorder when new order has missing items', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }), // Need at least 2 items to remove one
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (N, projectId, itpId, userId) => {
          vi.clearAllMocks();

          const itemIds = fc.sample(arbItemIds(N), 1)[0];
          // Remove one item from the order
          const incompleteOrder = itemIds.slice(0, -1);

          setupReorderMocks({
            projectId,
            itpId,
            itemIds,
          });

          await expect(
            reorderInspectionItems(projectId, itpId, incompleteOrder, userId),
          ).rejects.toThrow(ITPServiceError);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.7**
   *
   * Reorder rejects when new order contains duplicate item IDs.
   */
  it('rejects reorder when new order contains duplicate items', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (N, projectId, itpId, userId) => {
          vi.clearAllMocks();

          const itemIds = fc.sample(arbItemIds(N), 1)[0];
          // Create a duplicate: replace last item with first item
          const duplicateOrder = [...itemIds];
          duplicateOrder[duplicateOrder.length - 1] = duplicateOrder[0];

          setupReorderMocks({
            projectId,
            itpId,
            itemIds,
          });

          await expect(
            reorderInspectionItems(projectId, itpId, duplicateOrder, userId),
          ).rejects.toThrow(ITPServiceError);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.7**
   *
   * Reorder rejects when new order contains extra items not in the ITP.
   */
  it('rejects reorder when new order contains extra unknown items', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(), // extra item ID
        async (N, projectId, itpId, userId, extraId) => {
          vi.clearAllMocks();

          const itemIds = fc.sample(arbItemIds(N), 1)[0];
          // Add an extra unknown item replacing one valid item to keep length same
          // Actually, extra items means length differs OR unknown IDs present
          const extraOrder = [...itemIds, extraId];

          setupReorderMocks({
            projectId,
            itpId,
            itemIds,
          });

          await expect(
            reorderInspectionItems(projectId, itpId, extraOrder, userId),
          ).rejects.toThrow(ITPServiceError);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.7**
   *
   * Reorder rejects when the new order swaps a valid item for an unknown one
   * (same length, but contains an ID not present in the ITP).
   */
  it('rejects reorder when new order swaps a valid item for an unknown one', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(), // unknown ID to substitute
        async (N, projectId, itpId, userId, unknownId) => {
          vi.clearAllMocks();

          const itemIds = fc.sample(arbItemIds(N), 1)[0];

          // Ensure unknownId is not in itemIds
          if (itemIds.includes(unknownId)) return; // skip this case

          // Replace the last valid ID with the unknown one
          const invalidOrder = [...itemIds];
          invalidOrder[invalidOrder.length - 1] = unknownId;

          setupReorderMocks({
            projectId,
            itpId,
            itemIds,
          });

          await expect(
            reorderInspectionItems(projectId, itpId, invalidOrder, userId),
          ).rejects.toThrow(ITPServiceError);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.7**
   *
   * The minimum sequence number after reorder is always 1 and maximum is N.
   */
  it('sequence numbers always start at 1 and end at N', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbItemCount,
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (N, projectId, itpId, userId) => {
          vi.clearAllMocks();

          const itemIds = fc.sample(arbItemIds(N), 1)[0];
          const permutedOrder = fc.sample(arbPermutation(itemIds), 1)[0];

          const { batchUpdates } = setupReorderMocks({
            projectId,
            itpId,
            itemIds,
          });

          await reorderInspectionItems(projectId, itpId, permutedOrder, userId);

          const sequences = batchUpdates.map((u) => u.data.sequenceNumber as number);
          expect(Math.min(...sequences)).toBe(1);
          expect(Math.max(...sequences)).toBe(N);
        },
      ),
      { numRuns: 100 },
    );
  });
});
