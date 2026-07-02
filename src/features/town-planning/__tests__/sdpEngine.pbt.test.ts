/**
 * Property-Based Tests for SDP Engine (Property 12)
 *
 * Feature: town-planning-workflow
 *
 * **Validates: Requirements 1.2**
 *
 * Property 12:
 * SDP cannot be submitted unless SPLUMA application is approved AND
 * all conditions of approval are fulfilled/waived. The prerequisite
 * check must block submission when either condition is not met.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  validatePrerequisites,
  transitionSDPStage,
  SDP_STAGE_TRANSITIONS,
  type SDPActor,
  type SDPDeps,
} from '../services/sdpEngine';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { ConditionStatus } from '../types';

// ─── Generators ──────────────────────────────────────────────────────────────

const CONDITION_STATUSES: ConditionStatus[] = ['outstanding', 'in_progress', 'fulfilled', 'waived'];
const arbConditionStatus = fc.constantFrom(...CONDITION_STATUSES);
const arbDecisionOutcome = fc.constantFrom('approved', 'approved_with_conditions', 'refused', 'deferred', undefined);

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createPrerequisiteDb(options: {
  decisionOutcome?: string;
  conditionStatuses: ConditionStatus[];
}): FirestoreDB {
  const appsDocs = options.decisionOutcome
    ? [{ exists: true, id: 'app-1', data: () => ({ decisionOutcome: options.decisionOutcome, stage: 'decision' }) }]
    : [];

  const condDocs = options.conditionStatuses.map((status, i) => ({
    exists: true,
    id: `cond-${i}`,
    data: () => ({ status }),
  }));

  return {
    collection: vi.fn().mockImplementation((path: string) => {
      // Check conditions path BEFORE applications path since conditions path includes '/applications/'
      if (path.includes('/conditions')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new' }),
          get: vi.fn().mockResolvedValue({ docs: condDocs, empty: condDocs.length === 0 }),
        };
      }
      if (path.includes('/applications')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new' }),
          get: vi.fn().mockResolvedValue({ docs: appsDocs, empty: appsDocs.length === 0 }),
        };
      }
      // SDP collection
      return {
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            exists: true,
            id: 'sdp-1',
            data: () => ({ stage: 'preparation', projectId: 'proj-1', checklist: [], createdBy: 'u', createdAt: '2025-01-01', updatedAt: '2025-01-01' }),
          }),
          set: vi.fn().mockResolvedValue(undefined),
          update: vi.fn().mockResolvedValue(undefined),
        }),
        add: vi.fn().mockResolvedValue({ id: 'new-sdp' }),
        get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
      };
    }),
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('SDP Engine — Property-Based Tests', () => {
  describe('Property 12: SDP prerequisite enforcement', () => {
    it('submission is blocked when SPLUMA is not approved (any condition mix)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbConditionStatus, { minLength: 0, maxLength: 5 }),
          fc.constantFrom('refused', 'deferred', undefined),
          async (conditionStatuses, outcome) => {
            const db = createPrerequisiteDb({
              decisionOutcome: outcome,
              conditionStatuses,
            });

            const result = await validatePrerequisites('sdp-1', 'proj-1', db);

            // Should be blocked — SPLUMA not approved
            expect(result.canSubmit).toBe(false);
            expect(result.blockers.length).toBeGreaterThan(0);
            expect(result.blockers.some(b => b.includes('SPLUMA'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('submission is blocked when SPLUMA approved but conditions not all fulfilled/waived', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbConditionStatus, { minLength: 1, maxLength: 5 }).filter(
            statuses => statuses.some(s => s !== 'fulfilled' && s !== 'waived')
          ),
          fc.constantFrom('approved', 'approved_with_conditions'),
          async (conditionStatuses, outcome) => {
            const db = createPrerequisiteDb({
              decisionOutcome: outcome,
              conditionStatuses,
            });

            const result = await validatePrerequisites('sdp-1', 'proj-1', db);

            // Should be blocked — conditions not compliant
            expect(result.canSubmit).toBe(false);
            expect(result.blockers.length).toBeGreaterThan(0);
            expect(result.blockers.some(b => b.toLowerCase().includes('condition'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('submission is allowed when SPLUMA approved AND all conditions fulfilled/waived', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.constantFrom('fulfilled' as ConditionStatus, 'waived' as ConditionStatus),
            { minLength: 0, maxLength: 5 }
          ),
          fc.constantFrom('approved', 'approved_with_conditions'),
          async (conditionStatuses, outcome) => {
            const db = createPrerequisiteDb({
              decisionOutcome: outcome,
              conditionStatuses,
            });

            const result = await validatePrerequisites('sdp-1', 'proj-1', db);

            // Should pass — all prerequisites met
            expect(result.canSubmit).toBe(true);
            expect(result.blockers).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('transitionSDPStage to submitted fails when prerequisites not met', async () => {
      const actor: SDPActor = { id: 'u', role: 'town_planner' };

      await fc.assert(
        fc.asyncProperty(
          fc.array(arbConditionStatus, { minLength: 1, maxLength: 3 }).filter(
            statuses => statuses.some(s => s !== 'fulfilled' && s !== 'waived')
          ),
          async (conditionStatuses) => {
            const db = createPrerequisiteDb({
              decisionOutcome: 'approved',
              conditionStatuses,
            });
            const deps: SDPDeps = {
              db,
              auditFn: vi.fn().mockResolvedValue(undefined),
            };

            const result = await transitionSDPStage('sdp-1', 'submitted', {}, 'proj-1', actor, deps);

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error).toContain('Cannot submit SDP');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
