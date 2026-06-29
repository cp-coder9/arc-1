// Feature: unified-project-workflow-orchestration, Property 19: Detected conditions become prioritised events
//
// Property-based test for `actionCentreService.detectConditions` (Task 8.2).
//
// Property 19 (design.md): For any project passport exhibiting a condition
// (missing required record, open approval, municipal blocker, payment due,
// overdue task, or detected risk), a corresponding `WorkflowEvent` is created
// with a priority in {Critical, High, Medium, Low}, and each missing required
// record yields its own event flagged as blocking phase advancement.
//
// Validates: Requirements 5.1, 5.6

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  detectConditions,
  BLOCKS_PHASE_ADVANCEMENT_MARKER,
  blocksPhaseAdvancement,
} from '../actionCentreService';
import type { Priority, ProjectPassport, WorkflowEvent } from '../../lifecycleTypes';
import { arbId, arbPhase, arbPriority, arbRole, assertProperty } from './generators';

// ── Generators for passport fragments ────────────────────────────────────────

/**
 * A `Priority` that maps to a valid `EventPriority` in the Action Centre
 * set {Critical, High, Medium, Low}. Used by Properties 5.1 and 5.6.
 */
const arbValidPriority = (): fc.Arbitrary<Priority> => fc.constantFrom('low', 'medium', 'high', 'critical');

/**
 * Generates a passport's risk level. Non-critical/non-high risk levels exhibit
 * no `risk_detected` event; only 'high' or 'critical' trigger that condition.
 */
const arbRiskLevel = (): fc.Arbitrary<ProjectPassport['riskLevel']> =>
  fc.constantFrom('low', 'medium', 'high', 'critical');

/**
 * Generates a minimal {@link ProjectPassport} with no conditions by default
 * (empty missingRecords, approvalStatus 'approved', no financial issues,
 * non-construction phase, low risk). Each condition is introduced by the
 * specific sub-property that tests it.
 */
export const arbBasePassport = (): fc.Arbitrary<ProjectPassport> =>
  fc.record<ProjectPassport>({
    projectId: arbId('proj'),
    tenantId: arbId('tenant'),
    projectName: fc.string({ minLength: 1, maxLength: 40 }),
    clientName: fc.string({ minLength: 1, maxLength: 40 }),
    municipality: fc.string({ minLength: 1, maxLength: 30 }),
    propertyReference: fc.string({ minLength: 1, maxLength: 30 }),
    propertyUse: fc.string({ minLength: 1, maxLength: 30 }),
    landUseNotes: fc.string({ maxLength: 60 }),
    currentPhase: arbPhase(),
    leadProfessionalRole: arbRole(),
    appointments: fc.constant([]),
    approvalStatus: fc.constant('approved'),
    documentStatus: fc.constant('ready'),
    financialStatus: fc.constant('current'),
    riskLevel: fc.constant('low'),
    lifecycle: fc.record({
      phase: arbPhase(),
      requiredRecordTypes: fc.constant([]),
      presentRequiredRecordTypes: fc.constant([]),
      missingRecords: fc.constant([]),
      mayAdvance: fc.boolean(),
      blockers: fc.constant([]),
      nextBestActions: fc.constant([]),
    }),
  });

// ── Condition generators ─────────────────────────────────────────────────────

/**
 * A set of one or more missing-required-record conditions. Each missing record
 * is a (recordType, reason, priority) triple. Used by Property 19 to exercise
 * the "missing required record" branch.
 */
const arbMissingRecords = (): fc.Arbitrary<
  Array<{ recordType: string; reason: string; priority: Priority }>
> =>
  fc.array(
    fc.record({
      recordType: fc.string({ minLength: 3, maxLength: 16 }),
      reason: fc.string({ minLength: 5, maxLength: 40 }),
      priority: arbValidPriority(),
    }),
    { minLength: 1, maxLength: 4 },
  );

/**
 * A passport modified to include one or more missing-required-record
 * conditions (R5.1, R5.6).
 */
const arbPassportWithMissingRecords = (): fc.Arbitrary<ProjectPassport> =>
  fc
    .tuple(arbBasePassport(), arbMissingRecords())
    .map(([passport, missingRecords]) => ({
      ...passport,
      lifecycle: {
        ...passport.lifecycle,
        missingRecords,
      },
    }));

/**
 * A passport in pending-approval state, triggering an `approval_required`
 * event (R5.1). Note: the base passport already has approvalStatus 'approved',
 * so this changes it.
 */
const arbPassportWithPendingApproval = (): fc.Arbitrary<ProjectPassport> =>
  arbBasePassport().map(passport => ({
    ...passport,
    approvalStatus: 'pending',
  }));

/**
 * A passport in construction phase with non-approved status, triggering a
 * `municipal_blocker` event (R5.1).
 */
const arbPassportWithMunicipalBlocker = (): fc.Arbitrary<ProjectPassport> =>
  arbBasePassport().map(passport => ({
    ...passport,
    currentPhase: 'construction_execution',
    approvalStatus: 'rejected',
  }));

/**
 * A passport with a pending-review financial status, triggering a
 * `payment_due` event (R5.1).
 */
const arbPassportWithPaymentDue = (): fc.Arbitrary<ProjectPassport> =>
  arbBasePassport().map(passport => ({
    ...passport,
    financialStatus: 'pending_review',
  }));

/**
 * A passport with high or critical risk level, triggering a `risk_detected`
 * event (R5.1).
 */
const arbPassportWithRisk = (): fc.Arbitrary<ProjectPassport> =>
  arbBasePassport()
    .chain(passport =>
      fc
        .constantFrom('high', 'critical')
        .map(riskLevel => ({ ...passport, riskLevel })),
    );

// ── Scenario union for comprehensive condition coverage ─────────────────────

/**
 * A passport exhibiting zero or more of the detectable conditions. The `kind`
 * discriminator identifies which condition is exercised (or 'none' for a
 * clean passport). Used by the comprehensive Property 19 test to reach all
 * code branches.
 */
export const arbPassportWithCondition = (): fc.Arbitrary<{
  passport: ProjectPassport;
  kind: 'none' | 'missing_records' | 'pending_approval' | 'municipal_blocker' | 'payment_due' | 'risk';
}> =>
  fc.oneof(
    arbBasePassport().map(passport => ({ passport, kind: 'none' as const })),
    arbPassportWithMissingRecords().map(passport => ({ passport, kind: 'missing_records' as const })),
    arbPassportWithPendingApproval().map(passport => ({ passport, kind: 'pending_approval' as const })),
    arbPassportWithMunicipalBlocker().map(passport => ({ passport, kind: 'municipal_blocker' as const })),
    arbPassportWithPaymentDue().map(passport => ({ passport, kind: 'payment_due' as const })),
    arbPassportWithRisk().map(passport => ({ passport, kind: 'risk' as const })),
  );

// ── Helper assertions ────────────────────────────────────────────────────────

/**
 * Check that a `WorkflowEvent` carries a valid priority from the
 * {Critical, High, Medium, Low} set and matches the Architex {@link Priority}
 * system of {critical, high, medium, low}.
 */
function assertValidPriority(event: WorkflowEvent): void {
  expect(['critical', 'high', 'medium', 'low']).toContain(event.priority);
}

/**
 * Validate the complete event shape: non-empty title, detail, valid priority,
 * non-empty assignedRoles, and valid type (R5.1).
 */
function assertValidEventShape(event: WorkflowEvent): void {
  expect(typeof event.id).toBe('string');
  expect(event.id.length).toBeGreaterThan(0);
  expect(typeof event.type).toBe('string');
  expect(['approval_required', 'municipal_blocker', 'payment_due', 'risk_detected']).toContain(
    event.type,
  );
  expect(typeof event.title).toBe('string');
  expect(event.title.length).toBeGreaterThan(0);
  expect(typeof event.detail).toBe('string');
  expect(event.detail.length).toBeGreaterThan(0);
  assertValidPriority(event);
  expect(Array.isArray(event.assignedRoles)).toBe(true);
  expect(event.assignedRoles.length).toBeGreaterThan(0);
  for (const role of event.assignedRoles) {
    expect(typeof role).toBe('string');
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('actionCentreService.detectConditions — Property 19', () => {
  it('produces no events for a passport with no conditions', async () => {
    await assertProperty(
      fc.asyncProperty(arbBasePassport(), async (passport) => {
        const events = detectConditions(passport);
        expect(events).toHaveLength(0);
      }),
    );
  });

  it('produces one event per missing-required-record, each flagged as blocking phase advancement', async () => {
    await assertProperty(
      fc.asyncProperty(arbPassportWithMissingRecords(), async (passport) => {
        const events = detectConditions(passport);
        const missingRecords = passport.lifecycle.missingRecords;

        // (a) Exactly one event per missing record (R5.1).
        expect(events).toHaveLength(missingRecords.length);

        // (b) Each event is well-formed, carries a valid priority (R5.1),
        // and is assigned to the lead professional role.
        for (const event of events) {
          assertValidEventShape(event);
          expect(event.type).toBe('approval_required');
          expect(event.assignedRoles).toContain(passport.leadProfessionalRole);
        }

        // (c) Each event is flagged as blocking phase advancement (R5.6).
        for (const event of events) {
          expect(blocksPhaseAdvancement(event)).toBe(true);
          expect(event.detail).toContain(BLOCKS_PHASE_ADVANCEMENT_MARKER);
        }
      }),
    );
  });

  it('produces an approval_required event when approvalStatus is pending', async () => {
    await assertProperty(
      fc.asyncProperty(arbPassportWithPendingApproval(), async (passport) => {
        const events = detectConditions(passport);

        expect(events.length).toBeGreaterThanOrEqual(1);
        const approvalEvent = events.find(e => e.type === 'approval_required');
        expect(approvalEvent).toBeDefined();
        expect(approvalEvent).toMatchObject({
          type: 'approval_required',
          priority: 'high',
        });
        assertValidEventShape(approvalEvent!);
      }),
    );
  });

  it('produces a municipal_blocker event when in construction without municipal approval', async () => {
    await assertProperty(
      fc.asyncProperty(arbPassportWithMunicipalBlocker(), async (passport) => {
        const events = detectConditions(passport);

        const blockerEvent = events.find(e => e.type === 'municipal_blocker');
        expect(blockerEvent).toBeDefined();
        expect(blockerEvent).toMatchObject({
          type: 'municipal_blocker',
          priority: 'critical',
        });
        assertValidEventShape(blockerEvent!);
      }),
    );
  });

  it('produces a payment_due event when financial status is pending_review', async () => {
    await assertProperty(
      fc.asyncProperty(arbPassportWithPaymentDue(), async (passport) => {
        const events = detectConditions(passport);

        const paymentEvent = events.find(e => e.type === 'payment_due');
        expect(paymentEvent).toBeDefined();
        expect(paymentEvent).toMatchObject({
          type: 'payment_due',
          priority: 'high',
        });
        assertValidEventShape(paymentEvent!);
      }),
    );
  });

  it('produces a risk_detected event when risk level is high or critical', async () => {
    await assertProperty(
      fc.asyncProperty(arbPassportWithRisk(), async (passport) => {
        const events = detectConditions(passport);

        const riskEvent = events.find(e => e.type === 'risk_detected');
        expect(riskEvent).toBeDefined();
        expect(riskEvent!.type).toBe('risk_detected');
        expect(['high', 'critical']).toContain(riskEvent!.priority);
        assertValidEventShape(riskEvent!);
      }),
    );
  });

  it('produces prioritised events for any combination of detectable conditions', async () => {
    await assertProperty(
      fc.asyncProperty(arbPassportWithCondition(), async ({ passport, kind }) => {
        const events = detectConditions(passport);

        // (a) For the 'none' scenario, no events are produced (R5.1).
        if (kind === 'none') {
          expect(events).toHaveLength(0);
          return;
        }

        // (b) For all condition scenarios, at least one event is produced (R5.1).
        expect(events.length).toBeGreaterThan(0);

        // (c) Every event is well-formed, carries a valid priority from the
        // set {Critical, High, Medium, Low}, and references the project (R5.1).
        for (const event of events) {
          assertValidEventShape(event);
          expect(event.projectId).toEqual(passport.projectId);
          expect(event.createdAt).toBeDefined();
          expect(typeof event.createdAt).toBe('string');
          expect(event.createdAt.length).toBeGreaterThan(0);
        }

        // (d) Missing-record events are flagged as blocking phase advancement
        // (R5.6).
        const missingEvents = events.filter(e => blocksPhaseAdvancement(e));
        for (const event of missingEvents) {
          expect(event.type).toBe('approval_required');
          expect(event.detail.startsWith(BLOCKS_PHASE_ADVANCEMENT_MARKER)).toBe(true);
        }
      }),
    );
  });
});
