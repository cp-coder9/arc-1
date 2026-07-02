/**
 * Property-Based Tests for Sequential Dependency (Property 11)
 *
 * Feature: town-planning-workflow
 *
 * **Validates: Requirements 1.2**
 *
 * Property 11:
 * Readiness determination is correct: ready=true iff SPLUMA approved
 * AND conditions all fulfilled/waived AND SDP approved. Otherwise,
 * ready=false with corresponding blockers. Bypass overrides all checks.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { checkReadiness } from '../services/sequentialDependency';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { ConditionStatus } from '../types';

// ─── Generators ──────────────────────────────────────────────────────────────

const CONDITION_STATUSES: ConditionStatus[] = ['outstanding', 'in_progress', 'fulfilled', 'waived'];
const arbConditionStatus = fc.constantFrom(...CONDITION_STATUSES);
const arbDecisionOutcome = fc.constantFrom('approved', 'approved_with_conditions', 'refused', 'deferred');
const arbSdpStage = fc.constantFrom('preparation', 'submitted', 'under_review', 'approved', 'rejected');

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createReadinessDb(options: {
  decisionOutcome?: string;
  hasApplication: boolean;
  conditionStatuses: ConditionStatus[];
  sdpStage?: string;
  hasSdp: boolean;
  bypassed?: boolean;
}): FirestoreDB {
  const appsDocs = options.hasApplication
    ? [{
        exists: true,
        id: 'app-1',
        data: () => ({
          id: 'app-1',
          decisionOutcome: options.decisionOutcome,
          stage: options.decisionOutcome ? 'decision' : 'circulation',
        }),
      }]
    : [];

  const condDocs = options.conditionStatuses.map((status, i) => ({
    exists: true,
    id: `cond-${i}`,
    data: () => ({ status }),
  }));

  const sdpDocs = options.hasSdp
    ? [{ exists: true, id: 'sdp-1', data: () => ({ stage: options.sdpStage ?? 'preparation' }) }]
    : [];

  const bypassDocs = options.bypassed
    ? [{ exists: true, id: 'bypass-1', data: () => ({ bypassed: true }) }]
    : [];

  return {
    collection: vi.fn().mockImplementation((path: string) => {
      if (path.includes('/bypass')) {
        return {
          doc: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn(), update: vi.fn() }),
          add: vi.fn().mockResolvedValue({ id: 'new' }),
          get: vi.fn().mockResolvedValue({ docs: bypassDocs, empty: bypassDocs.length === 0 }),
        };
      }
      if (path.includes('/applications') && !path.includes('/conditions')) {
        return {
          doc: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn(), update: vi.fn() }),
          add: vi.fn().mockResolvedValue({ id: 'new' }),
          get: vi.fn().mockResolvedValue({ docs: appsDocs, empty: appsDocs.length === 0 }),
        };
      }
      if (path.includes('/conditions')) {
        return {
          doc: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn(), update: vi.fn() }),
          add: vi.fn().mockResolvedValue({ id: 'new' }),
          get: vi.fn().mockResolvedValue({ docs: condDocs, empty: condDocs.length === 0 }),
        };
      }
      if (path.includes('/sdps')) {
        return {
          doc: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn(), update: vi.fn() }),
          add: vi.fn().mockResolvedValue({ id: 'new' }),
          get: vi.fn().mockResolvedValue({ docs: sdpDocs, empty: sdpDocs.length === 0 }),
        };
      }
      return {
        doc: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn(), update: vi.fn() }),
        add: vi.fn().mockResolvedValue({ id: 'new' }),
        get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
      };
    }),
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Sequential Dependency — Property-Based Tests', () => {
  describe('Property 11: Readiness determination', () => {
    it('ready=true iff SPLUMA approved AND conditions compliant AND SDP approved', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDecisionOutcome,
          fc.array(arbConditionStatus, { minLength: 0, maxLength: 5 }),
          arbSdpStage,
          async (decisionOutcome, conditionStatuses, sdpStage) => {
            const db = createReadinessDb({
              hasApplication: true,
              decisionOutcome,
              conditionStatuses,
              hasSdp: true,
              sdpStage,
            });

            const result = await checkReadiness('proj-1', db);

            const splumaApproved = decisionOutcome === 'approved' || decisionOutcome === 'approved_with_conditions';
            const conditionsCompliant = conditionStatuses.length === 0 ||
              conditionStatuses.every(s => s === 'fulfilled' || s === 'waived');
            const sdpApproved = sdpStage === 'approved';

            const expectedReady = splumaApproved && conditionsCompliant && sdpApproved;

            expect(result.ready).toBe(expectedReady);

            if (expectedReady) {
              expect(result.status.overall).toBe('ready');
              expect(result.blockers).toHaveLength(0);
            } else {
              expect(result.status.overall).toBe('not_ready');
              expect(result.blockers.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('ready=false when no application exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbSdpStage,
          async (sdpStage) => {
            const db = createReadinessDb({
              hasApplication: false,
              conditionStatuses: [],
              hasSdp: true,
              sdpStage,
            });

            const result = await checkReadiness('proj-1', db);

            expect(result.ready).toBe(false);
            expect(result.blockers.some(b => b.includes('SPLUMA'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('bypass overrides all checks — always ready', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // hasApplication
          fc.array(arbConditionStatus, { minLength: 0, maxLength: 3 }),
          fc.boolean(), // hasSdp
          async (hasApp, conditionStatuses, hasSdp) => {
            const db = createReadinessDb({
              hasApplication: hasApp,
              conditionStatuses,
              hasSdp,
              bypassed: true,
            });

            const result = await checkReadiness('proj-1', db);

            expect(result.ready).toBe(true);
            expect(result.status.overall).toBe('bypassed');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('non-compliant conditions always block readiness (SPLUMA approved, SDP approved)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbConditionStatus, { minLength: 1, maxLength: 5 }).filter(
            statuses => statuses.some(s => s !== 'fulfilled' && s !== 'waived')
          ),
          async (conditionStatuses) => {
            const db = createReadinessDb({
              hasApplication: true,
              decisionOutcome: 'approved',
              conditionStatuses,
              hasSdp: true,
              sdpStage: 'approved',
            });

            const result = await checkReadiness('proj-1', db);

            expect(result.ready).toBe(false);
            expect(result.blockers.some(b => b.toLowerCase().includes('condition'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
