/**
 * Property-Based Tests for Appeal Tracker (Properties 9 and 3)
 *
 * Feature: town-planning-workflow
 *
 * **Validates: Requirements 1.2**
 *
 * Property 9:
 * Appeal deadline (prescribed period) is correctly calculated as N calendar
 * days from the decision date. filedWithinPrescribedPeriod is true iff
 * filingDate ≤ prescribedDeadline.
 *
 * Property 3:
 * Appeal stage transitions follow the defined state machine exactly.
 * Only permitted transitions succeed; withdrawn is terminal.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  calculatePrescribedDeadline,
  isWithinPrescribedPeriod,
  transitionAppealStage,
  APPEAL_STAGE_TRANSITIONS,
  type AppealActor,
  type AppealDeps,
} from '../services/appealTracker';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { AppealStage } from '../types';

// ─── Generators ──────────────────────────────────────────────────────────────

const ALL_APPEAL_STAGES: AppealStage[] = [
  'filed',
  'under_consideration',
  'hearing_scheduled',
  'decision_received',
  'withdrawn',
];

const arbAppealStage = fc.constantFrom(...ALL_APPEAL_STAGES);

// Date generators — use integer-based approach for reliability
const arbYear = fc.integer({ min: 2020, max: 2030 });
const arbMonth = fc.integer({ min: 1, max: 12 });
const arbDay = fc.integer({ min: 1, max: 28 }); // safe day range

const arbDateString = fc.tuple(arbYear, arbMonth, arbDay).map(
  ([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
);

const arbPeriodDays = fc.integer({ min: 1, max: 365 });

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDbForAppeal(currentStage: AppealStage): FirestoreDB {
  return {
    collection: vi.fn().mockImplementation(() => ({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          exists: true,
          id: 'appeal-pbt',
          data: () => ({
            stage: currentStage,
            applicationId: 'app-pbt',
            projectId: 'proj-pbt',
            filingDate: '2025-01-15',
            prescribedDeadline: '2025-07-14',
            filedWithinPrescribedPeriod: true,
            grounds: 'Test grounds',
            createdAt: '2025-01-15T00:00:00.000Z',
            updatedAt: '2025-01-15T00:00:00.000Z',
          }),
        }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      add: vi.fn().mockResolvedValue({ id: 'new' }),
      get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    })),
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Appeal Tracker — Property-Based Tests', () => {
  describe('Property 9: Appeal deadline calculation', () => {
    it('prescribed deadline is exactly N calendar days after decision date', () => {
      fc.assert(
        fc.property(
          arbDateString,
          arbPeriodDays,
          (decisionDate, periodDays) => {
            const deadline = calculatePrescribedDeadline(decisionDate, periodDays);

            // Calculate expected deadline
            const expected = new Date(decisionDate);
            expected.setDate(expected.getDate() + periodDays);
            const expectedStr = expected.toISOString().split('T')[0];

            expect(deadline).toBe(expectedStr);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filedWithinPrescribedPeriod is true iff filingDate ≤ prescribedDeadline', () => {
      fc.assert(
        fc.property(
          arbDateString,
          arbDateString,
          (filingDate, deadline) => {
            const result = isWithinPrescribedPeriod(filingDate, deadline);

            // String comparison works for ISO date format (YYYY-MM-DD)
            const expected = filingDate <= deadline;
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filing on the deadline itself is within prescribed period', () => {
      fc.assert(
        fc.property(
          arbDateString,
          arbPeriodDays,
          (decisionDate, periodDays) => {
            const deadline = calculatePrescribedDeadline(decisionDate, periodDays);
            const result = isWithinPrescribedPeriod(deadline, deadline);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Appeal stage machine follows defined transitions', () => {
    it('only permitted transitions succeed', async () => {
      const actor: AppealActor = { id: 'pbt-actor', role: 'town_planner' };

      await fc.assert(
        fc.asyncProperty(
          arbAppealStage,
          arbAppealStage,
          async (currentStage, targetStage) => {
            const db = createMockDbForAppeal(currentStage);
            const deps: AppealDeps = {
              db,
              auditFn: vi.fn().mockResolvedValue(undefined),
              passportFn: vi.fn().mockResolvedValue(undefined),
              actionCentreFn: vi.fn().mockResolvedValue(undefined),
            };

            const permitted = APPEAL_STAGE_TRANSITIONS[currentStage];
            const isPermitted = permitted.includes(targetStage);

            const result = await transitionAppealStage(
              'appeal-pbt',
              targetStage,
              { outcome: 'dismissed', outcomeReasons: 'PBT test', hearingDate: '2025-06-01' },
              'proj-pbt',
              actor,
              deps
            );

            if (isPermitted) {
              expect(result.success).toBe(true);
              if (result.success) {
                expect(result.data.stage).toBe(targetStage);
              }
            } else {
              expect(result.success).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('withdrawn is a terminal state — no transitions out', async () => {
      const actor: AppealActor = { id: 'pbt-actor', role: 'town_planner' };

      await fc.assert(
        fc.asyncProperty(
          arbAppealStage,
          async (targetStage) => {
            const db = createMockDbForAppeal('withdrawn');
            const deps: AppealDeps = {
              db,
              auditFn: vi.fn().mockResolvedValue(undefined),
              passportFn: vi.fn().mockResolvedValue(undefined),
              actionCentreFn: vi.fn().mockResolvedValue(undefined),
            };

            const result = await transitionAppealStage(
              'appeal-pbt', targetStage, {}, 'proj-pbt', actor, deps
            );

            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
