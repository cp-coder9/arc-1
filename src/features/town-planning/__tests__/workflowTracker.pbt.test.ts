/**
 * Property-Based Tests for Workflow Tracker (Properties 1 & 13)
 *
 * Feature: town-planning-workflow
 *
 * **Validates: Requirements 1.2**
 *
 * Property 1:
 * For any (stage, targetStage) pair, transitionStage() succeeds if and only if
 * targetStage is in PERMITTED_TRANSITIONS[stage]. If not permitted, it rejects
 * with a TransitionError.
 *
 * Property 13:
 * For any valid transition, an immutable audit record is created containing:
 * application reference, previous stage, new stage, date, actor, and notes.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  transitionStage,
  PERMITTED_TRANSITIONS,
  TransitionError,
  type TransitionActor,
  type TransitionDeps,
  type TransitionParams,
  type DateUtils,
  type WorkflowAuditFn,
  type ActionCentreFn,
  type AuditRecord,
} from '../services/workflowTracker';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { ApplicationStage } from '../types';

// ─── Generators ──────────────────────────────────────────────────────────────

const ALL_STAGES: ApplicationStage[] = [
  'preparation',
  'submission',
  'acknowledgement',
  'circulation',
  'advertising',
  'objection_period',
  'comment_period',
  'hearing',
  'consideration',
  'decision',
  'conditions_compliance',
  'appeal',
  'withdrawn',
];

const arbStage = fc.constantFrom(...ALL_STAGES);
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDateUtils(): DateUtils {
  return {
    now: () => '2025-06-15T10:00:00.000Z',
    today: () => '2025-06-15',
  };
}

function createMockDb(currentStage: ApplicationStage): FirestoreDB {
  let addCounter = 0;

  const appDocRef = {
    get: vi.fn().mockResolvedValue({
      exists: true,
      id: 'app-pbt',
      data: () => ({
        stage: currentStage,
        referenceNumber: 'TP-PBT1-001',
        municipalityId: 'muni-001',
        projectId: 'proj-001',
        updatedAt: '2025-06-01T00:00:00.000Z',
      }),
    }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };

  const muniDocRef = {
    get: vi.fn().mockResolvedValue({
      exists: true,
      id: 'muni-001',
      data: () => ({ advertisingPeriodDays: 28 }),
    }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };

  return {
    collection: vi.fn().mockImplementation((path: string) => {
      if (path === 'municipalityProfiles') {
        return {
          doc: vi.fn().mockReturnValue(muniDocRef),
          add: vi.fn().mockResolvedValue({ id: 'muni-doc' }),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
        };
      }
      return {
        doc: vi.fn().mockReturnValue(appDocRef),
        add: vi.fn().mockImplementation(() => {
          addCounter++;
          return Promise.resolve({ id: `pbt-doc-${addCounter}` });
        }),
        get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
      };
    }),
  };
}

function createDeps(): { deps: TransitionDeps; getAuditCalls: () => AuditRecord[] } {
  const auditCalls: AuditRecord[] = [];
  const auditFn: WorkflowAuditFn = vi.fn().mockImplementation(async (record: AuditRecord) => {
    auditCalls.push(record);
  });
  const actionCentreFn: ActionCentreFn = vi.fn().mockResolvedValue(undefined);

  return {
    deps: {
      db: createMockDb('preparation'), // will be overridden per test
      auditFn,
      actionCentreFn,
      dateUtils: createMockDateUtils(),
    },
    getAuditCalls: () => auditCalls,
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Workflow Tracker — Property-Based Tests', () => {
  describe('Property 1: State machine transition validity', () => {
    it('transition succeeds iff targetStage is in PERMITTED_TRANSITIONS[currentStage]', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbStage,
          arbStage,
          async (currentStage, targetStage) => {
            const db = createMockDb(currentStage);
            const auditFn: WorkflowAuditFn = vi.fn().mockResolvedValue(undefined);
            const actionCentreFn: ActionCentreFn = vi.fn().mockResolvedValue(undefined);

            const deps: TransitionDeps = {
              db,
              auditFn,
              actionCentreFn,
              dateUtils: createMockDateUtils(),
            };

            const actor: TransitionActor = { id: 'pbt-actor', role: 'town_planner' };

            // Provide minimal params that satisfy each target stage
            const params: TransitionParams = {
              submissionDate: '2025-06-10',
              submissionMethod: 'email',
              municipalReference: 'MUN-PBT',
              acknowledgementDate: '2025-06-15',
              advertisingStartDate: '2025-07-01',
              hearingDate: '2025-08-15',
              venue: 'Town Hall',
              hearingReference: 'HR-PBT',
              decisionOutcome: 'approved',
              decisionDate: '2025-09-01',
              decisionReference: 'DEC-PBT',
            };

            const permitted = PERMITTED_TRANSITIONS[currentStage] ?? [];
            const isPermitted = permitted.includes(targetStage);

            if (isPermitted) {
              // Should succeed
              const result = await transitionStage(
                'app-pbt', 'proj-001', targetStage, params, actor, deps
              );
              expect(result.success).toBe(true);
              expect(result.transition.previousStage).toBe(currentStage);
              expect(result.transition.newStage).toBe(targetStage);
            } else {
              // Should throw TransitionError
              await expect(
                transitionStage('app-pbt', 'proj-001', targetStage, params, actor, deps)
              ).rejects.toThrow(TransitionError);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 13: Immutable audit record on every valid transition', () => {
    it('every valid transition creates an audit record with required fields', async () => {
      // Generate only valid (currentStage, targetStage) pairs
      const arbValidPair = arbStage.chain((currentStage) => {
        const permitted = PERMITTED_TRANSITIONS[currentStage] ?? [];
        if (permitted.length === 0) {
          // Terminal state — no valid transitions, skip
          return fc.constant(null);
        }
        return fc.constantFrom(...permitted).map((target) => ({
          currentStage,
          targetStage: target,
        }));
      }).filter((pair): pair is { currentStage: ApplicationStage; targetStage: ApplicationStage } =>
        pair !== null
      );

      await fc.assert(
        fc.asyncProperty(
          arbValidPair,
          arbNonEmptyString,
          async (pair, notes) => {
            const { currentStage, targetStage } = pair;
            const db = createMockDb(currentStage);
            const auditCalls: AuditRecord[] = [];
            const auditFn: WorkflowAuditFn = vi.fn().mockImplementation(async (record: AuditRecord) => {
              auditCalls.push(record);
            });
            const actionCentreFn: ActionCentreFn = vi.fn().mockResolvedValue(undefined);

            const deps: TransitionDeps = {
              db,
              auditFn,
              actionCentreFn,
              dateUtils: createMockDateUtils(),
            };

            const actor: TransitionActor = { id: 'pbt-actor', role: 'town_planner' };
            const params: TransitionParams = {
              submissionDate: '2025-06-10',
              submissionMethod: 'email',
              municipalReference: 'MUN-PBT',
              acknowledgementDate: '2025-06-15',
              advertisingStartDate: '2025-07-01',
              hearingDate: '2025-08-15',
              venue: 'Town Hall',
              hearingReference: 'HR-PBT',
              decisionOutcome: 'approved',
              decisionDate: '2025-09-01',
              decisionReference: 'DEC-PBT',
              notes,
            };

            await transitionStage('app-pbt', 'proj-001', targetStage, params, actor, deps);

            // Audit function must have been called exactly once
            expect(auditFn).toHaveBeenCalledTimes(1);

            // Audit record must contain all required fields
            const record = auditCalls[0];
            expect(record).toBeDefined();
            expect(record.action).toBe('stage_transition');
            expect(record.applicationId).toBe('app-pbt');
            expect(record.projectId).toBe('proj-001');
            expect(record.referenceNumber).toBe('TP-PBT1-001');
            expect(record.previousStage).toBe(currentStage);
            expect(record.newStage).toBe(targetStage);
            expect(record.actorId).toBe('pbt-actor');
            expect(record.actorRole).toBe('town_planner');
            expect(record.timestamp).toBeTruthy();
            expect(record.notes).toBe(notes);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
