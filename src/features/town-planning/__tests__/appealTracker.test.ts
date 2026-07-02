/**
 * Unit Tests for Appeal Tracker Service
 *
 * Tests appeal filing, stage transitions, deadline calculation,
 * late-filing warning, outcome recording, and passport update.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  fileAppeal,
  transitionAppealStage,
  calculatePrescribedDeadline,
  isWithinPrescribedPeriod,
  APPEAL_STAGE_TRANSITIONS,
  type AppealActor,
  type AppealDeps,
  type AppealInput,
} from '../services/appealTracker';
import type { FirestoreDB } from '../services/municipalityConfig';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(overrides?: {
  appealData?: Record<string, unknown>;
  applicationData?: Record<string, unknown>;
  municipalityData?: Record<string, unknown>;
}): FirestoreDB {
  const appealDoc = overrides?.appealData
    ? { exists: true, id: 'appeal-1', data: () => overrides.appealData }
    : { exists: false, id: 'appeal-1', data: () => undefined };

  const appDoc = overrides?.applicationData
    ? { exists: true, id: 'app-1', data: () => overrides.applicationData }
    : { exists: false, id: 'app-1', data: () => undefined };

  const muniDoc = overrides?.municipalityData
    ? { exists: true, id: 'muni-1', data: () => overrides.municipalityData }
    : { exists: false, id: 'muni-1', data: () => undefined };

  return {
    collection: vi.fn().mockImplementation((path: string) => {
      if (path.includes('/appeals')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(appealDoc),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-appeal' }),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
        };
      }
      if (path.includes('/applications')) {
        const appDocs = overrides?.applicationData
          ? [{ exists: true, id: 'app-1', data: () => overrides.applicationData }]
          : [];
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(appDoc),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-app' }),
          get: vi.fn().mockResolvedValue({ docs: appDocs, empty: appDocs.length === 0 }),
        };
      }
      if (path === 'municipalityProfiles') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(muniDoc),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-muni' }),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
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

const actor: AppealActor = { id: 'user-1', role: 'town_planner' };

function createDeps(db: FirestoreDB): AppealDeps {
  return {
    db,
    auditFn: vi.fn().mockResolvedValue(undefined),
    passportFn: vi.fn().mockResolvedValue(undefined),
    actionCentreFn: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Appeal Tracker', () => {
  describe('calculatePrescribedDeadline', () => {
    it('adds 180 days to decision date', () => {
      const deadline = calculatePrescribedDeadline('2025-01-01', 180);
      expect(deadline).toBe('2025-06-30');
    });

    it('handles municipality-configured period', () => {
      const deadline = calculatePrescribedDeadline('2025-01-01', 90);
      expect(deadline).toBe('2025-04-01');
    });

    it('handles year boundary', () => {
      const deadline = calculatePrescribedDeadline('2025-07-15', 180);
      expect(deadline).toBe('2026-01-11');
    });
  });

  describe('isWithinPrescribedPeriod', () => {
    it('returns true when filing is before deadline', () => {
      expect(isWithinPrescribedPeriod('2025-03-01', '2025-06-30')).toBe(true);
    });

    it('returns true when filing is on deadline', () => {
      expect(isWithinPrescribedPeriod('2025-06-30', '2025-06-30')).toBe(true);
    });

    it('returns false when filing is after deadline', () => {
      expect(isWithinPrescribedPeriod('2025-07-01', '2025-06-30')).toBe(false);
    });
  });

  describe('fileAppeal', () => {
    it('creates appeal with correct deadline and flag', async () => {
      const db = createMockDb({
        applicationData: { id: 'app-1', municipalityId: 'muni-1' },
      });
      const deps = createDeps(db);

      const input: AppealInput = {
        grounds: 'Decision was unreasonable',
        decisionDate: '2025-01-01',
      };

      const result = await fileAppeal('app-1', 'proj-1', input, actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stage).toBe('filed');
        expect(result.data.prescribedDeadline).toBe('2025-06-30'); // 180 days default
        expect(result.data.grounds).toBe('Decision was unreasonable');
      }
    });

    it('uses municipality-configured appeal period', async () => {
      const db = createMockDb({
        applicationData: { id: 'app-1', municipalityId: 'muni-1' },
        municipalityData: { appealPeriodDays: 90 },
      });
      const deps = createDeps(db);

      const input: AppealInput = {
        grounds: 'Unfair process',
        decisionDate: '2025-01-01',
      };

      const result = await fileAppeal('app-1', 'proj-1', input, actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prescribedDeadline).toBe('2025-04-01'); // 90 days
      }
    });

    it('updates Project Passport (under appeal, blocks building)', async () => {
      const db = createMockDb({
        applicationData: { id: 'app-1', municipalityId: 'muni-1' },
      });
      const deps = createDeps(db);

      const input: AppealInput = { grounds: 'Test', decisionDate: '2025-01-01' };
      await fileAppeal('app-1', 'proj-1', input, actor, deps);

      expect(deps.passportFn).toHaveBeenCalledWith(expect.objectContaining({
        underAppeal: true,
        blocksBuilding: true,
      }));
    });

    it('fails with empty grounds', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      const input: AppealInput = { grounds: '', decisionDate: '2025-01-01' };
      const result = await fileAppeal('app-1', 'proj-1', input, actor, deps);

      expect(result.success).toBe(false);
    });

    it('fails with empty decisionDate', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      const input: AppealInput = { grounds: 'Test', decisionDate: '' };
      const result = await fileAppeal('app-1', 'proj-1', input, actor, deps);

      expect(result.success).toBe(false);
    });
  });

  describe('transitionAppealStage', () => {
    it('transitions filed → under_consideration', async () => {
      const db = createMockDb({
        appealData: { stage: 'filed', applicationId: 'app-1', projectId: 'proj-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      });
      const deps = createDeps(db);

      const result = await transitionAppealStage('appeal-1', 'under_consideration', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stage).toBe('under_consideration');
      }
    });

    it('records outcome on decision_received', async () => {
      const db = createMockDb({
        appealData: { stage: 'hearing_scheduled', applicationId: 'app-1', projectId: 'proj-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      });
      const deps = createDeps(db);

      const result = await transitionAppealStage('appeal-1', 'decision_received', { outcome: 'upheld', outcomeReasons: 'Valid grounds' }, 'proj-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.outcome).toBe('upheld');
      }
    });

    it('allows withdrawn from any non-terminal state', async () => {
      const stages: Array<{ stage: string }> = [
        { stage: 'filed' },
        { stage: 'under_consideration' },
        { stage: 'hearing_scheduled' },
        { stage: 'decision_received' },
      ];

      for (const { stage } of stages) {
        const db = createMockDb({
          appealData: { stage, applicationId: 'app-1', projectId: 'proj-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
        });
        const deps = createDeps(db);

        const result = await transitionAppealStage('appeal-1', 'withdrawn', {}, 'proj-1', actor, deps);
        expect(result.success).toBe(true);
      }
    });

    it('rejects transition from withdrawn', async () => {
      const db = createMockDb({
        appealData: { stage: 'withdrawn', applicationId: 'app-1', projectId: 'proj-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      });
      const deps = createDeps(db);

      const result = await transitionAppealStage('appeal-1', 'filed', {}, 'proj-1', actor, deps);
      expect(result.success).toBe(false);
    });

    it('updates passport (no longer blocks) on decision_received', async () => {
      const db = createMockDb({
        appealData: { stage: 'hearing_scheduled', applicationId: 'app-1', projectId: 'proj-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      });
      const deps = createDeps(db);

      await transitionAppealStage('appeal-1', 'decision_received', { outcome: 'dismissed' }, 'proj-1', actor, deps);

      expect(deps.passportFn).toHaveBeenCalledWith(expect.objectContaining({
        underAppeal: false,
        blocksBuilding: false,
        outcome: 'dismissed',
      }));
    });
  });
});
