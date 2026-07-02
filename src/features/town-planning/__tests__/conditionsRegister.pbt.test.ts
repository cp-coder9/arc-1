/**
 * Property-Based Tests for Conditions Register (Properties 2, 6, 7)
 *
 * Feature: town-planning-workflow
 *
 * **Validates: Requirements 1.2**
 *
 * Property 2:
 * Condition status transitions are forward-only. No transition from
 * fulfilled or waived to any other state is permitted.
 *
 * Property 6:
 * Transition to 'fulfilled' requires ≥1 evidence document ID.
 * Transition to 'waived' requires a non-empty waiverReference AND waiverReason.
 *
 * Property 7:
 * isConditionsCompliant() returns true if and only if ALL conditions have
 * status 'fulfilled' or 'waived'. Returns false if empty or any are
 * 'outstanding'/'in_progress'.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  updateConditionStatus,
  isConditionsCompliant,
  CONDITION_STATUS_TRANSITIONS,
  type ConditionActor,
  type ConditionDeps,
  type ConditionAuditFn,
} from '../services/conditionsRegister';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { ConditionStatus } from '../types';

// ─── Generators ──────────────────────────────────────────────────────────────

const ALL_STATUSES: ConditionStatus[] = ['outstanding', 'in_progress', 'fulfilled', 'waived'];

const arbStatus = fc.constantFrom(...ALL_STATUSES);
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDbForCondition(currentStatus: ConditionStatus): FirestoreDB {
  const condDocRef = {
    get: vi.fn().mockResolvedValue({
      exists: true,
      id: 'cond-pbt',
      data: () => ({
        status: currentStatus,
        applicationId: 'app-pbt',
        conditionNumber: 1,
        description: 'Test condition',
        evidenceDocuments: currentStatus === 'fulfilled' ? ['existing-doc'] : [],
        waiverReference: currentStatus === 'waived' ? 'WAV-001' : undefined,
        waiverReason: currentStatus === 'waived' ? 'Test reason' : undefined,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      }),
    }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(condDocRef),
      add: vi.fn().mockResolvedValue({ id: 'pbt-cond' }),
      get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    }),
  };
}

function createMockDbForCompliance(statuses: ConditionStatus[]): FirestoreDB {
  const docs = statuses.map((status, i) => ({
    exists: true,
    id: `cond-${i}`,
    data: () => ({ status }),
  }));

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      add: vi.fn().mockResolvedValue({ id: 'new' }),
      get: vi.fn().mockResolvedValue({ docs, empty: docs.length === 0 }),
    }),
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Conditions Register — Property-Based Tests', () => {
  describe('Property 2: Forward-only state machine (no reverse from fulfilled/waived)', () => {
    it('no transition from fulfilled to any state succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbStatus,
          async (targetStatus) => {
            const db = createMockDbForCondition('fulfilled');
            const auditFn: ConditionAuditFn = vi.fn().mockResolvedValue(undefined);
            const deps: ConditionDeps = { db, auditFn };
            const actor: ConditionActor = { id: 'pbt-actor', role: 'town_planner' };

            const result = await updateConditionStatus(
              'cond-pbt', 'app-pbt', 'proj-pbt', targetStatus,
              {
                evidenceDocIds: ['doc-pbt'],
                waiverReference: 'WAV-PBT',
                waiverReason: 'PBT reason',
              },
              actor, deps
            );

            // fulfilled is terminal — all transitions should fail
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no transition from waived to any state succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbStatus,
          async (targetStatus) => {
            const db = createMockDbForCondition('waived');
            const auditFn: ConditionAuditFn = vi.fn().mockResolvedValue(undefined);
            const deps: ConditionDeps = { db, auditFn };
            const actor: ConditionActor = { id: 'pbt-actor', role: 'town_planner' };

            const result = await updateConditionStatus(
              'cond-pbt', 'app-pbt', 'proj-pbt', targetStatus,
              {
                evidenceDocIds: ['doc-pbt'],
                waiverReference: 'WAV-PBT',
                waiverReason: 'PBT reason',
              },
              actor, deps
            );

            // waived is terminal — all transitions should fail
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('transitions from non-terminal states succeed only for permitted targets', async () => {
      const nonTerminalStatuses: ConditionStatus[] = ['outstanding', 'in_progress'];
      const arbNonTerminal = fc.constantFrom(...nonTerminalStatuses);

      await fc.assert(
        fc.asyncProperty(
          arbNonTerminal,
          arbStatus,
          async (currentStatus, targetStatus) => {
            const db = createMockDbForCondition(currentStatus);
            const auditFn: ConditionAuditFn = vi.fn().mockResolvedValue(undefined);
            const deps: ConditionDeps = { db, auditFn };
            const actor: ConditionActor = { id: 'pbt-actor', role: 'town_planner' };

            const permitted = CONDITION_STATUS_TRANSITIONS[currentStatus];
            const isPermitted = permitted.includes(targetStatus);

            const result = await updateConditionStatus(
              'cond-pbt', 'app-pbt', 'proj-pbt', targetStatus,
              {
                evidenceDocIds: ['doc-pbt'],
                waiverReference: 'WAV-PBT',
                waiverReason: 'PBT reason',
              },
              actor, deps
            );

            if (isPermitted) {
              expect(result.success).toBe(true);
            } else {
              expect(result.success).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 6: Conditional requirements for fulfilled/waived', () => {
    it('fulfilled without evidence always fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('outstanding' as ConditionStatus, 'in_progress' as ConditionStatus),
          async (currentStatus) => {
            // Only test from states that can transition to fulfilled
            if (!CONDITION_STATUS_TRANSITIONS[currentStatus].includes('fulfilled')) {
              return; // skip - can't reach fulfilled from outstanding
            }

            const db = createMockDbForCondition(currentStatus);
            const auditFn: ConditionAuditFn = vi.fn().mockResolvedValue(undefined);
            const deps: ConditionDeps = { db, auditFn };
            const actor: ConditionActor = { id: 'pbt-actor', role: 'town_planner' };

            // Try without evidence
            const result = await updateConditionStatus(
              'cond-pbt', 'app-pbt', 'proj-pbt', 'fulfilled',
              { evidenceDocIds: [] },
              actor, deps
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error).toContain('evidence');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fulfilled with ≥1 evidence succeeds from in_progress', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbNonEmptyString, { minLength: 1, maxLength: 5 }),
          async (evidenceDocIds) => {
            const db = createMockDbForCondition('in_progress');
            const auditFn: ConditionAuditFn = vi.fn().mockResolvedValue(undefined);
            const deps: ConditionDeps = { db, auditFn };
            const actor: ConditionActor = { id: 'pbt-actor', role: 'town_planner' };

            const result = await updateConditionStatus(
              'cond-pbt', 'app-pbt', 'proj-pbt', 'fulfilled',
              { evidenceDocIds },
              actor, deps
            );

            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('waived without reference or reason always fails', async () => {
      const arbMissingWaiver = fc.oneof(
        fc.constant({ waiverReference: undefined, waiverReason: 'has reason' }),
        fc.constant({ waiverReference: 'has ref', waiverReason: undefined }),
        fc.constant({ waiverReference: undefined, waiverReason: undefined }),
        fc.constant({ waiverReference: '', waiverReason: 'has reason' }),
        fc.constant({ waiverReference: 'has ref', waiverReason: '' }),
      );

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('outstanding' as ConditionStatus, 'in_progress' as ConditionStatus),
          arbMissingWaiver,
          async (currentStatus, waiver) => {
            const db = createMockDbForCondition(currentStatus);
            const auditFn: ConditionAuditFn = vi.fn().mockResolvedValue(undefined);
            const deps: ConditionDeps = { db, auditFn };
            const actor: ConditionActor = { id: 'pbt-actor', role: 'town_planner' };

            const result = await updateConditionStatus(
              'cond-pbt', 'app-pbt', 'proj-pbt', 'waived',
              waiver as { waiverReference?: string; waiverReason?: string },
              actor, deps
            );

            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('waived with both reference and reason succeeds from permitted states', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('outstanding' as ConditionStatus, 'in_progress' as ConditionStatus),
          arbNonEmptyString,
          arbNonEmptyString,
          async (currentStatus, waiverReference, waiverReason) => {
            const db = createMockDbForCondition(currentStatus);
            const auditFn: ConditionAuditFn = vi.fn().mockResolvedValue(undefined);
            const deps: ConditionDeps = { db, auditFn };
            const actor: ConditionActor = { id: 'pbt-actor', role: 'town_planner' };

            const result = await updateConditionStatus(
              'cond-pbt', 'app-pbt', 'proj-pbt', 'waived',
              { waiverReference, waiverReason },
              actor, deps
            );

            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 7: isConditionsCompliant iff all fulfilled/waived', () => {
    it('returns true iff all statuses are fulfilled or waived (non-empty set)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbStatus, { minLength: 1, maxLength: 10 }),
          async (statuses) => {
            const db = createMockDbForCompliance(statuses);

            const result = await isConditionsCompliant('app-pbt', 'proj-pbt', db);

            const allComplete = statuses.every(
              (s) => s === 'fulfilled' || s === 'waived'
            );

            expect(result).toBe(allComplete);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns false when conditions list is empty', async () => {
      const db = createMockDbForCompliance([]);
      const result = await isConditionsCompliant('app-pbt', 'proj-pbt', db);
      expect(result).toBe(false);
    });
  });
});
