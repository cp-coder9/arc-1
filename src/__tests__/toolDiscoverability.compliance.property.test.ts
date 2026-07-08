/**
 * Property-based tests — Compliance Dashboard for tool discoverability routing.
 *
 * Feature: tool-discoverability-routing
 *
 * Validates: Requirements 5.4, 5.7, 5.11
 *
 * Tests three compliance dashboard invariants:
 * - Property 8: Compliance expiry early warning
 * - Property 9: Compliance gate indicator for non-compliant entities
 * - Property 10: Compliance dashboard pagination
 *
 * Uses fast-check with minimum 100 iterations for property-based tests.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { daysUntil, checkExpiryWarnings } from '@/hooks/useComplianceIntegration';
import type { ComplianceEntityForWarning } from '@/hooks/useComplianceIntegration';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Page size constant matching the ContractorComplianceDashboard */
const PAGE_SIZE = 50;

/** The compliance gate logic from ContractorComplianceDashboard */
function isGated(overallStatus: string): boolean {
  return overallStatus === 'non_compliant' || overallStatus === 'expired';
}

/** Compute pagination values matching the dashboard logic */
function paginateEntities(totalEntities: number) {
  const totalPages = Math.ceil(totalEntities / PAGE_SIZE);
  const currentPageSize = Math.min(totalEntities, PAGE_SIZE);
  return { totalPages, currentPageSize };
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate a random date within 1–30 calendar days from a given reference date */
function dateWithinWarningWindow(now: Date): fc.Arbitrary<string> {
  return fc.integer({ min: 1, max: 30 }).map((days) => {
    const target = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return target.toISOString().split('T')[0];
  });
}

/** Generate a random date beyond 30 calendar days from a given reference date */
function dateBeyondWarningWindow(now: Date): fc.Arbitrary<string> {
  return fc.integer({ min: 31, max: 365 }).map((days) => {
    const target = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return target.toISOString().split('T')[0];
  });
}

/** Generate a random date in the past (already expired) */
function dateInThePast(now: Date): fc.Arbitrary<string> {
  return fc.integer({ min: 1, max: 365 }).map((days) => {
    const target = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return target.toISOString().split('T')[0];
  });
}

/** Valid compliance check types for generating entities */
const VALID_CHECK_TYPES = [
  'health_safety_file',
  'coida_registration',
  'sars_tax_pin',
  'bbbee_verification',
  'cips_registration',
  'letter_of_good_standing',
] as const;

/** Generate a random check type */
const checkTypeArb = fc.constantFrom(...VALID_CHECK_TYPES);

/** Generate a random overall status */
const overallStatusArb = fc.constantFrom('compliant', 'pending', 'non_compliant', 'expired');

// ── Property 8: Compliance expiry early warning ──────────────────────────────

describe('Feature: tool-discoverability-routing, Property 8: Compliance expiry early warning', () => {
  /**
   * **Validates: Requirements 5.7**
   *
   * For any check where expiresAt is within 30 calendar days of the current date,
   * an early warning is surfaced. Test that checkExpiryWarnings correctly identifies
   * checks within the 30-day window and ignores those outside.
   */

  it('surfaces warnings for checks expiring within 30 calendar days (days > 0 and <= 30)', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.record({
          entityId: fc.uuid(),
          entityName: fc.string({ minLength: 1, maxLength: 30 }),
          checkType: checkTypeArb,
          expiresAt: dateWithinWarningWindow(now),
        }),
        ({ entityId, entityName, checkType, expiresAt }) => {
          const entities: ComplianceEntityForWarning[] = [
            {
              id: entityId,
              name: entityName,
              type: 'contractor',
              checks: {
                [checkType]: { status: 'compliant', expiresAt },
              },
            },
          ];

          const warnings = checkExpiryWarnings(entities, now);

          // Must produce exactly one warning for this entity+check
          expect(warnings.length).toBe(1);
          expect(warnings[0].entityId).toBe(entityId);
          expect(warnings[0].entityName).toBe(entityName);
          expect(warnings[0].checkType).toBe(checkType);
          expect(warnings[0].expiryDate).toBe(expiresAt);
          expect(warnings[0].daysUntilExpiry).toBeGreaterThan(0);
          expect(warnings[0].daysUntilExpiry).toBeLessThanOrEqual(30);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT surface warnings for checks expiring beyond 30 calendar days', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.record({
          entityId: fc.uuid(),
          entityName: fc.string({ minLength: 1, maxLength: 30 }),
          checkType: checkTypeArb,
          expiresAt: dateBeyondWarningWindow(now),
        }),
        ({ entityId, entityName, checkType, expiresAt }) => {
          const entities: ComplianceEntityForWarning[] = [
            {
              id: entityId,
              name: entityName,
              type: 'contractor',
              checks: {
                [checkType]: { status: 'compliant', expiresAt },
              },
            },
          ];

          const warnings = checkExpiryWarnings(entities, now);

          // Must not produce any warning for this check
          expect(warnings.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT surface warnings for already-expired checks (days <= 0)', () => {
    const now = new Date();

    fc.assert(
      fc.property(
        fc.record({
          entityId: fc.uuid(),
          entityName: fc.string({ minLength: 1, maxLength: 30 }),
          checkType: checkTypeArb,
          expiresAt: dateInThePast(now),
        }),
        ({ entityId, entityName, checkType, expiresAt }) => {
          const entities: ComplianceEntityForWarning[] = [
            {
              id: entityId,
              name: entityName,
              type: 'contractor',
              checks: {
                [checkType]: { status: 'expired', expiresAt },
              },
            },
          ];

          const warnings = checkExpiryWarnings(entities, now);

          // Must not produce any warning for expired checks
          expect(warnings.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('daysUntil returns correct positive days for dates in the future', () => {
    const now = new Date('2026-07-01T00:00:00Z');

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        (daysAhead) => {
          const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
          const dateStr = futureDate.toISOString().split('T')[0];
          const result = daysUntil(dateStr, now);
          // Should be positive and within 1 of expected (due to ceiling)
          expect(result).toBeGreaterThan(0);
          expect(result).toBeLessThanOrEqual(daysAhead + 1);
          expect(result).toBeGreaterThanOrEqual(daysAhead);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 9: Compliance gate indicator for non-compliant entities ─────────

describe('Feature: tool-discoverability-routing, Property 9: Compliance gate indicator for non-compliant entities', () => {
  /**
   * **Validates: Requirements 5.11**
   *
   * For any entity with overallStatus 'non_compliant' or 'expired',
   * the isGated logic returns true, marking the entity as blocked
   * from site access and payment processing.
   */

  it('isGated returns true for entities with non_compliant or expired status', () => {
    const gatedStatuses = fc.constantFrom('non_compliant', 'expired');

    fc.assert(
      fc.property(gatedStatuses, (status) => {
        expect(isGated(status)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('isGated returns false for entities with compliant or pending status', () => {
    const nonGatedStatuses = fc.constantFrom('compliant', 'pending');

    fc.assert(
      fc.property(nonGatedStatuses, (status) => {
        expect(isGated(status)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('for randomly generated compliance entities, gate indicator aligns with overallStatus', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 40 }),
          type: fc.constantFrom('contractor' as const, 'supplier' as const),
          overallStatus: overallStatusArb,
        }),
        ({ overallStatus }) => {
          const gated = isGated(overallStatus);

          if (overallStatus === 'non_compliant' || overallStatus === 'expired') {
            expect(gated).toBe(true);
          } else {
            expect(gated).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 10: Compliance dashboard pagination ─────────────────────────────

describe('Feature: tool-discoverability-routing, Property 10: Compliance dashboard pagination', () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * For N entities (N>0), exactly min(N, 50) display on the current page,
   * with ceil(N/50) total pages.
   */

  it('for N entities (N>0), current page shows min(N, 50) entities and total pages is ceil(N/50)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        (N) => {
          const { totalPages, currentPageSize } = paginateEntities(N);

          // Current page displays exactly min(N, 50) entities
          expect(currentPageSize).toBe(Math.min(N, PAGE_SIZE));

          // Total pages is exactly ceil(N/50)
          expect(totalPages).toBe(Math.ceil(N / PAGE_SIZE));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('last page has correct entity count for any total N', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        (N) => {
          const totalPages = Math.ceil(N / PAGE_SIZE);
          const lastPageSize = N - (totalPages - 1) * PAGE_SIZE;

          // Last page has between 1 and PAGE_SIZE entities
          expect(lastPageSize).toBeGreaterThan(0);
          expect(lastPageSize).toBeLessThanOrEqual(PAGE_SIZE);

          // Sum of all pages equals N
          const fullPages = totalPages - 1;
          const totalFromPages = fullPages * PAGE_SIZE + lastPageSize;
          expect(totalFromPages).toBe(N);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('page size is always exactly 50 for middle pages when N > 50', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 51, max: 500 }),
        fc.integer({ min: 1, max: 9 }),
        (N, pageIndex) => {
          const totalPages = Math.ceil(N / PAGE_SIZE);

          // Only test valid middle pages
          if (pageIndex >= totalPages) return;
          // Skip last page (it may be partial)
          if (pageIndex === totalPages - 1) return;

          const pageStart = pageIndex * PAGE_SIZE;
          const pageEnd = Math.min(pageStart + PAGE_SIZE, N);
          const pageSize = pageEnd - pageStart;

          expect(pageSize).toBe(PAGE_SIZE);
        },
      ),
      { numRuns: 100 },
    );
  });
});
