/**
 * Condition, Appeal, and Trigger Service — Property-Based Tests
 *
 * Validates correctness properties for condition fulfilment, appeal deadline
 * suspension, and parallel process gate blocking.
 *
 * - Property 8: Condition Fulfilment Implies Approval Effective
 * - Property 9: Appeal Suspends Condition Deadlines
 * - Property 12: Parallel Process Gate
 *
 * Uses fast-check with minimum 100 iterations per property test.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

import {
  captureCondition,
  markFulfilled,
  checkAllPrecedentFulfilled,
  getFulfilmentStatus,
  _resetStore as resetConditionStore,
} from '../services/conditionRegisterService';

import {
  suspendDeadlines,
  resumeDeadlines,
  _resetStore as resetDeadlineStore,
  _getStore as getDeadlineStore,
} from '../services/deadlineEngineService';

import {
  evaluateTriggers,
  confirmTrigger,
  resolveParallelProcess,
  deferParallelProcess,
  hasUnresolvedTriggers,
  getBlockingTriggers,
  _resetStore as resetTriggerStore,
} from '../services/environmentalHeritageTriggerService';

import type { Deadline } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Inserts a deadline directly into the store for testing suspend/resume.
 */
function insertDeadline(overrides: Partial<Deadline> & { applicationId: string; dueDate: string }): Deadline {
  const store = getDeadlineStore();
  const deadline: Deadline = {
    id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    applicationId: overrides.applicationId,
    type: overrides.type ?? 'condition',
    label: overrides.label ?? 'Test Deadline',
    dueDate: overrides.dueDate,
    status: overrides.status ?? 'pending',
    linkedStage: overrides.linkedStage ?? 'condition_fulfilment',
    linkedConditionId: overrides.linkedConditionId,
    statutoryBasis: overrides.statutoryBasis,
    daysRemaining: 0,
    alertGenerated: overrides.alertGenerated ?? false,
  };
  store.push(deadline);
  return deadline;
}

/**
 * Creates a synthetic PlanningApplication object for trigger evaluation.
 */
function createSyntheticApp(
  appId: string,
  applicationType: 'rezoning' | 'subdivision' = 'subdivision',
) {
  return {
    id: appId,
    tenantId: 'tenant-1',
    projectId: 'proj-1',
    referenceNumber: `TP-TST-2026-${appId}`,
    applicationType: applicationType as 'rezoning' | 'consent_use' | 'subdivision' | 'consolidation' | 'site_development_plan' | 'removal_of_restrictive_conditions' | 'township_establishment',
    currentStage: 'pre_consultation' as const,
    status: 'active' as const,
    municipalityId: 'muni-1',
    assignedTownPlannerId: 'tp-1',
    propertyDescription: 'Test Property',
    erfNumber: 'ERF-001',
    titleDeedReference: 'TD-001',
    applicantName: 'Test Applicant',
    applicantContactDetails: {
      name: 'Test Applicant',
      email: 'test@example.com',
      phone: '012-345-6789',
    },
    interdependencies: [] as string[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Property 8: Condition Fulfilment Implies Approval Effective ─────────────
// **Validates: Requirements 6.4**
//
// For any application with conditions, when all conditions classified as
// "precedent" are marked as fulfilled, the application status must reflect
// that approval is effective.

describe('Property 8: Condition Fulfilment Implies Approval Effective', () => {
  beforeEach(() => {
    resetConditionStore();
  });

  it('all precedent conditions fulfilled implies checkAllPrecedentFulfilled returns true and approvalEffective is true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (numPrecedent) => {
          resetConditionStore();
          const appId = `app-precedent-${numPrecedent}-${Date.now()}`;

          // Create multiple precedent conditions
          const conditions = [];
          for (let i = 1; i <= numPrecedent; i++) {
            conditions.push(
              captureCondition({
                applicationId: appId,
                conditionNumber: i,
                description: `Precedent condition ${i}`,
                conditionType: 'precedent',
                responsibleParty: 'Applicant',
                fulfilmentCriteria: `Criteria ${i}`,
              }),
            );
          }

          // Mark ALL as fulfilled
          for (const cond of conditions) {
            markFulfilled(cond.id, 'user-1', ['evidence-1']);
          }

          // Verify checkAllPrecedentFulfilled returns true
          expect(checkAllPrecedentFulfilled(appId)).toBe(true);

          // Verify getFulfilmentStatus shows approvalEffective: true
          const status = getFulfilmentStatus(appId);
          expect(status.approvalEffective).toBe(true);
          expect(status.allPrecedentMet).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('leaving one precedent condition unfulfilled means checkAllPrecedentFulfilled returns false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (numPrecedent) => {
          resetConditionStore();
          const appId = `app-partial-${numPrecedent}-${Date.now()}`;

          // Create multiple precedent conditions
          const conditions = [];
          for (let i = 1; i <= numPrecedent; i++) {
            conditions.push(
              captureCondition({
                applicationId: appId,
                conditionNumber: i,
                description: `Precedent condition ${i}`,
                conditionType: 'precedent',
                responsibleParty: 'Applicant',
                fulfilmentCriteria: `Criteria ${i}`,
              }),
            );
          }

          // Mark all BUT the last one as fulfilled
          for (let i = 0; i < conditions.length - 1; i++) {
            markFulfilled(conditions[i].id, 'user-1', ['evidence-1']);
          }

          // Verify checkAllPrecedentFulfilled returns false
          expect(checkAllPrecedentFulfilled(appId)).toBe(false);

          // Verify getFulfilmentStatus shows approvalEffective: false
          const status = getFulfilmentStatus(appId);
          expect(status.approvalEffective).toBe(false);
          expect(status.allPrecedentMet).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when no precedent conditions exist (only ongoing), checkAllPrecedentFulfilled returns true (vacuously)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (numOngoing) => {
          resetConditionStore();
          const appId = `app-ongoing-only-${numOngoing}-${Date.now()}`;

          // Create only ongoing conditions (no precedent)
          for (let i = 1; i <= numOngoing; i++) {
            captureCondition({
              applicationId: appId,
              conditionNumber: i,
              description: `Ongoing condition ${i}`,
              conditionType: 'ongoing',
              responsibleParty: 'Owner',
              fulfilmentCriteria: `Ongoing criteria ${i}`,
            });
          }

          // Verify checkAllPrecedentFulfilled returns true (vacuously true)
          expect(checkAllPrecedentFulfilled(appId)).toBe(true);

          // Note: approvalEffective is false because there are no precedent conditions
          // (the service requires precedentConditions.length > 0 for approvalEffective)
          const status = getFulfilmentStatus(appId);
          expect(status.allPrecedentMet).toBe(true);
          expect(status.approvalEffective).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 9: Appeal Suspends Condition Deadlines ─────────────────────────
// **Validates: Requirements 8.3**
//
// For any application transitioning to "Appeal In Progress" status, all
// condition fulfilment deadlines must be suspended.

describe('Property 9: Appeal Suspends Condition Deadlines', () => {
  beforeEach(() => {
    resetDeadlineStore();
  });

  it('suspendDeadlines sets all condition deadlines to waived status', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (numConditionDeadlines) => {
          resetDeadlineStore();
          const appId = `app-suspend-${numConditionDeadlines}-${Date.now()}`;

          // Insert condition-type deadlines
          for (let i = 0; i < numConditionDeadlines; i++) {
            insertDeadline({
              applicationId: appId,
              dueDate: '2026-12-01',
              type: 'condition',
              status: 'pending',
              label: `Condition deadline ${i + 1}`,
            });
          }

          // Suspend deadlines (simulating appeal in progress)
          suspendDeadlines(appId, 'Appeal lodged');

          // Verify all condition deadlines are now waived
          const store = getDeadlineStore();
          const appDeadlines = store.filter(
            (d) => d.applicationId === appId && d.type === 'condition',
          );
          expect(appDeadlines.length).toBe(numConditionDeadlines);
          for (const d of appDeadlines) {
            expect(d.status).toBe('waived');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('resumeDeadlines returns suspended condition deadlines to pending', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (numConditionDeadlines) => {
          resetDeadlineStore();
          const appId = `app-resume-${numConditionDeadlines}-${Date.now()}`;

          // Insert condition-type deadlines
          for (let i = 0; i < numConditionDeadlines; i++) {
            insertDeadline({
              applicationId: appId,
              dueDate: '2026-12-01',
              type: 'condition',
              status: 'pending',
              label: `Condition deadline ${i + 1}`,
            });
          }

          // Suspend then resume
          suspendDeadlines(appId, 'Appeal lodged');
          resumeDeadlines(appId);

          // Verify all condition deadlines are back to pending
          const store = getDeadlineStore();
          const appDeadlines = store.filter(
            (d) => d.applicationId === appId && d.type === 'condition',
          );
          expect(appDeadlines.length).toBe(numConditionDeadlines);
          for (const d of appDeadlines) {
            expect(d.status).toBe('pending');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-condition deadlines (statutory, procedural) are NOT affected by suspendDeadlines', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (numCondition, numStatutory, numProcedural) => {
          resetDeadlineStore();
          const appId = `app-mixed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          // Insert condition deadlines
          for (let i = 0; i < numCondition; i++) {
            insertDeadline({
              applicationId: appId,
              dueDate: '2026-12-01',
              type: 'condition',
              status: 'pending',
              label: `Condition ${i + 1}`,
            });
          }

          // Insert statutory deadlines
          for (let i = 0; i < numStatutory; i++) {
            insertDeadline({
              applicationId: appId,
              dueDate: '2026-12-15',
              type: 'statutory',
              status: 'pending',
              label: `Statutory ${i + 1}`,
            });
          }

          // Insert procedural deadlines
          for (let i = 0; i < numProcedural; i++) {
            insertDeadline({
              applicationId: appId,
              dueDate: '2026-12-20',
              type: 'procedural',
              status: 'pending',
              label: `Procedural ${i + 1}`,
            });
          }

          // Suspend deadlines
          suspendDeadlines(appId, 'Appeal lodged');

          // Verify condition deadlines are waived
          const store = getDeadlineStore();
          const conditionDeadlines = store.filter(
            (d) => d.applicationId === appId && d.type === 'condition',
          );
          for (const d of conditionDeadlines) {
            expect(d.status).toBe('waived');
          }

          // Verify statutory deadlines are NOT affected
          const statutoryDeadlines = store.filter(
            (d) => d.applicationId === appId && d.type === 'statutory',
          );
          for (const d of statutoryDeadlines) {
            expect(d.status).toBe('pending');
          }

          // Verify procedural deadlines are NOT affected
          const proceduralDeadlines = store.filter(
            (d) => d.applicationId === appId && d.type === 'procedural',
          );
          for (const d of proceduralDeadlines) {
            expect(d.status).toBe('pending');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 12: Parallel Process Gate ──────────────────────────────────────
// **Validates: Requirements 14.4**
//
// For any application with a confirmed environmental or heritage trigger whose
// parallel process status is not "resolved" or "deferred", the application must
// be blocked from advancing past Tribunal/Decision.

describe('Property 12: Parallel Process Gate', () => {
  beforeEach(() => {
    resetTriggerStore();
  });

  it('a confirmed trigger with in_progress status blocks advancement (hasUnresolvedTriggers returns true)', () => {
    const appId = 'app-gate-block';

    const syntheticApp = createSyntheticApp(appId, 'rezoning');

    // Creates heritage trigger (property > 60 years) + environmental (rezoning)
    const triggers = evaluateTriggers(syntheticApp, 65);
    expect(triggers.length).toBeGreaterThan(0);

    // Confirm the first trigger — sets status to 'in_progress'
    confirmTrigger(triggers[0].id);

    // Verify hasUnresolvedTriggers returns true
    expect(hasUnresolvedTriggers(appId)).toBe(true);

    // Verify getBlockingTriggers returns the confirmed trigger
    const blocking = getBlockingTriggers(appId);
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking[0].confirmed).toBe(true);
    expect(blocking[0].parallelProcessStatus).toBe('in_progress');
  });

  it('resolving a trigger removes it from blockers (hasUnresolvedTriggers returns false)', () => {
    resetTriggerStore();
    const appId = 'app-gate-resolved';

    // subdivision is not in LAND_USE_CHANGE_TYPES, so only heritage trigger
    const syntheticApp = createSyntheticApp(appId, 'subdivision');

    const triggers = evaluateTriggers(syntheticApp, 70);
    expect(triggers.length).toBeGreaterThan(0);

    // Confirm and then resolve
    confirmTrigger(triggers[0].id);
    resolveParallelProcess(triggers[0].id);

    // Should no longer block
    expect(hasUnresolvedTriggers(appId)).toBe(false);
    expect(getBlockingTriggers(appId).length).toBe(0);
  });

  it('deferring a trigger removes it from blockers (hasUnresolvedTriggers returns false)', () => {
    resetTriggerStore();
    const appId = 'app-gate-deferred';

    const syntheticApp = createSyntheticApp(appId, 'subdivision');

    const triggers = evaluateTriggers(syntheticApp, 80);
    expect(triggers.length).toBeGreaterThan(0);

    // Confirm and then defer
    confirmTrigger(triggers[0].id);
    deferParallelProcess(triggers[0].id, 'planner-1', 'Deferred: not required at this stage');

    // Should no longer block
    expect(hasUnresolvedTriggers(appId)).toBe(false);
    expect(getBlockingTriggers(appId).length).toBe(0);
  });

  it('getBlockingTriggers correctly filters only confirmed, unresolved triggers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        (numBlocking, numResolved, numDeferred) => {
          resetTriggerStore();
          const appId = `app-filter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          // Create blocking triggers (confirmed, in_progress)
          for (let i = 0; i < numBlocking; i++) {
            const app = createSyntheticApp(appId, 'subdivision');
            const triggers = evaluateTriggers(app, 65 + i);
            confirmTrigger(triggers[0].id);
          }

          // Create resolved triggers
          for (let i = 0; i < numResolved; i++) {
            const app = createSyntheticApp(appId, 'subdivision');
            const triggers = evaluateTriggers(app, 70 + i);
            confirmTrigger(triggers[0].id);
            resolveParallelProcess(triggers[0].id);
          }

          // Create deferred triggers
          for (let i = 0; i < numDeferred; i++) {
            const app = createSyntheticApp(appId, 'subdivision');
            const triggers = evaluateTriggers(app, 75 + i);
            confirmTrigger(triggers[0].id);
            deferParallelProcess(triggers[0].id, 'user-1', 'Deferred');
          }

          // Verify getBlockingTriggers returns exactly the blocking count
          const blocking = getBlockingTriggers(appId);
          expect(blocking.length).toBe(numBlocking);

          // All blocking triggers should be confirmed with in_progress status
          for (const t of blocking) {
            expect(t.confirmed).toBe(true);
            expect(t.parallelProcessStatus).toBe('in_progress');
          }

          // hasUnresolvedTriggers should be true only if numBlocking > 0
          expect(hasUnresolvedTriggers(appId)).toBe(numBlocking > 0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
