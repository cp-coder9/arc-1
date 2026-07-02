/**
 * Unit Tests for Subdivision Engine Service
 *
 * Tests subdivision creation, surveyor instruction generation,
 * SG diagram transitions, title deed transitions, and property register updates.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createSubdivisionRecord,
  generateSurveyorInstruction,
  transitionSGDiagramStage,
  transitionTitleDeedStage,
  SG_DIAGRAM_TRANSITIONS,
  TITLE_DEED_TRANSITIONS,
  type SubdivisionActor,
  type SubdivisionDeps,
} from '../services/subdivisionEngine';
import type { FirestoreDB } from '../services/municipalityConfig';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(overrides?: {
  subdivisionData?: Record<string, unknown>;
  propertyDocs?: Record<string, unknown>[];
}): FirestoreDB {
  const subDoc = overrides?.subdivisionData
    ? { exists: true, id: 'sub-1', data: () => overrides.subdivisionData }
    : { exists: false, id: 'sub-1', data: () => undefined };

  const propertyDocs = (overrides?.propertyDocs ?? []).map((d, i) => ({
    exists: true,
    id: `prop-${i}`,
    data: () => d,
  }));

  return {
    collection: vi.fn().mockImplementation((path: string) => {
      if (path.includes('/subdivisions')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(subDoc),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-sub' }),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
        };
      }
      if (path.includes('/propertyRegister')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-prop' }),
          get: vi.fn().mockResolvedValue({ docs: propertyDocs, empty: propertyDocs.length === 0 }),
        };
      }
      return {
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
          set: vi.fn().mockResolvedValue(undefined),
          update: vi.fn().mockResolvedValue(undefined),
        }),
        add: vi.fn().mockResolvedValue({ id: 'new-doc' }),
        get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
      };
    }),
  };
}

const actor: SubdivisionActor = { id: 'user-1', role: 'town_planner' };

function createDeps(db: FirestoreDB): SubdivisionDeps {
  return {
    db,
    auditFn: vi.fn().mockResolvedValue(undefined),
    passportFn: vi.fn().mockResolvedValue(undefined),
    actionCentreFn: vi.fn().mockResolvedValue(undefined),
    teamRouterFn: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Subdivision Engine', () => {
  describe('createSubdivisionRecord', () => {
    it('creates a record with initial stages', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      const result = await createSubdivisionRecord('app-1', 'proj-1', { surveyorId: 'surveyor-1', surveyorName: 'John' }, actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sgDiagramStage).toBe('instruction_issued');
        expect(result.data.titleDeedStage).toBe('pending');
        expect(result.data.applicationId).toBe('app-1');
      }
    });

    it('triggers team router when no surveyor assigned', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      await createSubdivisionRecord('app-1', 'proj-1', {}, actor, deps);

      expect(deps.teamRouterFn).toHaveBeenCalledWith(expect.objectContaining({
        requiredRole: 'land_surveyor',
      }));
    });

    it('does not trigger team router when surveyor assigned', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      await createSubdivisionRecord('app-1', 'proj-1', { surveyorId: 'surv-1' }, actor, deps);

      expect(deps.teamRouterFn).not.toHaveBeenCalled();
    });

    it('fails with empty applicationId', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      const result = await createSubdivisionRecord('', 'proj-1', {}, actor, deps);
      expect(result.success).toBe(false);
    });
  });

  describe('generateSurveyorInstruction', () => {
    it('generates instruction and surfaces to action centre', async () => {
      const db = createMockDb({
        subdivisionData: {
          applicationId: 'app-1',
          projectId: 'proj-1',
          sgDiagramStage: 'instruction_issued',
          titleDeedStage: 'pending',
          newErfNumbers: [],
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await generateSurveyorInstruction('sub-1', 'proj-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.instructionDocument).toContain('SI-');
      }
      expect(deps.actionCentreFn).toHaveBeenCalledWith(expect.objectContaining({
        alertType: 'surveyor_instruction',
        targetRole: 'land_surveyor',
      }));
    });

    it('fails for non-existent subdivision', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      const result = await generateSurveyorInstruction('nonexistent', 'proj-1', actor, deps);
      expect(result.success).toBe(false);
    });
  });

  describe('transitionSGDiagramStage', () => {
    it('transitions instruction_issued → survey_in_progress', async () => {
      const db = createMockDb({
        subdivisionData: {
          applicationId: 'app-1',
          projectId: 'proj-1',
          sgDiagramStage: 'instruction_issued',
          titleDeedStage: 'pending',
          newErfNumbers: [],
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await transitionSGDiagramStage('sub-1', 'survey_in_progress', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sgDiagramStage).toBe('survey_in_progress');
      }
    });

    it('rejects invalid transition (instruction_issued → approved)', async () => {
      const db = createMockDb({
        subdivisionData: {
          applicationId: 'app-1',
          projectId: 'proj-1',
          sgDiagramStage: 'instruction_issued',
          titleDeedStage: 'pending',
          newErfNumbers: [],
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await transitionSGDiagramStage('sub-1', 'approved', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(false);
    });

    it('allows rejected → diagram_prepared', async () => {
      const db = createMockDb({
        subdivisionData: {
          applicationId: 'app-1',
          projectId: 'proj-1',
          sgDiagramStage: 'rejected',
          titleDeedStage: 'pending',
          newErfNumbers: [],
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await transitionSGDiagramStage('sub-1', 'diagram_prepared', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(true);
    });

    it('updates property register on approval with new erf numbers', async () => {
      const db = createMockDb({
        subdivisionData: {
          applicationId: 'app-1',
          projectId: 'proj-1',
          sgDiagramStage: 'diagram_lodged',
          titleDeedStage: 'pending',
          newErfNumbers: [],
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        propertyDocs: [{ erfNumber: '123', township: 'Test' }],
      });
      const deps = createDeps(db);

      const result = await transitionSGDiagramStage('sub-1', 'approved', { newErfNumbers: ['ERF-101', 'ERF-102'] }, 'proj-1', actor, deps);

      expect(result.success).toBe(true);
      expect(deps.passportFn).toHaveBeenCalledWith(expect.objectContaining({
        sgDiagramApproved: true,
        newErfNumbers: ['ERF-101', 'ERF-102'],
      }));
    });

    it('fires action centre on rejection', async () => {
      const db = createMockDb({
        subdivisionData: {
          applicationId: 'app-1',
          projectId: 'proj-1',
          sgDiagramStage: 'diagram_lodged',
          titleDeedStage: 'pending',
          newErfNumbers: [],
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      await transitionSGDiagramStage('sub-1', 'rejected', { notes: 'Errors found' }, 'proj-1', actor, deps);

      expect(deps.actionCentreFn).toHaveBeenCalledWith(expect.objectContaining({
        alertType: 'sg_rejected',
      }));
    });
  });

  describe('transitionTitleDeedStage', () => {
    it('transitions pending → lodged', async () => {
      const db = createMockDb({
        subdivisionData: {
          applicationId: 'app-1',
          projectId: 'proj-1',
          sgDiagramStage: 'approved',
          titleDeedStage: 'pending',
          newErfNumbers: ['ERF-101'],
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await transitionTitleDeedStage('sub-1', 'lodged', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.titleDeedStage).toBe('lodged');
      }
    });

    it('updates passport on registration', async () => {
      const db = createMockDb({
        subdivisionData: {
          applicationId: 'app-1',
          projectId: 'proj-1',
          sgDiagramStage: 'approved',
          titleDeedStage: 'lodged',
          newErfNumbers: ['ERF-101'],
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      await transitionTitleDeedStage('sub-1', 'registered', {}, 'proj-1', actor, deps);

      expect(deps.passportFn).toHaveBeenCalledWith(expect.objectContaining({
        titleDeedRegistered: true,
      }));
    });

    it('rejects invalid transition (registered → pending)', async () => {
      const db = createMockDb({
        subdivisionData: {
          applicationId: 'app-1',
          projectId: 'proj-1',
          sgDiagramStage: 'approved',
          titleDeedStage: 'registered',
          newErfNumbers: ['ERF-101'],
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await transitionTitleDeedStage('sub-1', 'pending', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(false);
    });
  });
});
