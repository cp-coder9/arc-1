import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { canIssuePermitForHeight } from '../fallProtectionService';
import type { FallProtectionPlan, FallProtectionMethod, InspectionSchedule } from '../hsTypes';

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generates an ISO date string within a safe range. */
const arbIsoDateString = fc
  .integer({ min: 1577836800000, max: 4102444800000 }) // 2020-01-01 to 2100-01-01
  .map((ts) => new Date(ts).toISOString());

const arbFallProtectionMethod = fc.constantFrom<FallProtectionMethod>(
  'guardrails',
  'safety_nets',
  'harnesses',
  'exclusion_zones'
);

const arbInspectionFrequency = fc.constantFrom<InspectionSchedule['frequency']>(
  'daily',
  'weekly',
  'fortnightly',
  'monthly'
);

const arbInspectionSchedule: fc.Arbitrary<InspectionSchedule> = fc.record({
  frequency: arbInspectionFrequency,
  nextDue: arbIsoDateString,
  lastCompleted: fc.option(arbIsoDateString, { nil: undefined }),
});

/** Generates a FallProtectionPlan WITHOUT approvedAt (unapproved plan). */
const arbUnapprovedPlan: fc.Arbitrary<FallProtectionPlan> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  projectId: fc.string({ minLength: 1, maxLength: 50 }),
  methods: fc.array(arbFallProtectionMethod, { minLength: 1, maxLength: 4 }),
  workAreas: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
  responsiblePersons: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
  inspectionSchedule: arbInspectionSchedule,
  approvedAt: fc.constant(undefined),
  approvedBy: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  expiresAt: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  linkedPermitIds: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }),
  createdAt: arbIsoDateString,
  updatedAt: arbIsoDateString,
});

/** Generates a FallProtectionPlan WITH approvedAt set (approved plan). */
const arbApprovedPlan: fc.Arbitrary<FallProtectionPlan> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  projectId: fc.string({ minLength: 1, maxLength: 50 }),
  methods: fc.array(arbFallProtectionMethod, { minLength: 1, maxLength: 4 }),
  workAreas: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
  responsiblePersons: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
  inspectionSchedule: arbInspectionSchedule,
  approvedAt: arbIsoDateString,
  approvedBy: fc.string({ minLength: 1, maxLength: 50 }),
  expiresAt: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  linkedPermitIds: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }),
  createdAt: arbIsoDateString,
  updatedAt: arbIsoDateString,
});

// ─── Property-Based Tests ───────────────────────────────────────────────────

/**
 * Property 16: Fall protection plan gating of permits
 *
 * For any permit request for work involving heights:
 * - When no FallProtectionPlan exists (null) → blocked with reason 'fall_protection_plan_required'
 * - When plan exists but not approved (approvedAt undefined) → blocked with reason 'fall_protection_plan_not_approved'
 * - When plan exists and is approved (approvedAt set) → allowed
 *
 * Validates: Requirements 8.1
 */
describe('Property 16: Fall protection plan gating of permits', () => {
  it('when plan is null, returns not allowed with fall_protection_plan_required reason', () => {
    // No arbitrary needed — null is the only value for this case
    const result = canIssuePermitForHeight(null);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('fall_protection_plan_required');
  });

  it('when plan exists but approvedAt is undefined, returns not allowed with fall_protection_plan_not_approved reason', () => {
    fc.assert(
      fc.property(arbUnapprovedPlan, (plan) => {
        const result = canIssuePermitForHeight(plan);

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('fall_protection_plan_not_approved');
      })
    );
  });

  it('when plan exists and has approvedAt set, returns allowed', () => {
    fc.assert(
      fc.property(arbApprovedPlan, (plan) => {
        const result = canIssuePermitForHeight(plan);

        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      })
    );
  });
});
