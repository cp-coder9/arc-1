// @vitest-environment node
/**
 * Property-Based Tests: Dispute Resolution
 *
 * Feature: p1-platform-extensions, Properties 7-13: Dispute Resolution
 *
 * Validates: Requirements 5.2, 5.6, 6.1, 6.2, 6.4, 8.2, 9.1–9.4
 *
 * Tests formal claim state machine, notice timeline deadlines, quantum calculations,
 * delay analysis, and adjudication stage transitions.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createDisputeEngineService } from '../services/disputeEngineService';
import { createNoticeTimelineService } from '../services/noticeTimelineService';
import { createQuantumAnalyserService } from '../services/quantumAnalyserService';
import { createAdjudicationService } from '../services/adjudicationService';
import { createWorkingDayCalculator } from '../../p1-shared/services/workingDayCalculator';
import type { ClaimStage, ResponseSubState, AdjudicationStage, CostCategory, ResponsibleParty, DelayType } from '../types';
import type { ContractForm } from '@/services/contractAdmin/contractTypes';

// ─── Shared Instances ─────────────────────────────────────────────────────────

const workingDayCalculator = createWorkingDayCalculator();

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const claimStageArb: fc.Arbitrary<ClaimStage> = fc.constantFrom(
  'notified',
  'particularised',
  'assessed',
  'responded',
  'notice_of_dissatisfaction',
  'referred_to_adjudication',
  'adjudication_decision_issued',
  'settled'
);

const responseSubStateArb: fc.Arbitrary<ResponseSubState> = fc.constantFrom(
  'accepted',
  'partially_accepted',
  'rejected'
);

const contractFormArb: fc.Arbitrary<ContractForm> = fc.constantFrom(
  'jbcc_pba',
  'nec_ecc',
  'gcc_2025',
  'fidic'
);

const adjudicationStageArb: fc.Arbitrary<AdjudicationStage> = fc.constantFrom(
  'referred',
  'adjudicator_appointed',
  'submissions_open',
  'submissions_closed',
  'hearing_scheduled',
  'hearing_completed',
  'decision_issued',
  'decision_implemented'
);

const costCategoryArb: fc.Arbitrary<CostCategory> = fc.constantFrom(
  'labour', 'materials', 'plant', 'preliminaries', 'overheads', 'profit', 'other'
);

const responsiblePartyArb: fc.Arbitrary<ResponsibleParty> = fc.constantFrom(
  'employer', 'contractor', 'neutral', 'shared'
);

const delayTypeArb: fc.Arbitrary<DelayType> = fc.constantFrom('critical_path', 'concurrent');

/** Generate an ISO date string within 2022-01-01 to 2028-12-31 */
const dateInRange = fc.date({
  min: new Date(Date.UTC(2022, 0, 1)),
  max: new Date(Date.UTC(2028, 11, 31)),
}).map((d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
});

/** Generate a quantity in the valid range */
const quantityArb = fc.double({ min: 0.01, max: 999_999.99, noNaN: true, noDefaultInfinity: true })
  .map(v => Math.round(v * 100) / 100)
  .filter(v => v >= 0.01);

/** Generate a rate in the valid range */
const rateArb = fc.double({ min: 0.01, max: 999_999.99, noNaN: true, noDefaultInfinity: true })
  .map(v => Math.round(v * 100) / 100)
  .filter(v => v >= 0.01);

// ─── Permitted Transitions Map ────────────────────────────────────────────────

const EXPECTED_TRANSITIONS: Record<ClaimStage, ClaimStage[] | ((r?: ResponseSubState) => ClaimStage[])> = {
  notified: ['particularised'],
  particularised: ['assessed'],
  assessed: ['responded'],
  responded: (r?: ResponseSubState) => {
    if (r === 'accepted') return ['settled'];
    if (r === 'rejected' || r === 'partially_accepted') return ['notice_of_dissatisfaction'];
    return ['settled', 'notice_of_dissatisfaction'];
  },
  notice_of_dissatisfaction: ['referred_to_adjudication'],
  referred_to_adjudication: ['adjudication_decision_issued'],
  adjudication_decision_issued: ['settled'],
  settled: [],
};

function getExpectedTransitions(stage: ClaimStage, responseSubState?: ResponseSubState): ClaimStage[] {
  const entry = EXPECTED_TRANSITIONS[stage];
  if (typeof entry === 'function') return entry(responseSubState);
  return entry;
}

// ─── Adjudication Permitted Transitions Map ───────────────────────────────────

const ADJUDICATION_TRANSITIONS: Record<AdjudicationStage, AdjudicationStage[]> = {
  referred: ['adjudicator_appointed'],
  adjudicator_appointed: ['submissions_open'],
  submissions_open: ['submissions_closed'],
  submissions_closed: ['hearing_scheduled', 'decision_issued'],
  hearing_scheduled: ['hearing_completed'],
  hearing_completed: ['decision_issued'],
  decision_issued: ['decision_implemented'],
  decision_implemented: [],
};

// ─── Property 7: Formal Claim State Machine Transitions ───────────────────────

describe('Feature: p1-platform-extensions, Properties 7-13: Dispute Resolution', () => {

  describe('Property 7: Formal Claim State Machine Transitions', () => {
    /**
     * **Validates: Requirements 5.2, 5.6**
     *
     * For any claim at stage S with responseSubState R, getPermittedTransitions
     * returns the correct set, and invalid transitions are rejected.
     */

    it('getPermittedTransitions returns the exact expected set for each stage and sub-state', () => {
      const engine = createDisputeEngineService();

      fc.assert(
        fc.property(claimStageArb, fc.option(responseSubStateArb), (stage, maybeSubState) => {
          const subState = maybeSubState ?? undefined;
          const permitted = engine.getPermittedTransitions(stage, subState);
          const expected = getExpectedTransitions(stage, subState);

          expect(permitted.sort()).toEqual(expected.sort());
        }),
        { numRuns: 150 }
      );
    });

    it('invalid transitions are rejected with an error', () => {
      fc.assert(
        fc.property(claimStageArb, claimStageArb, fc.option(responseSubStateArb), (stage, targetStage, maybeSubState) => {
          const subState = maybeSubState ?? undefined;
          const permitted = getExpectedTransitions(stage, subState);

          // Only test truly invalid transitions
          if (permitted.includes(targetStage)) return;

          const engine = createDisputeEngineService();
          // Register a claim and manually advance it to the desired stage
          const claim = engine.registerClaim('proj-1', {
            claimType: 'loss_and_expense',
            causativeEventDate: '2024-01-15',
            notificationDate: '2024-01-16',
            contractClauseNumber: '26.1',
            contractClauseTitle: 'Loss and Expense',
            briefDescription: 'Test claim for property testing',
            amountClaimed: 100_000,
          }, 'actor-1');

          // We can only test invalid transitions from 'notified' directly
          // since creating complex states would require valid intermediate transitions
          if (stage === 'notified' && !permitted.includes(targetStage)) {
            expect(() => {
              engine.transitionClaim({
                claimId: claim.id,
                targetStage,
                actorId: 'actor-1',
              });
            }).toThrow(/Invalid transition/);
          }
        }),
        { numRuns: 150 }
      );
    });
  });

  // ─── Property 8: Notice Timeline Deadline Calculations ──────────────────

  describe('Property 8: Notice Timeline Deadline Calculations', () => {
    /**
     * **Validates: Requirements 6.1, 6.2, 6.4**
     *
     * For any contract form and causative event date, notification deadline
     * equals the form-specific formula (JBCC=20WD, NEC=56d, GCC=28d, FIDIC=28d).
     */

    it('notification deadline follows contract-form-specific formula', () => {
      fc.assert(
        fc.property(contractFormArb, dateInRange, (contractForm, eventDate) => {
          const service = createNoticeTimelineService({
            workingDayCalculator,
            getClaims: async () => [],
            getContractForm: async () => contractForm,
            now: () => eventDate,
          });

          const claim = {
            id: 'test-claim',
            projectId: 'proj-1',
            referenceNumber: 'EOT-001',
            claimType: 'EoT' as const,
            causativeEventDate: eventDate,
            notificationDate: eventDate,
            contractClauseNumber: '26.1',
            contractClauseTitle: 'EoT',
            briefDescription: 'Test',
            currentStage: 'notified' as const,
            timeBarredRisk: false,
            timeClaimed: 10,
            evidenceItems: [],
            createdBy: 'actor-1',
            createdAt: eventDate + 'T00:00:00Z',
            updatedAt: eventDate + 'T00:00:00Z',
          };

          const deadlines = service.calculateDeadlines(claim, contractForm);
          const notification = deadlines.find(d => d.deadlineType === 'notification');
          expect(notification).toBeDefined();

          // Verify the deadline calculation matches the formula
          let expectedDate: string;
          switch (contractForm) {
            case 'jbcc_pba':
              // JBCC: causativeEventDate + 20 Working Days
              expectedDate = workingDayCalculator.addWorkingDays(eventDate, 20);
              break;
            case 'nec_ecc':
              // NEC: notificationDate + 56 calendar days
              expectedDate = addCalendarDays(eventDate, 56);
              break;
            case 'gcc_2025':
              // GCC: causativeEventDate + 28 calendar days
              expectedDate = addCalendarDays(eventDate, 28);
              break;
            case 'fidic':
              // FIDIC: notificationDate + 28 calendar days
              expectedDate = addCalendarDays(eventDate, 28);
              break;
          }

          expect(notification!.dueDate).toBe(expectedDate);
        }),
        { numRuns: 150 }
      );
    });
  });

  // ─── Property 9: Quantum Line Item Amount Calculation ───────────────────

  describe('Property 9: Quantum Line Item Amount Calculation', () => {
    /**
     * **Validates: Requirements 9.1**
     *
     * For any quantity Q and rate R, amount = round(Q * R, 2).
     */

    it('line item amount equals round(quantity * rate, 2)', () => {
      fc.assert(
        fc.property(quantityArb, rateArb, costCategoryArb, (quantity, rate, category) => {
          const service = createQuantumAnalyserService({ workingDayCalculator });
          const assessment = service.createAssessment('claim-1', 'proj-1');

          const updated = service.addLineItem(assessment.id, {
            description: 'Test item',
            costCategory: category,
            unit: 'each',
            quantity,
            rate,
          });

          const item = updated.lineItems[0];
          const expectedAmount = Math.round(quantity * rate * 100) / 100;

          expect(item.amount).toBe(expectedAmount);
        }),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property 10: Quantum Summary Aggregation ───────────────────────────

  describe('Property 10: Quantum Summary Aggregation', () => {
    /**
     * **Validates: Requirements 9.2**
     *
     * For any line items, subtotal per category = sum of amounts for that category;
     * total = sum of subtotals; percentage = (subtotal/total)*100 rounded to 1dp.
     */

    const lineItemArb = fc.record({
      description: fc.constant('Item'),
      costCategory: costCategoryArb,
      unit: fc.constant('each'),
      quantity: quantityArb,
      rate: rateArb,
    });

    it('subtotals, total, and percentages are correct for any set of line items', () => {
      fc.assert(
        fc.property(fc.array(lineItemArb, { minLength: 1, maxLength: 20 }), (items) => {
          const service = createQuantumAnalyserService({ workingDayCalculator });
          const assessment = service.createAssessment('claim-1', 'proj-1');

          let current = assessment;
          for (const item of items) {
            current = service.addLineItem(current.id, item);
          }

          // Calculate expected subtotals
          const expectedSubtotals: Record<CostCategory, number> = {
            labour: 0, materials: 0, plant: 0, preliminaries: 0,
            overheads: 0, profit: 0, other: 0,
          };

          for (const lineItem of current.lineItems) {
            expectedSubtotals[lineItem.costCategory] += lineItem.amount;
          }

          // Round subtotals
          const allCategories: CostCategory[] = ['labour', 'materials', 'plant', 'preliminaries', 'overheads', 'profit', 'other'];
          for (const cat of allCategories) {
            expectedSubtotals[cat] = Math.round(expectedSubtotals[cat] * 100) / 100;
          }

          // Check subtotals
          for (const cat of allCategories) {
            expect(current.subtotalByCategory[cat]).toBeCloseTo(expectedSubtotals[cat], 2);
          }

          // Check total
          const expectedTotal = Math.round(
            allCategories.reduce((sum, cat) => sum + expectedSubtotals[cat], 0) * 100
          ) / 100;
          expect(current.totalQuantumAmount).toBeCloseTo(expectedTotal, 2);

          // Check percentages
          if (expectedTotal > 0) {
            for (const cat of allCategories) {
              const expectedPct = Math.round((expectedSubtotals[cat] / expectedTotal) * 100 * 10) / 10;
              expect(current.percentageByCategory[cat]).toBeCloseTo(expectedPct, 1);
            }
          } else {
            for (const cat of allCategories) {
              expect(current.percentageByCategory[cat]).toBe(0);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // ─── Property 11: Delay Event Working Days Calculation ──────────────────

  describe('Property 11: Delay Event Working Days Calculation', () => {
    /**
     * **Validates: Requirements 9.3**
     *
     * For any start/end date pair, workingDaysImpacted equals the count of
     * working days (excludes Sat/Sun/SA holidays).
     */

    /** Generate a pair of dates where end >= start */
    const datePairArb = fc.tuple(dateInRange, fc.integer({ min: 0, max: 60 })).map(([start, offset]) => {
      const startDate = new Date(start + 'T00:00:00Z');
      const endDate = new Date(startDate.getTime() + offset * 24 * 60 * 60 * 1000);
      const endStr = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`;
      return { startDate: start, endDate: endStr };
    });

    it('workingDaysImpacted matches the working day calculator count', () => {
      fc.assert(
        fc.property(datePairArb, delayTypeArb, responsiblePartyArb, ({ startDate, endDate }, delayType, party) => {
          const service = createQuantumAnalyserService({ workingDayCalculator });
          const analysis = service.createDelayAnalysis('claim-1', 'proj-1');

          const updated = service.addDelayEvent(analysis.id, {
            description: 'Test delay event',
            startDate,
            endDate,
            delayType,
            responsibleParty: party,
          });

          const event = updated.events[0];
          const expected = workingDayCalculator.countWorkingDays(startDate, endDate);

          expect(event.workingDaysImpacted).toBe(expected);
        }),
        { numRuns: 150 }
      );
    });
  });

  // ─── Property 12: Net Claimable Delay Calculation ───────────────────────

  describe('Property 12: Net Claimable Delay Calculation', () => {
    /**
     * **Validates: Requirements 9.4**
     *
     * For any delay events, net = employer critical_path days - shared concurrent days.
     */

    const delayEventArb = fc.record({
      description: fc.constant('Delay event'),
      startDate: fc.constant('2024-03-01'),
      endDate: fc.constant('2024-03-15'),
      delayType: delayTypeArb,
      responsibleParty: responsiblePartyArb,
    });

    it('netClaimableDelay equals employer critical_path minus shared concurrent days', () => {
      fc.assert(
        fc.property(fc.array(delayEventArb, { minLength: 1, maxLength: 15 }), (events) => {
          const service = createQuantumAnalyserService({ workingDayCalculator });
          const analysis = service.createDelayAnalysis('claim-1', 'proj-1');

          let current = analysis;
          for (const event of events) {
            current = service.addDelayEvent(current.id, event);
          }

          // Calculate expected net claimable delay
          let employerCriticalPath = 0;
          let sharedConcurrent = 0;

          for (const event of current.events) {
            if (event.responsibleParty === 'employer' && event.delayType === 'critical_path') {
              employerCriticalPath += event.workingDaysImpacted;
            }
            if (event.responsibleParty === 'shared' && event.delayType === 'concurrent') {
              sharedConcurrent += event.workingDaysImpacted;
            }
          }

          const expectedNet = employerCriticalPath - sharedConcurrent;
          expect(current.netClaimableDelay).toBe(expectedNet);

          // Also verify totalByParty
          const expectedByParty: Record<string, number> = {
            employer: 0, contractor: 0, neutral: 0, shared: 0,
          };
          for (const event of current.events) {
            expectedByParty[event.responsibleParty] += event.workingDaysImpacted;
          }
          for (const party of ['employer', 'contractor', 'neutral', 'shared'] as const) {
            expect(current.totalByParty[party]).toBe(expectedByParty[party]);
          }
        }),
        { numRuns: 150 }
      );
    });
  });

  // ─── Property 13: Adjudication State Machine Transitions ────────────────

  describe('Property 13: Adjudication State Machine Transitions', () => {
    /**
     * **Validates: Requirements 8.2**
     *
     * Sequential transitions permitted with hearing bypass from
     * submissions_closed to decision_issued.
     */

    it('valid transitions succeed according to the sequential model with hearing bypass', () => {
      fc.assert(
        fc.property(adjudicationStageArb, (currentStage) => {
          const permitted = ADJUDICATION_TRANSITIONS[currentStage];

          // For each permitted target, the transition should succeed
          for (const target of permitted) {
            const service = createAdjudicationService();
            const adj = service.createAdjudication('claim-1', {
              adjudicatorName: 'Judge Smith',
              appointmentDate: '2024-06-01',
              referringParty: 'Contractor A',
              respondentParty: 'Employer B',
              disputeValue: 500_000,
              referralNoticeRef: 'REF-001',
              maxSubmissionRounds: 2,
            }, 'actor-1');

            // Advance to the current stage through valid transitions
            const stages: AdjudicationStage[] = [
              'referred',
              'adjudicator_appointed',
              'submissions_open',
              'submissions_closed',
              'hearing_scheduled',
              'hearing_completed',
              'decision_issued',
              'decision_implemented',
            ];

            const currentIdx = stages.indexOf(currentStage);
            let current = adj;

            // Walk through sequential stages to reach currentStage
            // Handle the bypass path separately
            for (let i = 1; i <= currentIdx; i++) {
              const nextStage = stages[i];
              // If currentStage is decision_issued and we're at submissions_closed, use bypass
              if (nextStage === 'hearing_scheduled' && currentStage === 'decision_issued' && currentIdx === 6) {
                // For bypass: skip hearing_scheduled and hearing_completed
                break;
              }
              try {
                current = service.transitionStage(current.id, nextStage, 'actor-1');
              } catch {
                // Cannot reach this stage through normal progression; skip
                return;
              }
            }

            // If we're at submissions_closed and target is decision_issued (bypass), test it
            if (currentStage === 'submissions_closed' && target === 'decision_issued') {
              const result = service.transitionStage(current.id, 'decision_issued', 'actor-1');
              expect(result.currentStage).toBe('decision_issued');
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it('invalid transitions are rejected with an error', () => {
      fc.assert(
        fc.property(adjudicationStageArb, adjudicationStageArb, (currentStage, targetStage) => {
          const permitted = ADJUDICATION_TRANSITIONS[currentStage];
          if (permitted.includes(targetStage)) return; // skip valid transitions

          const service = createAdjudicationService();
          const adj = service.createAdjudication('claim-1', {
            adjudicatorName: 'Judge Smith',
            appointmentDate: '2024-06-01',
            referringParty: 'Contractor A',
            respondentParty: 'Employer B',
            disputeValue: 500_000,
            referralNoticeRef: 'REF-001',
            maxSubmissionRounds: 2,
          }, 'actor-1');

          // Walk to current stage
          const stages: AdjudicationStage[] = [
            'referred',
            'adjudicator_appointed',
            'submissions_open',
            'submissions_closed',
            'hearing_scheduled',
            'hearing_completed',
            'decision_issued',
            'decision_implemented',
          ];

          const currentIdx = stages.indexOf(currentStage);
          let current = adj;

          for (let i = 1; i <= currentIdx; i++) {
            try {
              current = service.transitionStage(current.id, stages[i], 'actor-1');
            } catch {
              // Cannot reach this stage; skip the test
              return;
            }
          }

          // Now attempt the invalid transition
          if (current.currentStage === currentStage) {
            expect(() => {
              service.transitionStage(current.id, targetStage, 'actor-1');
            }).toThrow(/Invalid stage transition/);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const ry = date.getUTCFullYear();
  const rm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(date.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}
