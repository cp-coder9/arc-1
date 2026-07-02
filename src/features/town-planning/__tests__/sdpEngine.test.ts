/**
 * Unit Tests for SDP Engine Service
 *
 * Tests checklist generation, stage transitions, prerequisite blocking,
 * and decision handling.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  initiateSDP,
  updateChecklistItem,
  transitionSDPStage,
  validatePrerequisites,
  SDP_STAGE_TRANSITIONS,
  CHECKLIST_ITEM_TRANSITIONS,
  type SDPActor,
  type SDPDeps,
  type SDPAuditFn,
} from '../services/sdpEngine';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { SDPStage } from '../types';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(overrides?: {
  municipalityExtras?: string[];
  sdpData?: Record<string, unknown>;
  appsData?: Record<string, unknown>[];
  conditionsData?: Record<string, unknown>[];
}): FirestoreDB {
  const muniDoc = {
    exists: true,
    id: 'muni-1',
    data: () => ({
      additionalSDPComponents: overrides?.municipalityExtras ?? [],
    }),
  };

  const sdpDoc = overrides?.sdpData
    ? { exists: true, id: 'sdp-1', data: () => overrides.sdpData }
    : { exists: false, id: 'sdp-1', data: () => undefined };

  const appsDocs = (overrides?.appsData ?? []).map((d, i) => ({
    exists: true,
    id: d.id as string ?? `app-${i}`,
    data: () => d,
  }));

  const condDocs = (overrides?.conditionsData ?? []).map((d, i) => ({
    exists: true,
    id: `cond-${i}`,
    data: () => d,
  }));

  return {
    collection: vi.fn().mockImplementation((path: string) => {
      if (path === 'municipalityProfiles') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(muniDoc),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-sdp' }),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
        };
      }
      if (path.includes('/sdps')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(sdpDoc),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-sdp' }),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
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
      if (path.includes('/applications')) {
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

const actor: SDPActor = { id: 'user-1', role: 'town_planner' };

function createDeps(db: FirestoreDB): SDPDeps {
  return {
    db,
    auditFn: vi.fn().mockResolvedValue(undefined),
    passportFn: vi.fn().mockResolvedValue(undefined),
    readinessFn: vi.fn().mockResolvedValue(undefined),
    actionCentreFn: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SDP Engine', () => {
  describe('initiateSDP', () => {
    it('creates SDP with 5 standard checklist items', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      const result = await initiateSDP('proj-1', 'muni-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stage).toBe('preparation');
        expect(result.data.checklist.length).toBe(5);
        expect(result.data.checklist.map(i => i.category)).toContain('site_layout');
        expect(result.data.checklist.map(i => i.category)).toContain('engineering');
        expect(result.data.checklist.map(i => i.category)).toContain('landscaping');
        expect(result.data.checklist.map(i => i.category)).toContain('stormwater');
        expect(result.data.checklist.map(i => i.category)).toContain('parking');
      }
    });

    it('includes municipality-specific extras in checklist', async () => {
      const db = createMockDb({ municipalityExtras: ['Heritage Impact', 'Traffic Study'] });
      const deps = createDeps(db);

      const result = await initiateSDP('proj-1', 'muni-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.checklist.length).toBe(7); // 5 standard + 2 extras
        const muniItems = result.data.checklist.filter(i => i.category === 'municipality_specific');
        expect(muniItems.length).toBe(2);
        expect(muniItems[0].name).toBe('Heritage Impact');
        expect(muniItems[1].name).toBe('Traffic Study');
      }
    });

    it('fails with empty projectId', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      const result = await initiateSDP('', 'muni-1', actor, deps);
      expect(result.success).toBe(false);
    });

    it('fails with empty municipalityId', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      const result = await initiateSDP('proj-1', '', actor, deps);
      expect(result.success).toBe(false);
    });

    it('creates audit record on initiation', async () => {
      const db = createMockDb();
      const deps = createDeps(db);

      await initiateSDP('proj-1', 'muni-1', actor, deps);

      expect(deps.auditFn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sdp_initiated', actorId: 'user-1' })
      );
    });
  });

  describe('updateChecklistItem', () => {
    it('transitions from not_started to in_progress', async () => {
      const db = createMockDb({
        sdpData: {
          stage: 'preparation',
          checklist: [{ id: 'std-1', name: 'Site Layout', status: 'not_started', linkedDocumentIds: [], isRequired: true, category: 'site_layout' }],
          projectId: 'proj-1',
          createdBy: 'user-1',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await updateChecklistItem('sdp-1', 'std-1', { status: 'in_progress' }, 'proj-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.checklist[0].status).toBe('in_progress');
      }
    });

    it('rejects complete without linked document', async () => {
      const db = createMockDb({
        sdpData: {
          stage: 'preparation',
          checklist: [{ id: 'std-1', name: 'Site Layout', status: 'in_progress', linkedDocumentIds: [], isRequired: true, category: 'site_layout' }],
          projectId: 'proj-1',
          createdBy: 'user-1',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await updateChecklistItem('sdp-1', 'std-1', { status: 'complete' }, 'proj-1', actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('linked drawing or document');
      }
    });

    it('allows complete with linked document', async () => {
      const db = createMockDb({
        sdpData: {
          stage: 'preparation',
          checklist: [{ id: 'std-1', name: 'Site Layout', status: 'in_progress', linkedDocumentIds: [], isRequired: true, category: 'site_layout' }],
          projectId: 'proj-1',
          createdBy: 'user-1',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await updateChecklistItem('sdp-1', 'std-1', { status: 'complete', linkedDocumentIds: ['doc-1'] }, 'proj-1', actor, deps);

      expect(result.success).toBe(true);
    });

    it('rejects reverse transition complete → not_started', async () => {
      const db = createMockDb({
        sdpData: {
          stage: 'preparation',
          checklist: [{ id: 'std-1', name: 'Site Layout', status: 'complete', linkedDocumentIds: ['doc-1'], isRequired: true, category: 'site_layout' }],
          projectId: 'proj-1',
          createdBy: 'user-1',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      });
      const deps = createDeps(db);

      const result = await updateChecklistItem('sdp-1', 'std-1', { status: 'not_started' as any }, 'proj-1', actor, deps);

      expect(result.success).toBe(false);
    });
  });

  describe('transitionSDPStage', () => {
    it('transitions preparation → submitted when prerequisites met', async () => {
      const db = createMockDb({
        sdpData: { stage: 'preparation', projectId: 'proj-1', checklist: [], createdBy: 'user-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
        appsData: [{ id: 'app-1', decisionOutcome: 'approved', stage: 'decision' }],
        conditionsData: [{ status: 'fulfilled' }],
      });
      const deps = createDeps(db);

      const result = await transitionSDPStage('sdp-1', 'submitted', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stage).toBe('submitted');
      }
    });

    it('blocks submission when SPLUMA not approved', async () => {
      const db = createMockDb({
        sdpData: { stage: 'preparation', projectId: 'proj-1', checklist: [], createdBy: 'user-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
        appsData: [{ id: 'app-1', stage: 'consideration' }],
      });
      const deps = createDeps(db);

      const result = await transitionSDPStage('sdp-1', 'submitted', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('SPLUMA');
      }
    });

    it('blocks submission when conditions not compliant', async () => {
      const db = createMockDb({
        sdpData: { stage: 'preparation', projectId: 'proj-1', checklist: [], createdBy: 'user-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
        appsData: [{ id: 'app-1', decisionOutcome: 'approved', stage: 'decision' }],
        conditionsData: [{ status: 'outstanding' }],
      });
      const deps = createDeps(db);

      const result = await transitionSDPStage('sdp-1', 'submitted', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('conditions');
      }
    });

    it('rejects invalid transitions', async () => {
      const db = createMockDb({
        sdpData: { stage: 'preparation', projectId: 'proj-1', checklist: [], createdBy: 'user-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      });
      const deps = createDeps(db);

      const result = await transitionSDPStage('sdp-1', 'approved', {}, 'proj-1', actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid SDP stage transition');
      }
    });

    it('fires passport and readiness on approval', async () => {
      const db = createMockDb({
        sdpData: { stage: 'under_review', projectId: 'proj-1', checklist: [], createdBy: 'user-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      });
      const deps = createDeps(db);

      await transitionSDPStage('sdp-1', 'approved', { notes: 'Approved' }, 'proj-1', actor, deps);

      expect(deps.passportFn).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
      expect(deps.readinessFn).toHaveBeenCalledWith(expect.objectContaining({ sdpApproved: true }));
    });

    it('fires action centre alert on rejection', async () => {
      const db = createMockDb({
        sdpData: { stage: 'under_review', projectId: 'proj-1', checklist: [], createdBy: 'user-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      });
      const deps = createDeps(db);

      await transitionSDPStage('sdp-1', 'rejected', { notes: 'Non-compliant' }, 'proj-1', actor, deps);

      expect(deps.actionCentreFn).toHaveBeenCalledWith(expect.objectContaining({ alertType: 'sdp_rejected' }));
    });

    it('allows rejected → preparation (resubmit)', async () => {
      const db = createMockDb({
        sdpData: { stage: 'rejected', projectId: 'proj-1', checklist: [], createdBy: 'user-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      });
      const deps = createDeps(db);

      const result = await transitionSDPStage('sdp-1', 'preparation', {}, 'proj-1', actor, deps);
      expect(result.success).toBe(true);
    });
  });

  describe('validatePrerequisites', () => {
    it('returns canSubmit=true when SPLUMA approved and conditions compliant', async () => {
      const db = createMockDb({
        appsData: [{ id: 'app-1', decisionOutcome: 'approved', stage: 'decision' }],
        conditionsData: [{ status: 'fulfilled' }, { status: 'waived' }],
      });

      const result = await validatePrerequisites('sdp-1', 'proj-1', db);

      expect(result.canSubmit).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('returns canSubmit=false with blockers when SPLUMA not approved', async () => {
      const db = createMockDb({
        appsData: [{ id: 'app-1', stage: 'circulation' }],
      });

      const result = await validatePrerequisites('sdp-1', 'proj-1', db);

      expect(result.canSubmit).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
    });
  });
});
