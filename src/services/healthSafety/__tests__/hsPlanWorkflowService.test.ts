import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { submitPlan, rejectPlan, checkEscalation } from '../hsPlanWorkflowService';
import type { HSPlan } from '../hsTypes';

/**
 * Property 6: H&S Plan rejection preserves reasons
 *
 * For any HSPlan in 'pending_approval' state and any non-empty array of rejection
 * reason strings, calling rejectPlan() SHALL transition the plan to 'rejected' state
 * and the plan's rejectionReasons array SHALL equal the input reasons array.
 *
 * **Validates: Requirements 2.4**
 */
describe('Property 6: H&S Plan rejection preserves reasons', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  const planIdArb = fc.stringMatching(/^plan-[a-z0-9]{3,10}$/);
  const projectIdArb = fc.stringMatching(/^proj-[a-z0-9]{3,10}$/);
  const submitterIdArb = fc.stringMatching(/^user-[a-z0-9]{3,10}$/);
  const approverIdArb = fc.stringMatching(/^approver-[a-z0-9]{3,10}$/);
  const reasonStringArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ,._-]{0,49}$/);
  const reasonsArb = fc.array(reasonStringArb, { minLength: 1, maxLength: 10 });

  // Generate a draft HSPlan that can be submitted to reach pending_approval
  const draftPlanArb = fc.record({
    id: planIdArb,
    projectId: projectIdArb,
    version: fc.integer({ min: 0, max: 50 }),
    state: fc.constant('draft' as const),
    submittedBy: submitterIdArb,
  });

  // ─── Property: rejection transitions state to 'rejected' ───────────────────

  describe('rejectPlan transitions to rejected state', () => {
    it('state becomes rejected after calling rejectPlan on a pending_approval plan', () => {
      fc.assert(
        fc.property(
          draftPlanArb,
          submitterIdArb,
          approverIdArb,
          reasonsArb,
          (draftPlan, submitterId, approverId, reasons) => {
            // Submit the plan to get it into pending_approval state
            const pendingPlan = submitPlan(draftPlan as HSPlan, submitterId);
            expect(pendingPlan.state).toBe('pending_approval');

            // Reject the plan
            const rejectedPlan = rejectPlan(pendingPlan, approverId, reasons);

            expect(rejectedPlan.state).toBe('rejected');
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property: rejectionReasons exactly equals input reasons ────────────────

  describe('rejectionReasons equals input reasons array', () => {
    it('rejectionReasons preserves all reasons in same order and content', () => {
      fc.assert(
        fc.property(
          draftPlanArb,
          submitterIdArb,
          approverIdArb,
          reasonsArb,
          (draftPlan, submitterId, approverId, reasons) => {
            // Submit to reach pending_approval
            const pendingPlan = submitPlan(draftPlan as HSPlan, submitterId);

            // Reject with reasons
            const rejectedPlan = rejectPlan(pendingPlan, approverId, reasons);

            // Rejection reasons must exactly equal the input array
            expect(rejectedPlan.rejectionReasons).toEqual(reasons);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('rejectionReasons has the same length as the input reasons', () => {
      fc.assert(
        fc.property(
          draftPlanArb,
          submitterIdArb,
          approverIdArb,
          reasonsArb,
          (draftPlan, submitterId, approverId, reasons) => {
            const pendingPlan = submitPlan(draftPlan as HSPlan, submitterId);
            const rejectedPlan = rejectPlan(pendingPlan, approverId, reasons);

            expect(rejectedPlan.rejectionReasons).toHaveLength(reasons.length);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('each reason at index i matches the input reason at index i', () => {
      fc.assert(
        fc.property(
          draftPlanArb,
          submitterIdArb,
          approverIdArb,
          reasonsArb,
          (draftPlan, submitterId, approverId, reasons) => {
            const pendingPlan = submitPlan(draftPlan as HSPlan, submitterId);
            const rejectedPlan = rejectPlan(pendingPlan, approverId, reasons);

            for (let i = 0; i < reasons.length; i++) {
              expect(rejectedPlan.rejectionReasons![i]).toBe(reasons[i]);
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});


/**
 * Property 7: H&S Plan escalation on timeout
 *
 * For any HSPlan submitted at time T, calling checkEscalation(plan, now)
 * where now exceeds T by more than 5 business days SHALL return a non-null
 * WorkflowEvent with priority 'high'. When now is within 5 business days
 * of T, it SHALL return null.
 *
 * **Validates: Requirements 2.5**
 */
describe('Property 7: H&S Plan escalation on timeout', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  const projectIdArb = fc.stringMatching(/^proj-[a-z0-9]{3,10}$/);
  const planIdArb = fc.stringMatching(/^plan-[a-z0-9]{3,10}$/);
  const submitterIdArb = fc.stringMatching(/^user-[a-z0-9]{3,12}$/);

  // Generate a base date in a reasonable range using integer timestamps
  // to avoid any NaN issues with fc.date()
  const baseDateArb = fc.integer({
    min: new Date('2024-01-01T00:00:00Z').getTime(),
    max: new Date('2026-12-01T00:00:00Z').getTime(),
  }).map((ms) => new Date(ms));

  // Build a pending_approval plan with a given submittedAt
  function makePendingPlan(id: string, projectId: string, submittedBy: string, submittedAt: Date): HSPlan {
    return {
      id,
      projectId,
      version: 1,
      state: 'pending_approval',
      submittedBy,
      submittedAt: submittedAt.toISOString(),
    };
  }

  // ─── >5 business days → non-null high-priority WorkflowEvent ──────────────

  describe('when now > 5 business days after submittedAt', () => {
    it('checkEscalation returns a non-null WorkflowEvent', () => {
      fc.assert(
        fc.property(
          planIdArb,
          projectIdArb,
          submitterIdArb,
          baseDateArb,
          (planId, projectId, submitterId, baseDate) => {
            // Adding 11 calendar days guarantees > 5 business days for any start day.
            // Worst case (Friday): Fri + 11 = Tue (next-next week), 6 biz days between.
            const now = new Date(baseDate.getTime());
            now.setDate(now.getDate() + 11);

            const plan = makePendingPlan(planId, projectId, submitterId, baseDate);
            const result = checkEscalation(plan, now);

            expect(result).not.toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it('returned WorkflowEvent has priority high', () => {
      fc.assert(
        fc.property(
          planIdArb,
          projectIdArb,
          submitterIdArb,
          baseDateArb,
          (planId, projectId, submitterId, baseDate) => {
            const now = new Date(baseDate.getTime());
            now.setDate(now.getDate() + 11);

            const plan = makePendingPlan(planId, projectId, submitterId, baseDate);
            const result = checkEscalation(plan, now);

            expect(result).not.toBeNull();
            expect(result!.priority).toBe('high');
          }
        ),
        { numRuns: 200 }
      );
    });

    it('returned WorkflowEvent references the correct projectId', () => {
      fc.assert(
        fc.property(
          planIdArb,
          projectIdArb,
          submitterIdArb,
          baseDateArb,
          (planId, projectId, submitterId, baseDate) => {
            const now = new Date(baseDate.getTime());
            now.setDate(now.getDate() + 11);

            const plan = makePendingPlan(planId, projectId, submitterId, baseDate);
            const result = checkEscalation(plan, now);

            expect(result).not.toBeNull();
            expect(result!.projectId).toBe(projectId);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ─── ≤5 business days → null ──────────────────────────────────────────────

  describe('when now <= 5 business days after submittedAt', () => {
    it('checkEscalation returns null for 3 calendar days offset', () => {
      fc.assert(
        fc.property(
          planIdArb,
          projectIdArb,
          submitterIdArb,
          baseDateArb,
          (planId, projectId, submitterId, baseDate) => {
            // Adding 3 calendar days guarantees ≤ 5 business days
            // (maximum of 2 weekdays can occur in a 3-calendar-day exclusive span)
            const now = new Date(baseDate.getTime());
            now.setDate(now.getDate() + 3);

            const plan = makePendingPlan(planId, projectId, submitterId, baseDate);
            const result = checkEscalation(plan, now);

            expect(result).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it('checkEscalation returns null when now equals submittedAt', () => {
      fc.assert(
        fc.property(
          planIdArb,
          projectIdArb,
          submitterIdArb,
          baseDateArb,
          (planId, projectId, submitterId, baseDate) => {
            const plan = makePendingPlan(planId, projectId, submitterId, baseDate);
            const result = checkEscalation(plan, baseDate);

            expect(result).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ─── Non-pending_approval plans always return null ─────────────────────────

  describe('plans not in pending_approval state always return null', () => {
    const nonPendingStates = ['draft', 'submitted', 'approved', 'rejected'] as const;

    it('checkEscalation returns null regardless of time elapsed', () => {
      fc.assert(
        fc.property(
          planIdArb,
          projectIdArb,
          submitterIdArb,
          baseDateArb,
          fc.constantFrom(...nonPendingStates),
          (planId, projectId, submitterId, baseDate, state) => {
            const now = new Date(baseDate.getTime());
            now.setDate(now.getDate() + 30); // Well beyond any threshold

            const plan: HSPlan = {
              id: planId,
              projectId,
              version: 1,
              state,
              submittedBy: submitterId,
              submittedAt: baseDate.toISOString(),
            };

            const result = checkEscalation(plan, now);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
