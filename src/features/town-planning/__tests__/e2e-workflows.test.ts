/**
 * Integration Tests — Full Rezoning Workflow Lifecycle
 *
 * Uses an in-memory mock Firestore to test the complete flow:
 *   Create application → Transition stages → Add conditions → Compliance check
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { FirestoreDB } from '../services/accessControl';
import {
  createApplication,
  getApplication,
  listApplicationsByProject,
  persistApplication,
} from '../services/applicationEngine';
import {
  transitionStage,
  TransitionError,
  getStageHistory,
  getDeadlines,
} from '../services/workflowTracker';
import {
  createCondition,
  updateConditionStatus,
  isConditionsCompliant,
  getConditionsSummary,
  ConditionStatusError,
} from '../services/conditionsRegister';
import { checkPermission, getEffectivePermissions } from '../services/accessControl';
import { checkReadiness, getProgressIndicator } from '../services/sequentialDependency';
import type { LandUseApplication } from '../types';

// ─── In-Memory Mock Firestore ─────────────────────────────────────────────────

function createMockFirestore(): FirestoreDB {
  const store: Record<string, Record<string, Record<string, unknown>>> = {};

  return {
    collection(path: string) {
      if (!store[path]) store[path] = {};
      const coll = store[path];

      return {
        doc(id: string) {
          return {
            async get() {
              const data = coll[id];
              return {
                exists: !!data,
                data: () => data ? { ...data } : undefined,
              };
            },
            async set(data: Record<string, unknown>) {
              coll[id] = { ...data };
            },
            async update(data: Record<string, unknown>) {
              if (!coll[id]) throw new Error(`Document ${id} does not exist`);
              coll[id] = { ...coll[id], ...data };
            },
          };
        },
        where(_field: string, _op: string, value: unknown) {
          return {
            async get() {
              const docs = Object.entries(coll)
                .filter(([, data]) => data[_field] === value)
                .map(([id, data]) => ({
                  id,
                  data: () => ({ ...data }),
                }));
              return { docs };
            },
          };
        },
        async add(data: Record<string, unknown>) {
          const id = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          coll[id] = { ...data };
          return { id };
        },
      };
    },
  };
}

// ─── Test Data ────────────────────────────────────────────────────────────────

const VALID_REZONING_PARAMS = {
  projectId: 'proj_001',
  applicationType: 'rezoning' as const,
  municipality: 'City of Cape Town',
  erfNumber: '12345',
  townshipName: 'Muizenberg',
  province: 'Western Cape',
  applicantId: 'user_tp_001',
  ownerId: 'user_owner_001',
  townPlannerId: 'user_tp_001',
  description: 'Rezoning from residential to mixed-use for a small retail development',
  currentZoning: 'Single Residential 1',
  proposedZoning: 'General Business 1',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Town Planning E2E Workflow', () => {
  let db: FirestoreDB;

  beforeEach(() => {
    db = createMockFirestore();
  });

  describe('Application Creation', () => {
    it('creates a valid rezoning application', () => {
      const app = createApplication(VALID_REZONING_PARAMS, 1);

      expect(app.id).toBeDefined();
      expect(app.referenceNumber).toMatch(/^TP-RZ-\d{4}-0001$/);
      expect(app.currentStage).toBe('preparation');
      expect(app.applicationType).toBe('rezoning');
      expect(app.stageHistory).toHaveLength(1);
      expect(app.stageHistory[0].stage).toBe('preparation');
    });

    it('rejects rezoning without currentZoning', () => {
      const params = { ...VALID_REZONING_PARAMS, currentZoning: undefined };
      expect(() => createApplication(params, 1)).toThrow();
    });

    it('rejects invalid input (missing required fields)', () => {
      expect(() => createApplication({}, 1)).toThrow();
    });

    it('persists and retrieves application from Firestore', async () => {
      const app = createApplication(VALID_REZONING_PARAMS, 1);
      await persistApplication(db, app);

      const retrieved = await getApplication(db, app.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.referenceNumber).toBe(app.referenceNumber);
    });

    it('lists applications by project', async () => {
      const app1 = createApplication(VALID_REZONING_PARAMS, 1);
      const app2 = createApplication(
        { ...VALID_REZONING_PARAMS, applicationType: 'consent_use', proposedLandUse: 'Retail' },
        2,
      );
      await persistApplication(db, app1);
      await persistApplication(db, app2);

      const list = await listApplicationsByProject(db, 'proj_001');
      expect(list).toHaveLength(2);
    });
  });

  describe('Stage Transitions', () => {
    let app: LandUseApplication;

    beforeEach(() => {
      app = createApplication(VALID_REZONING_PARAMS, 1);
    });

    it('transitions preparation → submission', () => {
      const updated = transitionStage(app, 'submission', 'user_tp_001');
      expect(updated.currentStage).toBe('submission');
      expect(updated.stageHistory).toHaveLength(2);
    });

    it('follows the full happy path', () => {
      let current = app;
      const stages: Array<import('../types').ApplicationStage> = [
        'submission',
        'acknowledgement',
        'circulation',
        'advertising',
        'comment_period',
        'hearing',
        'decision',
        'conditions_compliance',
      ];

      for (const stage of stages) {
        current = transitionStage(current, stage, 'user_tp_001');
        expect(current.currentStage).toBe(stage);
      }

      expect(current.stageHistory).toHaveLength(9);
    });

    it('allows withdrawal from any stage', () => {
      const afterSubmission = transitionStage(app, 'submission', 'user_tp_001');
      const withdrawn = transitionStage(afterSubmission, 'withdrawn', 'user_tp_001');
      expect(withdrawn.currentStage).toBe('withdrawn');
    });

    it('rejects invalid transitions', () => {
      // preparation → decision is not allowed
      expect(() => transitionStage(app, 'decision', 'user_tp_001')).toThrow(TransitionError);
    });

    it('rejects transitions from withdrawn', () => {
      const withdrawn = transitionStage(app, 'withdrawn', 'user_tp_001');
      expect(() => transitionStage(withdrawn, 'submission', 'user_tp_001')).toThrow(TransitionError);
    });

    it('records stage history correctly', () => {
      const updated = transitionStage(app, 'submission', 'user_tp_001', 'Submitted by town planner');
      const history = getStageHistory(updated);

      expect(history[0].stage).toBe('preparation');
      expect(history[0].exitedAt).toBeDefined();
      expect(history[1].stage).toBe('submission');
      expect(history[1].notes).toBe('Submitted by town planner');
    });

    it('calculates deadlines for current stage', () => {
      const submitted = transitionStage(app, 'submission', 'user_tp_001');
      const acknowledged = transitionStage(submitted, 'acknowledgement', 'user_tp_001');

      const deadlines = getDeadlines(acknowledged);
      expect(deadlines.length).toBeGreaterThan(0);
      expect(deadlines[0].stage).toBe('acknowledgement');
      expect(deadlines[0].workingDays).toBe(14);
    });
  });

  describe('Conditions Register', () => {
    it('creates a condition with outstanding status', () => {
      const condition = createCondition(
        {
          applicationId: 'app_001',
          conditionNumber: 1,
          description: 'Submit amended site plan showing 5m building line setback',
          responsibleParty: 'Applicant',
        },
        'user_admin_001',
      );

      expect(condition.status).toBe('outstanding');
      expect(condition.conditionNumber).toBe(1);
    });

    it('transitions outstanding → in_progress → fulfilled', () => {
      const condition = createCondition(
        {
          applicationId: 'app_001',
          conditionNumber: 1,
          description: 'Submit traffic impact assessment',
          responsibleParty: 'Applicant',
        },
        'user_admin_001',
      );

      const inProgress = updateConditionStatus(condition, 'in_progress', 'user_tp_001');
      expect(inProgress.status).toBe('in_progress');

      const fulfilled = updateConditionStatus(inProgress, 'fulfilled', 'user_tp_001', {
        evidence: ['doc_traffic_study.pdf'],
      });
      expect(fulfilled.status).toBe('fulfilled');
      expect(fulfilled.fulfilledDate).toBeDefined();
      expect(fulfilled.evidence).toContain('doc_traffic_study.pdf');
    });

    it('allows waiver from in_progress', () => {
      const condition = createCondition(
        {
          applicationId: 'app_001',
          conditionNumber: 2,
          description: 'Provide heritage impact assessment',
          responsibleParty: 'Applicant',
        },
        'user_admin_001',
      );

      const inProgress = updateConditionStatus(condition, 'in_progress', 'user_tp_001');
      const waived = updateConditionStatus(inProgress, 'waived', 'user_admin_001', {
        waiverReason: 'Property not within heritage overlay zone',
      });

      expect(waived.status).toBe('waived');
      expect(waived.waivedBy).toBe('user_admin_001');
      expect(waived.waiverReason).toBe('Property not within heritage overlay zone');
    });

    it('rejects reverse transitions (fulfilled → in_progress)', () => {
      const condition = createCondition(
        {
          applicationId: 'app_001',
          conditionNumber: 1,
          description: 'Submit plans',
          responsibleParty: 'Applicant',
        },
        'user_admin_001',
      );

      const inProgress = updateConditionStatus(condition, 'in_progress', 'user_tp_001');
      const fulfilled = updateConditionStatus(inProgress, 'fulfilled', 'user_tp_001');

      expect(() => updateConditionStatus(fulfilled, 'in_progress', 'user_tp_001')).toThrow(
        ConditionStatusError,
      );
    });

    it('rejects skipping steps (outstanding → fulfilled)', () => {
      const condition = createCondition(
        {
          applicationId: 'app_001',
          conditionNumber: 1,
          description: 'Submit plans',
          responsibleParty: 'Applicant',
        },
        'user_admin_001',
      );

      expect(() => updateConditionStatus(condition, 'fulfilled', 'user_tp_001')).toThrow(
        ConditionStatusError,
      );
    });

    it('checks compliance correctly', () => {
      const c1 = createCondition(
        { applicationId: 'app_001', conditionNumber: 1, description: 'Condition A', responsibleParty: 'Applicant' },
        'admin',
      );
      const c2 = createCondition(
        { applicationId: 'app_001', conditionNumber: 2, description: 'Condition B', responsibleParty: 'Applicant' },
        'admin',
      );

      // Not compliant yet
      expect(isConditionsCompliant([c1, c2])).toBe(false);

      // Move both to fulfilled/waived
      const c1Done = updateConditionStatus(
        updateConditionStatus(c1, 'in_progress', 'tp'),
        'fulfilled',
        'tp',
      );
      const c2Waived = updateConditionStatus(
        updateConditionStatus(c2, 'in_progress', 'tp'),
        'waived',
        'admin',
        { waiverReason: 'Not applicable' },
      );

      expect(isConditionsCompliant([c1Done, c2Waived])).toBe(true);
    });

    it('generates correct summary', () => {
      const conditions = [
        { ...createCondition({ applicationId: 'a', conditionNumber: 1, description: 'C1', responsibleParty: 'X' }, 'u'), status: 'outstanding' as const },
        { ...createCondition({ applicationId: 'a', conditionNumber: 2, description: 'C2', responsibleParty: 'X' }, 'u'), status: 'in_progress' as const },
        { ...createCondition({ applicationId: 'a', conditionNumber: 3, description: 'C3', responsibleParty: 'X' }, 'u'), status: 'fulfilled' as const },
        { ...createCondition({ applicationId: 'a', conditionNumber: 4, description: 'C4', responsibleParty: 'X' }, 'u'), status: 'waived' as const },
      ];

      const summary = getConditionsSummary(conditions);
      expect(summary.total).toBe(4);
      expect(summary.outstanding).toBe(1);
      expect(summary.inProgress).toBe(1);
      expect(summary.fulfilled).toBe(1);
      expect(summary.waived).toBe(1);
      expect(summary.compliancePercentage).toBe(50);
    });
  });

  describe('Access Control', () => {
    it('town_planner can create applications', () => {
      const result = checkPermission('town_planner', 'create_application');
      expect(result.allowed).toBe(true);
    });

    it('client cannot create applications', () => {
      const result = checkPermission('client', 'create_application');
      expect(result.allowed).toBe(false);
    });

    it('admin has all permissions', () => {
      const perms = getEffectivePermissions('admin');
      expect(perms.create_application).toBe(true);
      expect(perms.delete_application).toBe(true);
      expect(perms.decide_application).toBe(true);
    });

    it('supplier has no town planning permissions', () => {
      const perms = getEffectivePermissions('supplier');
      const hasAny = Object.values(perms).some(Boolean);
      expect(hasAny).toBe(false);
    });
  });

  describe('Sequential Dependency', () => {
    it('SPLUMA is always ready (no prerequisite)', () => {
      const result = checkReadiness('spluma', null, null);
      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('SDP is blocked when SPLUMA not started', () => {
      const result = checkReadiness('sdp', null, null);
      expect(result.ready).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
    });

    it('SDP is ready when SPLUMA is approved', () => {
      const app = createApplication(VALID_REZONING_PARAMS, 1);
      const approved: LandUseApplication = {
        ...app,
        decision: 'approved',
        currentStage: 'conditions_compliance',
      };

      const result = checkReadiness('sdp', approved, null);
      expect(result.ready).toBe(true);
    });

    it('building_plan is blocked when SDP not complete', () => {
      const app = createApplication(VALID_REZONING_PARAMS, 1);
      const approved: LandUseApplication = {
        ...app,
        decision: 'approved',
        currentStage: 'conditions_compliance',
      };

      const result = checkReadiness('building_plan', approved, null);
      expect(result.ready).toBe(false);
    });

    it('progress indicator shows correct overall state', () => {
      const progress = getProgressIndicator(null, null, false);
      expect(progress.overallProgress).toBe(0);
      expect(progress.currentPhase).toBe('spluma');
      expect(progress.phases).toHaveLength(3);
    });

    it('allows override via not_applicable marking', () => {
      const overrides = new Map<import('../services/sequentialDependency').PlanningPhase, import('../services/sequentialDependency').PhaseStatus>();
      overrides.set('spluma', 'not_applicable');

      const result = checkReadiness('sdp', null, null, overrides);
      expect(result.ready).toBe(true);
    });
  });

  describe('Full Rezoning Lifecycle (Integration)', () => {
    it('completes a full rezoning from creation to conditions compliance', async () => {
      // 1. Create application
      const app = createApplication(VALID_REZONING_PARAMS, 1);
      await persistApplication(db, app);

      // 2. Progress through stages
      let current = app;
      const stages: Array<import('../types').ApplicationStage> = [
        'submission',
        'acknowledgement',
        'circulation',
        'advertising',
        'comment_period',
        'decision',
        'conditions_compliance',
      ];

      for (const stage of stages) {
        current = transitionStage(current, stage, 'user_tp_001');
      }

      expect(current.currentStage).toBe('conditions_compliance');

      // 3. Add conditions
      const cond1 = createCondition(
        {
          applicationId: current.id,
          conditionNumber: 1,
          description: 'Submit amended site plan',
          responsibleParty: 'Applicant',
        },
        'user_admin_001',
      );

      const cond2 = createCondition(
        {
          applicationId: current.id,
          conditionNumber: 2,
          description: 'Pay development contributions',
          responsibleParty: 'Applicant',
          dueDate: '2025-06-30',
        },
        'user_admin_001',
      );

      // 4. Fulfill conditions
      const c1Progress = updateConditionStatus(cond1, 'in_progress', 'user_tp_001');
      const c1Done = updateConditionStatus(c1Progress, 'fulfilled', 'user_tp_001', {
        evidence: ['amended_site_plan.pdf'],
      });

      const c2Progress = updateConditionStatus(cond2, 'in_progress', 'user_tp_001');
      const c2Done = updateConditionStatus(c2Progress, 'fulfilled', 'user_tp_001', {
        evidence: ['payment_receipt.pdf'],
      });

      // 5. Check compliance
      expect(isConditionsCompliant([c1Done, c2Done])).toBe(true);

      const summary = getConditionsSummary([c1Done, c2Done]);
      expect(summary.compliancePercentage).toBe(100);

      // 6. Verify sequential dependency now allows SDP
      const approvedApp: LandUseApplication = {
        ...current,
        decision: 'approved_with_conditions',
      };
      const readiness = checkReadiness('sdp', approvedApp, null);
      expect(readiness.ready).toBe(true);
    });
  });
});
