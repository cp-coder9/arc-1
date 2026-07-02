/**
 * Property-Based Tests for Subdivision Engine (Property 3)
 *
 * Feature: town-planning-workflow
 *
 * **Validates: Requirements 1.2**
 *
 * Property 3:
 * SG diagram stage transitions follow the defined state machine exactly.
 * Only permitted transitions succeed; all others are rejected.
 * Terminal states (approved) have no outgoing transitions.
 * Rejected has exactly one outgoing transition (→ diagram_prepared).
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  transitionSGDiagramStage,
  SG_DIAGRAM_TRANSITIONS,
  type SubdivisionActor,
  type SubdivisionDeps,
} from '../services/subdivisionEngine';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { SGDiagramStage } from '../types';

// ─── Generators ──────────────────────────────────────────────────────────────

const ALL_SG_STAGES: SGDiagramStage[] = [
  'instruction_issued',
  'survey_in_progress',
  'diagram_prepared',
  'diagram_lodged',
  'approved',
  'rejected',
];

const arbSGStage = fc.constantFrom(...ALL_SG_STAGES);

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDbForSG(currentStage: SGDiagramStage): FirestoreDB {
  const subDoc = {
    exists: true,
    id: 'sub-pbt',
    data: () => ({
      applicationId: 'app-pbt',
      projectId: 'proj-pbt',
      sgDiagramStage: currentStage,
      titleDeedStage: 'pending',
      newErfNumbers: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    }),
  };

  const propertyDocs = [{ exists: true, id: 'prop-1', data: () => ({ erfNumber: '123' }) }];

  return {
    collection: vi.fn().mockImplementation((path: string) => {
      if (path.includes('/subdivisions')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(subDoc),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new' }),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
        };
      }
      if (path.includes('/propertyRegister')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: true, id: 'prop-1', data: () => ({}) }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new' }),
          get: vi.fn().mockResolvedValue({ docs: propertyDocs, empty: false }),
        };
      }
      return {
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
          set: vi.fn().mockResolvedValue(undefined),
          update: vi.fn().mockResolvedValue(undefined),
        }),
        add: vi.fn().mockResolvedValue({ id: 'new' }),
        get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
      };
    }),
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Subdivision Engine — Property-Based Tests', () => {
  describe('Property 3: SG diagram state machine follows defined transitions', () => {
    it('only permitted transitions succeed', async () => {
      const actor: SubdivisionActor = { id: 'pbt-actor', role: 'town_planner' };

      await fc.assert(
        fc.asyncProperty(
          arbSGStage,
          arbSGStage,
          async (currentStage, targetStage) => {
            const db = createMockDbForSG(currentStage);
            const deps: SubdivisionDeps = {
              db,
              auditFn: vi.fn().mockResolvedValue(undefined),
              passportFn: vi.fn().mockResolvedValue(undefined),
              actionCentreFn: vi.fn().mockResolvedValue(undefined),
            };

            const permitted = SG_DIAGRAM_TRANSITIONS[currentStage];
            const isPermitted = permitted.includes(targetStage);

            const result = await transitionSGDiagramStage(
              'sub-pbt',
              targetStage,
              { newErfNumbers: ['ERF-PBT-1'], sgDiagramReference: 'SG-001' },
              'proj-pbt',
              actor,
              deps
            );

            if (isPermitted) {
              expect(result.success).toBe(true);
              if (result.success) {
                expect(result.data.sgDiagramStage).toBe(targetStage);
              }
            } else {
              expect(result.success).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('approved is a terminal state — no transitions out', async () => {
      const actor: SubdivisionActor = { id: 'pbt-actor', role: 'town_planner' };

      await fc.assert(
        fc.asyncProperty(
          arbSGStage,
          async (targetStage) => {
            const db = createMockDbForSG('approved');
            const deps: SubdivisionDeps = {
              db,
              auditFn: vi.fn().mockResolvedValue(undefined),
              passportFn: vi.fn().mockResolvedValue(undefined),
              actionCentreFn: vi.fn().mockResolvedValue(undefined),
            };

            const result = await transitionSGDiagramStage(
              'sub-pbt', targetStage, {}, 'proj-pbt', actor, deps
            );

            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejected only allows transition back to diagram_prepared', async () => {
      const actor: SubdivisionActor = { id: 'pbt-actor', role: 'town_planner' };

      await fc.assert(
        fc.asyncProperty(
          arbSGStage,
          async (targetStage) => {
            const db = createMockDbForSG('rejected');
            const deps: SubdivisionDeps = {
              db,
              auditFn: vi.fn().mockResolvedValue(undefined),
              passportFn: vi.fn().mockResolvedValue(undefined),
              actionCentreFn: vi.fn().mockResolvedValue(undefined),
            };

            const result = await transitionSGDiagramStage(
              'sub-pbt', targetStage, {}, 'proj-pbt', actor, deps
            );

            if (targetStage === 'diagram_prepared') {
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
});
