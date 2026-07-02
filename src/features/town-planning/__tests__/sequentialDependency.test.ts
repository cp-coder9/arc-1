/**
 * Unit Tests for Sequential Dependency Service
 *
 * Tests readiness determination for each state combination,
 * bypass logic, and progress indicator.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  checkReadiness,
  markPlanningNotApplicable,
  getProgressIndicator,
  markPlanningPhaseComplete,
  type DependencyActor,
  type DependencyDeps,
} from '../services/sequentialDependency';
import type { FirestoreDB } from '../services/municipalityConfig';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(overrides?: {
  apps?: Record<string, unknown>[];
  conditions?: Record<string, unknown>[];
  sdps?: Record<string, unknown>[];
  bypass?: boolean;
  hasPropertyRegister?: boolean;
}): FirestoreDB {
  const appsDocs = (overrides?.apps ?? []).map((d, i) => ({
    exists: true,
    id: d.id as string ?? `app-${i}`,
    data: () => d,
  }));

  const condDocs = (overrides?.conditions ?? []).map((d, i) => ({
    exists: true,
    id: `cond-${i}`,
    data: () => d,
  }));

  const sdpDocs = (overrides?.sdps ?? []).map((d, i) => ({
    exists: true,
    id: `sdp-${i}`,
    data: () => d,
  }));

  const bypassDocs = overrides?.bypass
    ? [{ exists: true, id: 'bypass-1', data: () => ({ bypassed: true, motivation: 'Existing rights' }) }]
    : [];

  const propertyDocs = overrides?.hasPropertyRegister
    ? [{ exists: true, id: 'prop-1', data: () => ({ erfNumber: '123' }) }]
    : [];

  return {
    collection: vi.fn().mockImplementation((path: string) => {
      if (path.includes('/bypass')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-bypass' }),
          get: vi.fn().mockResolvedValue({ docs: bypassDocs, empty: bypassDocs.length === 0 }),
        };
      }
      if (path.includes('/applications') && !path.includes('/conditions')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-app' }),
          get: vi.fn().mockResolvedValue({ docs: appsDocs, empty: appsDocs.length === 0 }),
        };
      }
      if (path.includes('/conditions')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-cond' }),
          get: vi.fn().mockResolvedValue({ docs: condDocs, empty: condDocs.length === 0 }),
        };
      }
      if (path.includes('/sdps')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-sdp' }),
          get: vi.fn().mockResolvedValue({ docs: sdpDocs, empty: sdpDocs.length === 0 }),
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

const actor: DependencyActor = { id: 'user-1', role: 'town_planner' };

function createDeps(db: FirestoreDB): DependencyDeps {
  return {
    db,
    auditFn: vi.fn().mockResolvedValue(undefined),
    passportFn: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Sequential Dependency', () => {
  describe('checkReadiness', () => {
    it('returns ready=true when all prerequisites met', async () => {
      const db = createMockDb({
        apps: [{ id: 'app-1', decisionOutcome: 'approved', stage: 'decision' }],
        conditions: [{ status: 'fulfilled' }, { status: 'waived' }],
        sdps: [{ stage: 'approved' }],
      });

      const result = await checkReadiness('proj-1', db);

      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
      expect(result.status.overall).toBe('ready');
    });

    it('returns ready=false when no application exists', async () => {
      const db = createMockDb({ apps: [], sdps: [] });

      const result = await checkReadiness('proj-1', db);

      expect(result.ready).toBe(false);
      expect(result.blockers.some(b => b.includes('SPLUMA'))).toBe(true);
    });

    it('returns ready=false when SPLUMA not approved', async () => {
      const db = createMockDb({
        apps: [{ id: 'app-1', stage: 'circulation' }],
        sdps: [{ stage: 'approved' }],
      });

      const result = await checkReadiness('proj-1', db);

      expect(result.ready).toBe(false);
      expect(result.status.spluma).toBe('in_progress');
    });

    it('returns ready=false when conditions not compliant', async () => {
      const db = createMockDb({
        apps: [{ id: 'app-1', decisionOutcome: 'approved', stage: 'decision' }],
        conditions: [{ status: 'fulfilled' }, { status: 'outstanding' }],
        sdps: [{ stage: 'approved' }],
      });

      const result = await checkReadiness('proj-1', db);

      expect(result.ready).toBe(false);
      expect(result.blockers.some(b => b.includes('condition'))).toBe(true);
    });

    it('returns ready=false when SDP not approved', async () => {
      const db = createMockDb({
        apps: [{ id: 'app-1', decisionOutcome: 'approved', stage: 'decision' }],
        conditions: [{ status: 'fulfilled' }],
        sdps: [{ stage: 'submitted' }],
      });

      const result = await checkReadiness('proj-1', db);

      expect(result.ready).toBe(false);
      expect(result.blockers.some(b => b.includes('Site Development Plan'))).toBe(true);
    });

    it('returns ready=true when bypassed', async () => {
      const db = createMockDb({ bypass: true });

      const result = await checkReadiness('proj-1', db);

      expect(result.ready).toBe(true);
      expect(result.status.overall).toBe('bypassed');
    });

    it('treats no conditions as compliant', async () => {
      const db = createMockDb({
        apps: [{ id: 'app-1', decisionOutcome: 'approved', stage: 'decision' }],
        conditions: [],
        sdps: [{ stage: 'approved' }],
      });

      const result = await checkReadiness('proj-1', db);

      expect(result.ready).toBe(true);
      expect(result.status.conditions).toBe('compliant');
    });
  });

  describe('markPlanningNotApplicable', () => {
    it('succeeds with motivation and property register', async () => {
      const db = createMockDb({ hasPropertyRegister: true });
      const deps = createDeps(db);

      const result = await markPlanningNotApplicable('proj-1', 'Within existing rights', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bypassed).toBe(true);
      }
    });

    it('fails without motivation', async () => {
      const db = createMockDb({ hasPropertyRegister: true });
      const deps = createDeps(db);

      const result = await markPlanningNotApplicable('proj-1', '', actor, deps);

      expect(result.success).toBe(false);
    });

    it('fails without property register', async () => {
      const db = createMockDb({ hasPropertyRegister: false });
      const deps = createDeps(db);

      const result = await markPlanningNotApplicable('proj-1', 'Existing rights', actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Property register');
      }
    });

    it('updates passport on bypass', async () => {
      const db = createMockDb({ hasPropertyRegister: true });
      const deps = createDeps(db);

      await markPlanningNotApplicable('proj-1', 'Within existing rights', actor, deps);

      expect(deps.passportFn).toHaveBeenCalledWith(expect.objectContaining({
        planningPhaseComplete: true,
        bypassed: true,
      }));
    });
  });

  describe('getProgressIndicator', () => {
    it('returns 100% across the board when all complete', async () => {
      const db = createMockDb({
        apps: [{ id: 'app-1', decisionOutcome: 'approved', stage: 'decision' }],
        conditions: [{ status: 'fulfilled' }],
        sdps: [{ stage: 'approved' }],
      });

      const result = await getProgressIndicator('proj-1', db);

      expect(result.splumaPercent).toBe(100);
      expect(result.conditionsPercent).toBe(100);
      expect(result.sdpPercent).toBe(100);
      expect(result.overallReadiness).toBe(true);
    });

    it('returns partial progress when in progress', async () => {
      const db = createMockDb({
        apps: [{ id: 'app-1', stage: 'circulation' }],
        conditions: [{ status: 'fulfilled' }, { status: 'outstanding' }],
        sdps: [{ stage: 'submitted' }],
      });

      const result = await getProgressIndicator('proj-1', db);

      expect(result.splumaPercent).toBe(50);
      expect(result.conditionsPercent).toBe(50);
      expect(result.sdpPercent).toBe(50);
      expect(result.overallReadiness).toBe(false);
    });

    it('returns bypassed=true and 100% when bypassed', async () => {
      const db = createMockDb({ bypass: true });

      const result = await getProgressIndicator('proj-1', db);

      expect(result.bypassed).toBe(true);
      expect(result.overallReadiness).toBe(true);
    });
  });

  describe('markPlanningPhaseComplete', () => {
    it('succeeds when all prerequisites met', async () => {
      const db = createMockDb({
        apps: [{ id: 'app-1', decisionOutcome: 'approved', stage: 'decision' }],
        conditions: [{ status: 'fulfilled' }],
        sdps: [{ stage: 'approved' }],
      });
      const deps = createDeps(db);

      const result = await markPlanningPhaseComplete('proj-1', actor, deps);

      expect(result.success).toBe(true);
      expect(deps.passportFn).toHaveBeenCalledWith(expect.objectContaining({
        planningPhaseComplete: true,
      }));
    });

    it('fails when prerequisites not met', async () => {
      const db = createMockDb({
        apps: [{ id: 'app-1', stage: 'circulation' }],
        sdps: [],
      });
      const deps = createDeps(db);

      const result = await markPlanningPhaseComplete('proj-1', actor, deps);

      expect(result.success).toBe(false);
    });
  });
});
