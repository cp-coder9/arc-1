/**
 * ROD Register Service — Unit Tests
 *
 * Tests for ROD condition compliance tracking: forward-only state transitions,
 * compliance summary calculations, deadline alert evaluation, and evidence
 * recording.
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8
 */

import { describe, expect, it } from 'vitest';

import type { ConditionComplianceState, RODCondition } from '../types';
import {
  calculateConditionCompliance,
  DISCLAIMER_BANNER,
  evaluateConditionAlerts,
  recordEvidence,
  transitionCondition,
} from '../services/rodRegister';
import type { EvidenceRecord } from '../services/rodRegister';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const BASE_ACTOR = { id: 'user-001', displayName: 'John Smith' };

function makeCondition(overrides: Partial<RODCondition> = {}): RODCondition {
  return {
    id: 'rod-001',
    projectId: 'proj-001',
    authorisationId: 'auth-001',
    authorisationType: 'environmental_authorisation',
    conditionNumber: 1,
    conditionText: 'Install silt fencing along watercourse boundary',
    complianceCategory: 'pre_construction',
    responsibleParty: 'Main Contractor',
    complianceDeadline: '2026-08-01',
    verificationMethod: 'inspection',
    state: 'outstanding',
    evidence: [],
    stageHistory: [{ state: 'outstanding', date: '2026-06-01', actor: 'system' }],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const FIXED_DATE = new Date('2026-07-01T10:00:00.000Z');

// ─── transitionCondition ──────────────────────────────────────────────────────

describe('transitionCondition', () => {
  describe('valid forward transitions', () => {
    it('transitions outstanding → in_progress', () => {
      const condition = makeCondition({ state: 'outstanding' });
      const result = transitionCondition(condition, 'in_progress', BASE_ACTOR, FIXED_DATE);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.valid).toBe(true);
      expect(result.data.next.state).toBe('in_progress');
    });

    it('transitions in_progress → evidence_submitted', () => {
      const condition = makeCondition({ state: 'in_progress' });
      const result = transitionCondition(condition, 'evidence_submitted', BASE_ACTOR, FIXED_DATE);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.valid).toBe(true);
      expect(result.data.next.state).toBe('evidence_submitted');
    });

    it('transitions evidence_submitted → verified_compliant', () => {
      const condition = makeCondition({ state: 'evidence_submitted' });
      const result = transitionCondition(condition, 'verified_compliant', BASE_ACTOR, FIXED_DATE);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.valid).toBe(true);
      expect(result.data.next.state).toBe('verified_compliant');
    });

    it('appends to stageHistory on valid transition (audit trail)', () => {
      const condition = makeCondition({ state: 'outstanding' });
      const result = transitionCondition(condition, 'in_progress', BASE_ACTOR, FIXED_DATE);

      expect(result.success).toBe(true);
      if (!result.success) return;
      const history = result.data.next.stageHistory;
      expect(history).toHaveLength(2);
      expect(history[1]).toEqual({
        state: 'in_progress',
        date: '2026-07-01',
        actor: 'user-001',
      });
    });

    it('updates the updatedAt timestamp', () => {
      const condition = makeCondition({ state: 'outstanding' });
      const result = transitionCondition(condition, 'in_progress', BASE_ACTOR, FIXED_DATE);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.next.updatedAt).toBe(FIXED_DATE.toISOString());
    });
  });

  describe('invalid transitions (forward-only enforcement)', () => {
    it('rejects backward transition from in_progress → outstanding', () => {
      const condition = makeCondition({ state: 'in_progress' });
      const result = transitionCondition(condition, 'outstanding', BASE_ACTOR, FIXED_DATE);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.valid).toBe(false);
      expect(result.data.error).toContain('Cannot transition');
    });

    it('rejects skipping states: outstanding → evidence_submitted', () => {
      const condition = makeCondition({ state: 'outstanding' });
      const result = transitionCondition(condition, 'evidence_submitted', BASE_ACTOR, FIXED_DATE);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.valid).toBe(false);
      expect(result.data.error).toContain('Cannot transition');
    });

    it('rejects transition from terminal state verified_compliant', () => {
      const condition = makeCondition({ state: 'verified_compliant' });
      const result = transitionCondition(condition, 'outstanding', BASE_ACTOR, FIXED_DATE);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.valid).toBe(false);
      expect(result.data.error).toContain('terminal state');
    });

    it('rejects same-state transition', () => {
      const condition = makeCondition({ state: 'in_progress' });
      const result = transitionCondition(condition, 'in_progress', BASE_ACTOR, FIXED_DATE);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.valid).toBe(false);
    });
  });

  describe('error handling', () => {
    it('returns error when condition is null/undefined', () => {
      const result = transitionCondition(null as unknown as RODCondition, 'in_progress', BASE_ACTOR);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_CONDITION');
    });

    it('returns error when actor is missing', () => {
      const condition = makeCondition();
      const result = transitionCondition(condition, 'in_progress', { id: '', displayName: '' });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('ACTOR_REQUIRED');
    });
  });
});

// ─── calculateConditionCompliance ─────────────────────────────────────────────

describe('calculateConditionCompliance', () => {
  it('calculates correct totals for a mixed set of conditions', () => {
    const conditions = [
      makeCondition({ id: '1', complianceCategory: 'pre_construction', state: 'verified_compliant' }),
      makeCondition({ id: '2', complianceCategory: 'pre_construction', state: 'in_progress' }),
      makeCondition({ id: '3', complianceCategory: 'construction', state: 'outstanding' }),
      makeCondition({ id: '4', complianceCategory: 'construction', state: 'evidence_submitted' }),
      makeCondition({ id: '5', complianceCategory: 'operational', state: 'verified_compliant' }),
    ];

    const result = calculateConditionCompliance(conditions, FIXED_DATE);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.totalConditions).toBe(5);
    expect(result.data.verifiedCount).toBe(2);
    expect(result.data.outstandingCount).toBe(2); // outstanding + in_progress
    expect(result.data.compliancePercentage).toBe(40); // 2/5 = 40%
  });

  it('counts conditions by category correctly', () => {
    const conditions = [
      makeCondition({ complianceCategory: 'pre_construction' }),
      makeCondition({ complianceCategory: 'pre_construction' }),
      makeCondition({ complianceCategory: 'construction' }),
      makeCondition({ complianceCategory: 'ongoing' }),
    ];

    const result = calculateConditionCompliance(conditions, FIXED_DATE);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.byCategory.pre_construction).toBe(2);
    expect(result.data.byCategory.construction).toBe(1);
    expect(result.data.byCategory.ongoing).toBe(1);
    expect(result.data.byCategory.operational).toBe(0);
  });

  it('counts overdue conditions correctly', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const conditions = [
      makeCondition({ id: '1', state: 'outstanding', complianceDeadline: '2026-08-01' }), // overdue
      makeCondition({ id: '2', state: 'in_progress', complianceDeadline: '2026-08-15' }), // overdue
      makeCondition({ id: '3', state: 'evidence_submitted', complianceDeadline: '2026-08-01' }), // not overdue (submitted)
      makeCondition({ id: '4', state: 'outstanding', complianceDeadline: '2026-10-01' }), // not overdue (future)
    ];

    const result = calculateConditionCompliance(conditions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.overdueCount).toBe(2);
  });

  it('returns 0% compliance when no conditions are verified', () => {
    const conditions = [
      makeCondition({ state: 'outstanding' }),
      makeCondition({ state: 'in_progress' }),
    ];

    const result = calculateConditionCompliance(conditions, FIXED_DATE);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.compliancePercentage).toBe(0);
  });

  it('returns 100% compliance when all conditions are verified', () => {
    const conditions = [
      makeCondition({ state: 'verified_compliant' }),
      makeCondition({ state: 'verified_compliant' }),
    ];

    const result = calculateConditionCompliance(conditions, FIXED_DATE);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.compliancePercentage).toBe(100);
  });

  it('returns empty summary for empty conditions array', () => {
    const result = calculateConditionCompliance([], FIXED_DATE);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.totalConditions).toBe(0);
    expect(result.data.compliancePercentage).toBe(0);
  });

  it('returns error when conditions is null', () => {
    const result = calculateConditionCompliance(null as unknown as RODCondition[], FIXED_DATE);
    expect(result.success).toBe(false);
  });
});

// ─── evaluateConditionAlerts ──────────────────────────────────────────────────

describe('evaluateConditionAlerts', () => {
  it('generates deadline_warning for conditions within 30 days', () => {
    // 15 days remaining
    const now = new Date('2026-07-17T00:00:00.000Z');
    const conditions = [
      makeCondition({ state: 'outstanding', complianceDeadline: '2026-08-01' }),
    ];

    const result = evaluateConditionAlerts(conditions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('deadline_warning');
    expect(result.data[0].daysRemaining).toBe(15);
  });

  it('generates overdue_critical when past deadline', () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const conditions = [
      makeCondition({ state: 'in_progress', complianceDeadline: '2026-08-01' }),
    ];

    const result = evaluateConditionAlerts(conditions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('overdue_critical');
    expect(result.data[0].daysRemaining).toBeLessThan(0);
  });

  it('does not generate alerts for evidence_submitted conditions', () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const conditions = [
      makeCondition({ state: 'evidence_submitted', complianceDeadline: '2026-08-01' }),
    ];

    const result = evaluateConditionAlerts(conditions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(0);
  });

  it('does not generate alerts for verified_compliant conditions', () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const conditions = [
      makeCondition({ state: 'verified_compliant', complianceDeadline: '2026-08-01' }),
    ];

    const result = evaluateConditionAlerts(conditions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(0);
  });

  it('does not generate alerts for conditions without a deadline', () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const conditions = [
      makeCondition({ state: 'outstanding', complianceDeadline: undefined }),
    ];

    const result = evaluateConditionAlerts(conditions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(0);
  });

  it('does not generate alerts for deadlines more than 30 days away', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const conditions = [
      makeCondition({ state: 'outstanding', complianceDeadline: '2026-08-01' }),
    ];

    const result = evaluateConditionAlerts(conditions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(0);
  });

  it('returns error when conditions is null', () => {
    const result = evaluateConditionAlerts(null as unknown as RODCondition[]);
    expect(result.success).toBe(false);
  });
});

// ─── recordEvidence ───────────────────────────────────────────────────────────

describe('recordEvidence', () => {
  const baseEvidence: EvidenceRecord = {
    type: 'document_ref',
    reference: 'DOC-2026-001',
    description: 'Silt fencing installation photograph',
    recordedBy: 'John Smith',
    recordedAt: '2026-07-01T10:00:00.000Z',
  };

  it('appends evidence to the condition evidence array', () => {
    const condition = makeCondition();
    const result = recordEvidence(condition, baseEvidence);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.evidence).toHaveLength(1);
    expect(result.data.evidence[0]).toContain('[document_ref]');
    expect(result.data.evidence[0]).toContain('DOC-2026-001');
  });

  it('supports inspection_record evidence type', () => {
    const condition = makeCondition();
    const evidence: EvidenceRecord = {
      type: 'inspection_record',
      reference: 'INS-2026-004',
      recordedBy: 'Jane Doe',
      recordedAt: '2026-07-02T08:00:00.000Z',
    };

    const result = recordEvidence(condition, evidence);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.evidence[0]).toContain('[inspection_record]');
  });

  it('supports monitoring_data evidence type', () => {
    const condition = makeCondition();
    const evidence: EvidenceRecord = {
      type: 'monitoring_data',
      reference: 'MON-2026-012',
      description: 'Water quality sample results',
      recordedBy: 'Lab Technician',
      recordedAt: '2026-07-03T09:00:00.000Z',
    };

    const result = recordEvidence(condition, evidence);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.evidence[0]).toContain('[monitoring_data]');
    expect(result.data.evidence[0]).toContain('Water quality sample results');
  });

  it('preserves existing evidence entries', () => {
    const condition = makeCondition({ evidence: ['[document_ref] EXISTING-001 (by Actor, 2026-06-01)'] });
    const result = recordEvidence(condition, baseEvidence);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.evidence).toHaveLength(2);
    expect(result.data.evidence[0]).toContain('EXISTING-001');
  });

  it('updates the updatedAt timestamp', () => {
    const condition = makeCondition();
    const result = recordEvidence(condition, baseEvidence);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.updatedAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('returns error when condition is null', () => {
    const result = recordEvidence(null as unknown as RODCondition, baseEvidence);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_CONDITION');
  });

  it('returns error when evidence reference is empty', () => {
    const condition = makeCondition();
    const result = recordEvidence(condition, { ...baseEvidence, reference: '' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('EVIDENCE_REFERENCE_REQUIRED');
  });

  it('returns error when recordedBy is missing', () => {
    const condition = makeCondition();
    const result = recordEvidence(condition, { ...baseEvidence, recordedBy: '' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('EVIDENCE_RECORDED_BY_REQUIRED');
  });
});

// ─── DISCLAIMER_BANNER ────────────────────────────────────────────────────────

describe('DISCLAIMER_BANNER', () => {
  it('contains advisory-only language (Requirement 18.8)', () => {
    expect(DISCLAIMER_BANNER).toContain('ADVISORY ONLY');
  });

  it('mentions ECO verification requirement', () => {
    expect(DISCLAIMER_BANNER).toContain('Environmental Control Officer');
  });

  it('mentions professional sign-off', () => {
    expect(DISCLAIMER_BANNER).toContain('Professional sign-off');
  });
});
