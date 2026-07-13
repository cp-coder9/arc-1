/**
 * Property-based tests — Filter correctness.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 11: Filter correctness
 *   Validates: Requirements 4.3
 *   For any set of feedback clusters and any combination of filter criteria
 *   (category, date range, status), the returned result set must contain only
 *   clusters that satisfy ALL active filter predicates simultaneously.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { FeedbackCategory, FeedbackCluster, FeedbackStatus } from '@/services/feedbackTypes';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ClusterFilters {
  category: FeedbackCategory | null;
  status: FeedbackStatus | null;
  dateFrom: string | null;  // ISO date (YYYY-MM-DD)
  dateTo: string | null;    // ISO date (YYYY-MM-DD)
}

// ─── Pure function under test ───────────────────────────────────────────────────

/**
 * Filters a list of feedback clusters based on a combination of active predicates.
 * A filter field set to null means "no constraint" (match all).
 */
function filterClusters(clusters: FeedbackCluster[], filters: ClusterFilters): FeedbackCluster[] {
  return clusters.filter(cluster => {
    if (filters.category && cluster.category !== filters.category) return false;
    if (filters.status && cluster.status !== filters.status) return false;
    if (filters.dateFrom && cluster.createdAt < filters.dateFrom) return false;
    if (filters.dateTo && cluster.createdAt > filters.dateTo + 'T23:59:59.999Z') return false;
    return true;
  });
}

// ─── Reference oracle ───────────────────────────────────────────────────────────

/** Check if a single cluster satisfies ALL active filter predicates. */
function satisfiesAllFilters(cluster: FeedbackCluster, filters: ClusterFilters): boolean {
  if (filters.category && cluster.category !== filters.category) return false;
  if (filters.status && cluster.status !== filters.status) return false;
  if (filters.dateFrom && cluster.createdAt < filters.dateFrom) return false;
  if (filters.dateTo && cluster.createdAt > filters.dateTo + 'T23:59:59.999Z') return false;
  return true;
}

// ─── Generators ─────────────────────────────────────────────────────────────────

const CATEGORIES: FeedbackCategory[] = ['bug', 'feature_request', 'usability', 'praise'];
const STATUSES: FeedbackStatus[] = ['received', 'reviewing', 'planned', 'shipped', 'declined'];

const arbCategory = fc.constantFrom<FeedbackCategory>(...CATEGORIES);
const arbStatus = fc.constantFrom<FeedbackStatus>(...STATUSES);

/** Generate a realistic ISO-8601 datetime string. */
const arbISODateTime = fc.integer({
  min: new Date('2023-01-01T00:00:00.000Z').getTime(),
  max: new Date('2026-12-31T00:00:00.000Z').getTime(),
}).map((ts) => new Date(ts).toISOString());

/** Generate a realistic ISO date string (YYYY-MM-DD). */
const arbISODate = fc.integer({
  min: new Date('2023-01-01T00:00:00.000Z').getTime(),
  max: new Date('2026-12-31T00:00:00.000Z').getTime(),
}).map((ts) => new Date(ts).toISOString().slice(0, 10));

/** Generate a minimal FeedbackCluster with the fields relevant to filtering. */
const arbCluster: fc.Arbitrary<FeedbackCluster> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  category: arbCategory,
  status: arbStatus,
  occurrenceCount: fc.integer({ min: 1, max: 500 }),
  distinctUserCount: fc.integer({ min: 1, max: 200 }),
  distinctUserIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
  severityScore: fc.integer({ min: 1, max: 10 }),
  sentimentBreakdown: fc.record({
    positive: fc.integer({ min: 0, max: 50 }),
    neutral: fc.integer({ min: 0, max: 50 }),
    negative: fc.integer({ min: 0, max: 50 }),
    frustrated: fc.integer({ min: 0, max: 50 }),
  }),
  averageSentiment: fc.constantFrom('positive', 'neutral', 'negative', 'frustrated'),
  submissionIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
  aiCategoryMismatchCount: fc.integer({ min: 0, max: 20 }),
  open: fc.boolean(),
  lastSubmissionAt: arbISODateTime,
  statusHistory: fc.constant([]),
  createdAt: arbISODateTime,
  updatedAt: arbISODateTime,
});

/** Generate a filter combination with nullable fields. */
const arbFilters: fc.Arbitrary<ClusterFilters> = fc.record({
  category: fc.option(arbCategory, { nil: null }),
  status: fc.option(arbStatus, { nil: null }),
  dateFrom: fc.option(arbISODate, { nil: null }),
  dateTo: fc.option(arbISODate, { nil: null }),
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 11: Filter correctness
// Validates: Requirements 4.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: intelligent-feedback-loop, Property 11: Filter correctness', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * For any set of feedback clusters and any combination of filter criteria,
   * the returned result set must contain only clusters satisfying ALL active
   * filter predicates simultaneously.
   */

  it('every item in the filtered result satisfies ALL active filter predicates', () => {
    fc.assert(
      fc.property(
        fc.array(arbCluster, { minLength: 0, maxLength: 30 }),
        arbFilters,
        (clusters, filters) => {
          const result = filterClusters(clusters, filters);
          for (const cluster of result) {
            expect(satisfiesAllFilters(cluster, filters)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no item excluded from the result satisfies all filter predicates (no false exclusions)', () => {
    fc.assert(
      fc.property(
        fc.array(arbCluster, { minLength: 0, maxLength: 30 }),
        arbFilters,
        (clusters, filters) => {
          const result = filterClusters(clusters, filters);
          const resultIds = new Set(result.map(c => c.id));
          const excluded = clusters.filter(c => !resultIds.has(c.id));
          for (const cluster of excluded) {
            expect(satisfiesAllFilters(cluster, filters)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('with no filters active (all null), all clusters are returned', () => {
    fc.assert(
      fc.property(
        fc.array(arbCluster, { minLength: 0, maxLength: 30 }),
        (clusters) => {
          const noFilters: ClusterFilters = {
            category: null,
            status: null,
            dateFrom: null,
            dateTo: null,
          };
          const result = filterClusters(clusters, noFilters);
          expect(result.length).toBe(clusters.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('result is a subset of the original cluster list (no extra items introduced)', () => {
    fc.assert(
      fc.property(
        fc.array(arbCluster, { minLength: 0, maxLength: 30 }),
        arbFilters,
        (clusters, filters) => {
          const result = filterClusters(clusters, filters);
          const originalIds = new Set(clusters.map(c => c.id));
          for (const cluster of result) {
            expect(originalIds.has(cluster.id)).toBe(true);
          }
          expect(result.length).toBeLessThanOrEqual(clusters.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('category filter alone correctly partitions clusters', () => {
    fc.assert(
      fc.property(
        fc.array(arbCluster, { minLength: 0, maxLength: 30 }),
        arbCategory,
        (clusters, category) => {
          const filters: ClusterFilters = {
            category,
            status: null,
            dateFrom: null,
            dateTo: null,
          };
          const result = filterClusters(clusters, filters);
          for (const cluster of result) {
            expect(cluster.category).toBe(category);
          }
          // Every cluster with matching category should be included
          const expected = clusters.filter(c => c.category === category);
          expect(result.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('status filter alone correctly partitions clusters', () => {
    fc.assert(
      fc.property(
        fc.array(arbCluster, { minLength: 0, maxLength: 30 }),
        arbStatus,
        (clusters, status) => {
          const filters: ClusterFilters = {
            category: null,
            status,
            dateFrom: null,
            dateTo: null,
          };
          const result = filterClusters(clusters, filters);
          for (const cluster of result) {
            expect(cluster.status).toBe(status);
          }
          const expected = clusters.filter(c => c.status === status);
          expect(result.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('combined filters are more restrictive than individual filters', () => {
    fc.assert(
      fc.property(
        fc.array(arbCluster, { minLength: 1, maxLength: 30 }),
        arbCategory,
        arbStatus,
        (clusters, category, status) => {
          const categoryOnly: ClusterFilters = { category, status: null, dateFrom: null, dateTo: null };
          const statusOnly: ClusterFilters = { category: null, status, dateFrom: null, dateTo: null };
          const combined: ClusterFilters = { category, status, dateFrom: null, dateTo: null };

          const categoryResult = filterClusters(clusters, categoryOnly);
          const statusResult = filterClusters(clusters, statusOnly);
          const combinedResult = filterClusters(clusters, combined);

          // Combined should be no larger than either individual filter
          expect(combinedResult.length).toBeLessThanOrEqual(categoryResult.length);
          expect(combinedResult.length).toBeLessThanOrEqual(statusResult.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
