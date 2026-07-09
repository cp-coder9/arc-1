// @vitest-environment node
/**
 * Property-based tests — ITP SpecForge Integration
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 23: SpecForge bidirectional link integrity
 *   Validates: Requirements 12.1, 12.6
 *   For any link operation between an inspection item and a SpecForge spec item,
 *   both entities shall contain mutual references; for any unlink operation, both
 *   references shall be removed and an audit record created.
 *
 * Property 24: Spec item change propagates to linked inspection items
 *   Validates: Requirements 12.2, 12.5
 *   For any SpecForge spec item modification (title, acceptance criteria,
 *   spec reference, material type, or finish fields changed) or status transition
 *   to 'superseded', all linked inspection items in 'pending' or 'in_progress'
 *   status shall transition to status 'review_required'.
 *
 * Property 25: Aggregated verification status logic
 *   Validates: Requirements 12.3
 *   For any SpecForge spec item with linked inspection items: if all have status
 *   'passed'/'conditional_accepted'/'ncr_resolved' → verification status = 'passed';
 *   if any has status 'failed' → 'failed'; otherwise → 'pending'.
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeLinkState,
  computeUnlinkState,
  computeSpecItemChangeImpact,
  computeVerificationStatus,
  CHANGE_TRIGGER_FIELDS,
} from '@/services/itpSpecForgeAdapter';
import type { InspectionItemStatus } from '@/types';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for a UUID-like ID string. */
const arbId = fc.uuid();

/** Arbitrary for an array of unique IDs (representing linked inspection item IDs). */
const arbLinkedIds = fc.uniqueArray(fc.uuid(), { minLength: 0, maxLength: 20 });

/** All possible inspection item statuses. */
const ALL_STATUSES: InspectionItemStatus[] = [
  'pending',
  'in_progress',
  'passed',
  'failed',
  'conditional',
  'conditional_accepted',
  'ncr_resolved',
  'review_required',
];

/** Statuses that count as "passed" for verification aggregation. */
const PASS_STATUSES: InspectionItemStatus[] = ['passed', 'conditional_accepted', 'ncr_resolved'];

/** Statuses that count as "failed" for verification aggregation. */
const FAIL_STATUSES: InspectionItemStatus[] = ['failed'];

/** Statuses that are reviewable (can transition to review_required on spec change). */
const REVIEWABLE_STATUSES: InspectionItemStatus[] = ['pending', 'in_progress'];

/** Non-reviewable statuses (won't transition on spec change). */
const NON_REVIEWABLE_STATUSES: InspectionItemStatus[] = [
  'passed',
  'failed',
  'conditional',
  'conditional_accepted',
  'ncr_resolved',
  'review_required',
];

/** Arbitrary for any inspection item status. */
const arbStatus: fc.Arbitrary<InspectionItemStatus> = fc.constantFrom(...ALL_STATUSES);

/** Arbitrary for a pass status. */
const arbPassStatus: fc.Arbitrary<InspectionItemStatus> = fc.constantFrom(...PASS_STATUSES);

/** Arbitrary for a fail status. */
const arbFailStatus: fc.Arbitrary<InspectionItemStatus> = fc.constantFrom(...FAIL_STATUSES);

/** Arbitrary for a non-pass, non-fail status (pending/in_progress/conditional/review_required). */
const arbPendingStatus: fc.Arbitrary<InspectionItemStatus> = fc.constantFrom(
  'pending',
  'in_progress',
  'conditional',
  'review_required',
);

/** Arbitrary for a reviewable status. */
const arbReviewableStatus: fc.Arbitrary<InspectionItemStatus> = fc.constantFrom(...REVIEWABLE_STATUSES);

/** Arbitrary for a non-reviewable status. */
const arbNonReviewableStatus: fc.Arbitrary<InspectionItemStatus> = fc.constantFrom(...NON_REVIEWABLE_STATUSES);

/** Arbitrary for a change trigger field (fields that cause review_required). */
const arbChangeTriggerField = fc.constantFrom(...CHANGE_TRIGGER_FIELDS, 'status_superseded');

/** Arbitrary for a non-trigger field (fields that do NOT cause review_required). */
const arbNonTriggerField = fc.constantFrom(
  'code',
  'notes',
  'discipline',
  'status_active',
  'description',
  'createdAt',
  'updatedAt',
);

/** Arbitrary for a linked item with id and status. */
const arbLinkedItem = (status?: fc.Arbitrary<InspectionItemStatus>) =>
  fc.record({
    id: fc.uuid(),
    status: status ?? arbStatus,
  });

// ══════════════════════════════════════════════════════════════════════════════
// Property 23: SpecForge bidirectional link integrity
// Validates: Requirements 12.1, 12.6
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 23: SpecForge bidirectional link integrity', () => {

  // ── Link operations ────────────────────────────────────────────────────────

  describe('Link operation creates mutual references', () => {
    /**
     * **Validates: Requirements 12.1**
     *
     * For any link operation, the inspection item shall reference the spec item ID.
     */
    it('sets the inspection item linkedSpecItemId to the spec item ID', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            const result = computeLinkState(
              itemId,
              specItemId,
              null, // currently unlinked
              existingLinkedIds,
            );

            expect(result.newItemLinkedSpecItemId).toBe(specItemId);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.1**
     *
     * For any link operation, the spec item's linkedInspectionItemIds array
     * shall contain the inspection item ID.
     */
    it('adds the inspection item ID to the spec item linked IDs', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            // Ensure itemId is not already in the list for clean testing
            const cleanLinkedIds = existingLinkedIds.filter((id) => id !== itemId);

            const result = computeLinkState(
              itemId,
              specItemId,
              null,
              cleanLinkedIds,
            );

            expect(result.newSpecItemLinkedInspectionItemIds).toContain(itemId);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.1**
     *
     * For any link operation, an audit record shall be required.
     */
    it('requires an audit record for every link operation', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            const result = computeLinkState(itemId, specItemId, null, existingLinkedIds);
            expect(result.auditRequired).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.1**
     *
     * Linking an item that is already linked does not duplicate the ID
     * in the spec item's linkedInspectionItemIds.
     */
    it('does not duplicate item ID if already present in spec item links', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            // Pre-add itemId to the existing list
            const withExisting = [...existingLinkedIds, itemId];

            const result = computeLinkState(itemId, specItemId, specItemId, withExisting);

            // Count occurrences of itemId in result
            const count = result.newSpecItemLinkedInspectionItemIds.filter(
              (id) => id === itemId,
            ).length;
            expect(count).toBe(1);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.1**
     *
     * Linking preserves all previously linked inspection items on the spec item.
     */
    it('preserves all existing linked inspection items', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            const cleanLinkedIds = existingLinkedIds.filter((id) => id !== itemId);

            const result = computeLinkState(itemId, specItemId, null, cleanLinkedIds);

            // All existing IDs should still be present
            for (const existingId of cleanLinkedIds) {
              expect(result.newSpecItemLinkedInspectionItemIds).toContain(existingId);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Unlink operations ──────────────────────────────────────────────────────

  describe('Unlink operation removes mutual references', () => {
    /**
     * **Validates: Requirements 12.6**
     *
     * For any unlink operation, the inspection item's linkedSpecItemId shall be null.
     */
    it('sets the inspection item linkedSpecItemId to null', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            const result = computeUnlinkState(
              itemId,
              specItemId,
              specItemId,
              [...existingLinkedIds, itemId],
            );

            expect(result.newItemLinkedSpecItemId).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.6**
     *
     * For any unlink operation, the spec item's linkedInspectionItemIds
     * shall NOT contain the inspection item ID.
     */
    it('removes the inspection item ID from the spec item linked IDs', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            const withItemId = [...existingLinkedIds, itemId];

            const result = computeUnlinkState(itemId, specItemId, specItemId, withItemId);

            expect(result.newSpecItemLinkedInspectionItemIds).not.toContain(itemId);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.6**
     *
     * For any unlink operation, an audit record shall be required.
     */
    it('requires an audit record for every unlink operation', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            const result = computeUnlinkState(
              itemId,
              specItemId,
              specItemId,
              [...existingLinkedIds, itemId],
            );

            expect(result.auditRequired).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.6**
     *
     * Unlinking preserves all other linked inspection items on the spec item.
     */
    it('preserves all other linked inspection items during unlink', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            // Ensure itemId is distinct from existing IDs
            const otherIds = existingLinkedIds.filter((id) => id !== itemId);
            const withItemId = [...otherIds, itemId];

            const result = computeUnlinkState(itemId, specItemId, specItemId, withItemId);

            // All other IDs should be preserved
            for (const otherId of otherIds) {
              expect(result.newSpecItemLinkedInspectionItemIds).toContain(otherId);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Link/Unlink roundtrip ──────────────────────────────────────────────────

  describe('Link followed by unlink restores original state', () => {
    /**
     * **Validates: Requirements 12.1, 12.6**
     *
     * For any inspection item that starts unlinked, linking then unlinking
     * shall return the item to unlinked state (null) and the spec item's
     * linked IDs to their original set.
     */
    it('link then unlink restores original unlinked state', () => {
      fc.assert(
        fc.property(
          arbId,
          arbId,
          arbLinkedIds,
          (itemId, specItemId, existingLinkedIds) => {
            // Ensure itemId is not already in existing list
            const cleanIds = existingLinkedIds.filter((id) => id !== itemId);

            // Step 1: Link
            const afterLink = computeLinkState(itemId, specItemId, null, cleanIds);

            // Step 2: Unlink
            const afterUnlink = computeUnlinkState(
              itemId,
              specItemId,
              afterLink.newItemLinkedSpecItemId,
              afterLink.newSpecItemLinkedInspectionItemIds,
            );

            // Inspection item should be back to null
            expect(afterUnlink.newItemLinkedSpecItemId).toBeNull();

            // Spec item linked IDs should not contain the item
            expect(afterUnlink.newSpecItemLinkedInspectionItemIds).not.toContain(itemId);

            // Original IDs should be preserved
            expect(afterUnlink.newSpecItemLinkedInspectionItemIds.sort()).toEqual(
              cleanIds.sort(),
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 24: Spec item change propagates to linked inspection items
// Validates: Requirements 12.2, 12.5
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 24: Spec item change propagates to linked inspection items', () => {

  // ── Trigger field changes ──────────────────────────────────────────────────

  describe('Change trigger fields cause review_required transition', () => {
    /**
     * **Validates: Requirements 12.2**
     *
     * For any change to a trigger field (title, acceptanceCriteria,
     * specificationReference, materialType, finish), all linked items in
     * 'pending' or 'in_progress' status shall be included in the transition list.
     */
    it('includes all reviewable items when a trigger field changes', () => {
      fc.assert(
        fc.property(
          fc.array(arbLinkedItem(arbReviewableStatus), { minLength: 1, maxLength: 20 }),
          arbChangeTriggerField,
          (items, changedField) => {
            const result = computeSpecItemChangeImpact(items, changedField);

            expect(result.isChangeTrigger).toBe(true);
            // All items should be in the transition list since all are reviewable
            expect(result.itemsToTransition.length).toBe(items.length);
            for (const item of items) {
              expect(result.itemsToTransition).toContain(item.id);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.2, 12.5**
     *
     * For any change to a trigger field, items NOT in 'pending' or 'in_progress'
     * status shall NOT be included in the transition list.
     */
    it('excludes non-reviewable items from transition', () => {
      fc.assert(
        fc.property(
          fc.array(arbLinkedItem(arbNonReviewableStatus), { minLength: 1, maxLength: 20 }),
          arbChangeTriggerField,
          (items, changedField) => {
            const result = computeSpecItemChangeImpact(items, changedField);

            expect(result.isChangeTrigger).toBe(true);
            expect(result.itemsToTransition.length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.2, 12.5**
     *
     * For a mixed set of items (some reviewable, some not), only the reviewable
     * items are included in the transition list.
     */
    it('only transitions reviewable items in a mixed set', () => {
      fc.assert(
        fc.property(
          fc.array(arbLinkedItem(arbReviewableStatus), { minLength: 1, maxLength: 10 }),
          fc.array(arbLinkedItem(arbNonReviewableStatus), { minLength: 1, maxLength: 10 }),
          arbChangeTriggerField,
          (reviewableItems, nonReviewableItems, changedField) => {
            const allItems = [...reviewableItems, ...nonReviewableItems];

            const result = computeSpecItemChangeImpact(allItems, changedField);

            expect(result.isChangeTrigger).toBe(true);
            expect(result.itemsToTransition.length).toBe(reviewableItems.length);

            // All reviewable items should be in the list
            for (const item of reviewableItems) {
              expect(result.itemsToTransition).toContain(item.id);
            }

            // No non-reviewable items should be in the list
            for (const item of nonReviewableItems) {
              expect(result.itemsToTransition).not.toContain(item.id);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Non-trigger field changes ──────────────────────────────────────────────

  describe('Non-trigger field changes do NOT cause transitions', () => {
    /**
     * **Validates: Requirements 12.2**
     *
     * For any change to a non-trigger field (code, notes, discipline, etc.),
     * no items shall transition regardless of their status.
     */
    it('does not transition any items when a non-trigger field changes', () => {
      fc.assert(
        fc.property(
          fc.array(arbLinkedItem(), { minLength: 0, maxLength: 20 }),
          arbNonTriggerField,
          (items, changedField) => {
            const result = computeSpecItemChangeImpact(items, changedField);

            expect(result.isChangeTrigger).toBe(false);
            expect(result.itemsToTransition.length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Superseded status ──────────────────────────────────────────────────────

  describe('Status superseded triggers review_required', () => {
    /**
     * **Validates: Requirements 12.5**
     *
     * When a spec item transitions to 'superseded', all linked items in
     * reviewable status shall be included in the transition list.
     */
    it('transitions reviewable items when spec item is superseded', () => {
      fc.assert(
        fc.property(
          fc.array(arbLinkedItem(arbReviewableStatus), { minLength: 1, maxLength: 20 }),
          (items) => {
            const result = computeSpecItemChangeImpact(items, 'status_superseded');

            expect(result.isChangeTrigger).toBe(true);
            expect(result.itemsToTransition.length).toBe(items.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Empty linked items ─────────────────────────────────────────────────────

  describe('No linked items means no transitions', () => {
    /**
     * **Validates: Requirements 12.2**
     *
     * When there are no linked items, no transitions occur regardless
     * of the changed field.
     */
    it('returns empty transition list when no items are linked', () => {
      fc.assert(
        fc.property(
          arbChangeTriggerField,
          (changedField) => {
            const result = computeSpecItemChangeImpact([], changedField);

            expect(result.isChangeTrigger).toBe(true);
            expect(result.itemsToTransition.length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 25: Aggregated verification status logic
// Validates: Requirements 12.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 25: Aggregated verification status logic', () => {

  // ── All passed → 'passed' ──────────────────────────────────────────────────

  describe('All items passed → verification status passed', () => {
    /**
     * **Validates: Requirements 12.3**
     *
     * When all linked inspection items have status 'passed',
     * 'conditional_accepted', or 'ncr_resolved', the aggregated
     * verification status shall be 'passed'.
     */
    it('returns passed when all items have pass status', () => {
      fc.assert(
        fc.property(
          fc.array(arbPassStatus, { minLength: 1, maxLength: 50 }),
          (statuses) => {
            const result = computeVerificationStatus(statuses);
            expect(result).toBe('passed');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Any failed → 'failed' ─────────────────────────────────────────────────

  describe('Any item failed → verification status failed', () => {
    /**
     * **Validates: Requirements 12.3**
     *
     * When any linked inspection item has status 'failed', the aggregated
     * verification status shall be 'failed', regardless of other item statuses.
     */
    it('returns failed when any item has failed status', () => {
      fc.assert(
        fc.property(
          fc.array(arbStatus, { minLength: 0, maxLength: 20 }),
          fc.array(arbStatus, { minLength: 0, maxLength: 20 }),
          (beforeFailed, afterFailed) => {
            // Inject at least one 'failed' status
            const statuses = [...beforeFailed, 'failed' as InspectionItemStatus, ...afterFailed];

            const result = computeVerificationStatus(statuses);
            expect(result).toBe('failed');
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.3**
     *
     * Even when all other items are passed, a single failed item makes
     * the overall status 'failed'.
     */
    it('returns failed even when all other items are passed but one is failed', () => {
      fc.assert(
        fc.property(
          fc.array(arbPassStatus, { minLength: 1, maxLength: 20 }),
          (passStatuses) => {
            const statuses = [...passStatuses, 'failed' as InspectionItemStatus];

            const result = computeVerificationStatus(statuses);
            expect(result).toBe('failed');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Otherwise → 'pending' ─────────────────────────────────────────────────

  describe('Mixed statuses without failed → verification status pending', () => {
    /**
     * **Validates: Requirements 12.3**
     *
     * When there is at least one item that is not in a pass status and
     * no items have 'failed' status, the verification status shall be 'pending'.
     */
    it('returns pending when items have mixed statuses without any failed', () => {
      fc.assert(
        fc.property(
          fc.array(arbPassStatus, { minLength: 0, maxLength: 10 }),
          arbPendingStatus,
          fc.array(arbPassStatus, { minLength: 0, maxLength: 10 }),
          (passedBefore, pendingItem, passedAfter) => {
            const statuses = [...passedBefore, pendingItem, ...passedAfter];

            const result = computeVerificationStatus(statuses);
            expect(result).toBe('pending');
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 12.3**
     *
     * Items with only pending/in_progress statuses (no pass, no fail)
     * result in 'pending' verification status.
     */
    it('returns pending when all items are in non-terminal states', () => {
      fc.assert(
        fc.property(
          fc.array(arbPendingStatus, { minLength: 1, maxLength: 20 }),
          (statuses) => {
            const result = computeVerificationStatus(statuses);
            expect(result).toBe('pending');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Empty items → 'pending' ────────────────────────────────────────────────

  describe('No linked items → verification status pending', () => {
    /**
     * **Validates: Requirements 12.3**
     *
     * When no inspection items are linked to the spec item,
     * the verification status shall be 'pending'.
     */
    it('returns pending when no items are linked', () => {
      // This is a deterministic test but we run it through fc.assert for consistency
      fc.assert(
        fc.property(
          fc.constant([]),
          (statuses: InspectionItemStatus[]) => {
            const result = computeVerificationStatus(statuses);
            expect(result).toBe('pending');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Priority: failed > pending > passed ────────────────────────────────────

  describe('Failed takes priority over any other status', () => {
    /**
     * **Validates: Requirements 12.3**
     *
     * When both pass and fail statuses are present, the aggregated status
     * shall be 'failed' (failed takes highest priority).
     */
    it('failed has highest priority in aggregation', () => {
      fc.assert(
        fc.property(
          fc.array(arbPassStatus, { minLength: 1, maxLength: 10 }),
          fc.array(arbPendingStatus, { minLength: 0, maxLength: 5 }),
          (passStatuses, pendingStatuses) => {
            const statuses = [
              ...passStatuses,
              ...pendingStatuses,
              'failed' as InspectionItemStatus,
            ];

            const result = computeVerificationStatus(statuses);
            expect(result).toBe('failed');
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
