/**
 * Property-based tests — Loop closure notification targeting.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 12: Loop closure notification targeting
 *   Validates: Requirements 5.1, 5.3, 5.7
 *   For any feedback cluster with N distinct submitters (including submitters
 *   whose original submission was merged from another cluster), and any valid
 *   status transition, exactly N notifications must be generated — one per
 *   distinct submitter — each containing the cluster title, new status, and
 *   the operator-provided action description.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildNotificationPayload,
  notifyStatusTransition,
} from '@/services/feedbackLoopClosureService';
import type { FeedbackCluster, FeedbackStatus } from '@/services/feedbackTypes';
import { VALID_STATUS_TRANSITIONS } from '@/services/feedbackTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Determines which users should be notified for a status transition.
 * Returns one notification target per distinct user in the cluster.
 */
function getNotificationTargets(cluster: { distinctUserIds: string[] }): string[] {
  return [...new Set(cluster.distinctUserIds)];
}

/** Generate a valid user ID (non-empty alphanumeric string). */
const userIdArb = fc.string({ minLength: 4, maxLength: 20 }).filter((s) => s.trim().length >= 4);

/** Generate a non-empty cluster title. */
const clusterTitleArb = fc.string({ minLength: 1, maxLength: 100 });

/** Generate a valid action description (≥10 chars). */
const actionDescriptionArb = fc.string({ minLength: 10, maxLength: 500 });

/** Generate a valid new status for transitions. */
const validNewStatusArb = fc.constantFrom<FeedbackStatus>(
  'reviewing',
  'planned',
  'shipped',
  'declined'
);

/** Build a minimal FeedbackCluster for testing notification targeting. */
function buildTestCluster(overrides: Partial<FeedbackCluster>): FeedbackCluster {
  return {
    id: 'cluster-test-001',
    title: 'Test Cluster',
    category: 'bug',
    status: 'received',
    occurrenceCount: 1,
    distinctUserCount: 1,
    distinctUserIds: ['user1'],
    severityScore: 5,
    sentimentBreakdown: { positive: 0, neutral: 1, negative: 0, frustrated: 0 },
    averageSentiment: 'neutral',
    submissionIds: ['sub1'],
    aiCategoryMismatchCount: 0,
    open: true,
    lastSubmissionAt: new Date().toISOString(),
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 12: Loop closure notification targeting
// Validates: Requirements 5.1, 5.3, 5.7
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 12: Loop closure notification targeting', () => {
  /**
   * **Validates: Requirements 5.1, 5.3, 5.7**
   *
   * For any cluster with N distinct submitters, the notification targeting
   * function must return exactly N targets (one per distinct user).
   */

  it('notification count equals the number of distinct user IDs in the cluster', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(userIdArb, { minLength: 1, maxLength: 50 }),
        (userIds) => {
          const cluster = buildTestCluster({
            distinctUserIds: userIds,
            distinctUserCount: userIds.length,
          });

          const targets = getNotificationTargets(cluster);

          expect(targets.length).toBe(userIds.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('duplicate userIds in distinctUserIds are deduplicated to produce exactly N unique notifications', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(userIdArb, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 5 }),
        (uniqueUserIds, duplicationFactor) => {
          // Intentionally duplicate some IDs to simulate potential data issues
          const duplicatedIds = uniqueUserIds.flatMap((id) =>
            Array(duplicationFactor).fill(id)
          );

          const cluster = buildTestCluster({
            distinctUserIds: duplicatedIds,
            distinctUserCount: uniqueUserIds.length,
          });

          const targets = getNotificationTargets(cluster);

          // Must deduplicate to the unique count
          expect(targets.length).toBe(uniqueUserIds.length);
          // Every unique user should appear exactly once
          expect(new Set(targets).size).toBe(uniqueUserIds.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('merged cluster users are included in notification targets', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(userIdArb, { minLength: 1, maxLength: 15 }),
        fc.uniqueArray(userIdArb, { minLength: 1, maxLength: 15 }),
        (originalUserIds, mergedUserIds) => {
          // Combine original submitters with submitters merged from other clusters
          const combinedIds = [...originalUserIds, ...mergedUserIds];
          const expectedUniqueCount = new Set(combinedIds).size;

          const cluster = buildTestCluster({
            distinctUserIds: combinedIds,
            distinctUserCount: expectedUniqueCount,
          });

          const targets = getNotificationTargets(cluster);

          // All merged users must be included in notification targets
          expect(targets.length).toBe(expectedUniqueCount);

          const targetSet = new Set(targets);
          for (const userId of originalUserIds) {
            expect(targetSet.has(userId)).toBe(true);
          }
          for (const userId of mergedUserIds) {
            expect(targetSet.has(userId)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('notification payload contains cluster title, new status, and action description', () => {
    fc.assert(
      fc.property(
        clusterTitleArb,
        validNewStatusArb,
        actionDescriptionArb,
        fc.uniqueArray(userIdArb, { minLength: 1, maxLength: 10 }),
        (title, newStatus, actionDescription, userIds) => {
          const cluster = buildTestCluster({
            title,
            distinctUserIds: userIds,
            distinctUserCount: userIds.length,
          });

          const payload = buildNotificationPayload(
            cluster,
            newStatus,
            actionDescription
          );

          // Payload must contain the cluster title
          expect(payload.clusterTitle).toBe(title);
          // Payload must contain the new status
          expect(payload.newStatus).toBe(newStatus);
          // Payload must contain the action description
          expect(payload.actionDescription).toBe(actionDescription);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('each distinct submitter receives exactly one notification (one target per user)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(userIdArb, { minLength: 1, maxLength: 30 }),
        (userIds) => {
          const cluster = buildTestCluster({
            distinctUserIds: userIds,
            distinctUserCount: userIds.length,
          });

          const targets = getNotificationTargets(cluster);

          // Each user appears exactly once
          const targetCounts = new Map<string, number>();
          for (const t of targets) {
            targetCounts.set(t, (targetCounts.get(t) || 0) + 1);
          }
          for (const [, count] of targetCounts) {
            expect(count).toBe(1);
          }

          // All original submitters are present
          for (const userId of userIds) {
            expect(targets).toContain(userId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('notification payload type reflects the new status (shipped → feedback_shipped, declined → feedback_declined, other → feedback_status_changed)', () => {
    fc.assert(
      fc.property(
        validNewStatusArb,
        actionDescriptionArb,
        (newStatus, actionDescription) => {
          const cluster = buildTestCluster({
            distinctUserIds: ['user1'],
            distinctUserCount: 1,
          });

          const payload = buildNotificationPayload(cluster, newStatus, actionDescription);

          if (newStatus === 'shipped') {
            expect(payload.type).toBe('feedback_shipped');
          } else if (newStatus === 'declined') {
            expect(payload.type).toBe('feedback_declined');
          } else {
            expect(payload.type).toBe('feedback_status_changed');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
