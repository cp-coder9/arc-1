/**
 * Unit tests for projectLifecycleEngine (Pack 2)
 * Tests phase evaluation, blocker identification, advance gating.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateLifecycle,
  evaluatePhaseReadiness,
  identifyBlockers,
  canAdvance,
  produceNextBestActions,
  hasUsableRecord,
  definitionForPhase,
  buildLifecycleState,
  recommendLifecycleActions,
  PHASE_DEFINITIONS,
} from '../masterExpansion/projectLifecycleEngine';
import type { ProjectMetadata, ProjectRecord, ProjectPhase } from '@/types/architexMasterTypes';

function makeRecord(
  overrides: Partial<ProjectRecord> & { id: string },
): ProjectRecord {
  return {
    tenantId: 't1',
    projectId: 'p1',
    phase: 'construction_execution',
    moduleKey: 'site_execution',
    recordType: 'site_diary',
    title: 'Test Record',
    status: 'draft',
    payload: {},
    approval: {
      status: 'draft',
      requiredApproverRoles: [],
    },
    audit: {
      createdByUserId: 'u1',
      createdAt: '2026-06-09T00:00:00Z',
      source: 'user',
    },
    linkedRecordIds: [],
    ...overrides,
  };
}

const metadata: ProjectMetadata = {
  tenantId: 't1',
  projectId: 'p1',
  projectName: 'Test Project',
  clientName: 'Test Client',
  municipality: 'City of Cape Town',
  propertyReference: 'Erf 5678',
  propertyUse: 'Commercial',
  landUseNotes: 'Standard zoning',
  currentPhase: 'construction_execution',
  leadProfessionalRole: 'architect',
};

describe('PHASE_DEFINITIONS', () => {
  it('covers all 11 production phases', () => {
    const phases = PHASE_DEFINITIONS.map((d) => d.phase);
    expect(phases).toContain('lead_enquiry');
    expect(phases).toContain('brief_feasibility');
    expect(phases).toContain('proposal_appointment');
    expect(phases).toContain('design_coordination');
    expect(phases).toContain('municipal_submission');
    expect(phases).toContain('tender_procurement');
    expect(phases).toContain('construction_execution');
    expect(phases).toContain('payments_commercial_control');
    expect(phases).toContain('closeout');
    expect(phases).toContain('defects_liability');
    expect(phases).toContain('operations_post_occupancy');
    expect(PHASE_DEFINITIONS).toHaveLength(11);
  });

  it('each definition has required, optional, and handoff fields', () => {
    for (const def of PHASE_DEFINITIONS) {
      expect(def.phase).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(Array.isArray(def.requiredRecordTypes)).toBe(true);
      expect(Array.isArray(def.optionalRecordTypes)).toBe(true);
      expect(def.handoffRule).toBeTruthy();
    }
  });
});

describe('definitionForPhase', () => {
  it('returns definition for valid phase', () => {
    const def = definitionForPhase('closeout');
    expect(def.phase).toBe('closeout');
    expect(def.label).toBe('Closeout');
  });

  it('throws for invalid phase', () => {
    expect(() => definitionForPhase('invalid' as ProjectPhase)).toThrow(
      'No lifecycle definition for phase',
    );
  });
});

describe('hasUsableRecord', () => {
  it('returns true when approved or issued record exists', () => {
    const records = [
      makeRecord({ id: 'r1', recordType: 'snag', approval: { status: 'approved', requiredApproverRoles: [] } }),
    ];
    expect(hasUsableRecord(records, 'snag')).toBe(true);
  });

  it('returns false for draft or pending records', () => {
    const records = [
      makeRecord({ id: 'r1', recordType: 'snag', approval: { status: 'draft', requiredApproverRoles: [] } }),
    ];
    expect(hasUsableRecord(records, 'snag')).toBe(false);
  });

  it('returns false when record type not present', () => {
    expect(hasUsableRecord([], 'snag')).toBe(false);
  });
});

describe('evaluateLifecycle', () => {
  it('evaluates construction_execution phase with missing records', () => {
    const records: ProjectRecord[] = [];
    const result = evaluateLifecycle(metadata, records);

    expect(result.phase).toBe('construction_execution');
    expect(result.missingRecords.length).toBeGreaterThan(0);
    expect(result.mayAdvance).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.nextBestActions.length).toBeGreaterThan(0);
  });

  it('reports mayAdvance=true when all required records present', () => {
    const records = [
      makeRecord({ id: 'r1', recordType: 'drawing_revision', approval: { status: 'approved', requiredApproverRoles: [] } }),
      makeRecord({ id: 'r2', recordType: 'document', approval: { status: 'approved', requiredApproverRoles: [] } }),
    ];
    const result = evaluateLifecycle(
      { ...metadata, currentPhase: 'design_coordination' },
      records,
    );
    expect(result.mayAdvance).toBe(true);
  });

  it('lead_enquiry has no required records', () => {
    const result = evaluateLifecycle(
      { ...metadata, currentPhase: 'lead_enquiry' },
      [],
    );
    expect(result.requiredRecordTypes).toEqual([]);
    expect(result.mayAdvance).toBe(true);
  });

  it('closeout requires closeout_item and drawing_revision', () => {
    const result = evaluateLifecycle(
      { ...metadata, currentPhase: 'closeout' },
      [],
    );
    expect(result.requiredRecordTypes).toContain('closeout_item');
    expect(result.requiredRecordTypes).toContain('drawing_revision');
  });
});

describe('evaluatePhaseReadiness', () => {
  it('returns ready=true when all required records present', () => {
    const records = [
      makeRecord({ id: 'r1', recordType: 'snag', approval: { status: 'approved', requiredApproverRoles: [] } }),
    ];
    const result = evaluatePhaseReadiness('defects_liability', records);
    expect(result.ready).toBe(true);
  });

  it('returns ready=false when records missing', () => {
    const result = evaluatePhaseReadiness('closeout', []);
    expect(result.ready).toBe(false);
    expect(result.missingRequired).toContain('closeout_item');
  });
});

describe('identifyBlockers', () => {
  it('identifies construction without municipal approval', () => {
    const missingRecords: any[] = [];
    const blockers = identifyBlockers(missingRecords, metadata, []);
    expect(blockers.some((b) => b.includes('municipal approval'))).toBe(true);
  });

  it('identifies unresolved snags in closeout', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'snag',
        phase: 'closeout',
        approval: { status: 'draft', requiredApproverRoles: [] },
      }),
    ];
    const blockers = identifyBlockers(
      [],
      { ...metadata, currentPhase: 'closeout' },
      records,
    );
    expect(blockers.some((b) => b.includes('snag'))).toBe(true);
  });

  it('includes missing record blockers with priority labels', () => {
    const missingRecords = [
      { recordType: 'municipal_submission_item' as any, priority: 'critical' as const, reason: 'Test reason' },
    ];
    const blockers = identifyBlockers(missingRecords, metadata, []);
    expect(blockers.some((b) => b.includes('CRITICAL'))).toBe(true);
  });
});

describe('canAdvance', () => {
  it('allows advance when evaluation permits', () => {
    const evaluation = evaluateLifecycle(
      { ...metadata, currentPhase: 'lead_enquiry' },
      [],
    );
    expect(canAdvance(evaluation).allowed).toBe(true);
  });

  it('blocks advance with critical blockers', () => {
    const records: ProjectRecord[] = [];
    const evaluation = evaluateLifecycle(
      { ...metadata, currentPhase: 'closeout' },
      records,
    );
    const result = canAdvance(evaluation);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('allows admin override with skipApprovalCheck', () => {
    const records: ProjectRecord[] = [];
    const evaluation = evaluateLifecycle(
      { ...metadata, currentPhase: 'closeout' },
      records,
    );
    const result = canAdvance(evaluation, {
      adminOverride: true,
      skipApprovalCheck: true,
    });
    expect(result.allowed).toBe(true);
  });
});

describe('produceNextBestActions', () => {
  it('produces specific actions for each missing record type', () => {
    const actions = produceNextBestActions(
      [{ recordType: 'drawing_revision', priority: 'high', reason: 'Test' }],
      'design_coordination',
    );
    expect(actions[0]).toContain('drawing');
  });

  it('returns the handoff review action when no records missing', () => {
    const actions = produceNextBestActions([], 'lead_enquiry');
    expect(actions[0]).toContain('Review');
  });
});

describe('buildLifecycleState (backward-compatible)', () => {
  it('returns the expected shape', () => {
    const state = buildLifecycleState({
      tenantId: 't1',
      projectId: 'p1',
      currentPhase: 'construction_execution',
      records: [],
    });
    expect(state.tenantId).toBe('t1');
    expect(state.currentPhase).toBe('construction_execution');
    expect(state.requiredRecordTypes).toEqual(['site_diary', 'snag']);
    expect(state.blockers.length).toBeGreaterThan(0);
  });
});

describe('recommendLifecycleActions (backward-compatible)', () => {
  it('produces blocker resolution actions', () => {
    const state = buildLifecycleState({
      tenantId: 't1',
      projectId: 'p1',
      currentPhase: 'construction_execution',
      records: [],
    });
    const actions = recommendLifecycleActions(state);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]).toContain('Resolve blocker');
  });
});
