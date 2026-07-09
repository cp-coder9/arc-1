/**
 * Unit tests for EIA Assessment Service.
 *
 * Tests BA and Full EIA phase progression, deadline calculation,
 * elapsed percentage, deadline warnings, and phase transition validation.
 *
 * Requirements: 4.1–4.7, 5.1–5.7
 */

import { describe, it, expect } from 'vitest';
import {
  advancePhase,
  calculateDeadline,
  calculateElapsedPercentage,
  checkDeadlineWarnings,
  validatePhaseTransition,
  BA_PHASES,
  FULL_EIA_PHASES,
} from '@/services/eia/eiaAssessmentService';
import type { AssessmentRecord, PhaseRecord, SpecialistStudy } from '@/services/eia/eiaTypes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createBAAssessment(overrides?: Partial<AssessmentRecord>): AssessmentRecord {
  const phases: PhaseRecord[] = BA_PHASES.map((def, idx) => ({
    phase: def.phase,
    status: idx === 0 ? 'active' : 'pending',
    startDate: idx === 0 ? '2025-01-01' : undefined,
    statutoryDays: def.statutoryDays ?? undefined,
  }));

  return {
    id: 'ba-001',
    projectId: 'proj-001',
    type: 'basic_assessment',
    phases,
    currentPhase: 'application_submission',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createFullEIAAssessment(overrides?: Partial<AssessmentRecord>): AssessmentRecord {
  const phases: PhaseRecord[] = FULL_EIA_PHASES.map((def, idx) => ({
    phase: def.phase,
    status: idx === 0 ? 'active' : 'pending',
    startDate: idx === 0 ? '2025-01-01' : undefined,
    statutoryDays: def.statutoryDays ?? undefined,
  }));

  return {
    id: 'eia-001',
    projectId: 'proj-002',
    type: 'full_scoping_eia',
    phases,
    currentPhase: 'application_submission',
    specialistStudies: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── calculateDeadline ───────────────────────────────────────────────────────

describe('calculateDeadline', () => {
  it('adds statutory days to start date', () => {
    const result = calculateDeadline('2025-03-01', 20);
    const deadline = new Date(result);
    expect(deadline.getFullYear()).toBe(2025);
    expect(deadline.getMonth()).toBe(2); // March
    expect(deadline.getDate()).toBe(21);
  });

  it('handles month boundaries correctly', () => {
    const result = calculateDeadline('2025-01-25', 30);
    const deadline = new Date(result);
    expect(deadline.getMonth()).toBe(1); // February
    expect(deadline.getDate()).toBe(24);
  });

  it('handles year boundaries correctly', () => {
    const result = calculateDeadline('2025-12-20', 20);
    const deadline = new Date(result);
    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(0); // January
    expect(deadline.getDate()).toBe(9);
  });
});

// ─── calculateElapsedPercentage ──────────────────────────────────────────────

describe('calculateElapsedPercentage', () => {
  it('returns 50% when half the statutory days have elapsed', () => {
    const result = calculateElapsedPercentage('2025-01-01', 20, '2025-01-11');
    expect(result).toBe(50);
  });

  it('returns 0% when current date equals start date', () => {
    const result = calculateElapsedPercentage('2025-01-01', 20, '2025-01-01');
    expect(result).toBe(0);
  });

  it('returns 100% when all statutory days have elapsed', () => {
    const result = calculateElapsedPercentage('2025-01-01', 20, '2025-01-21');
    expect(result).toBe(100);
  });

  it('can exceed 100% when overdue', () => {
    const result = calculateElapsedPercentage('2025-01-01', 20, '2025-01-31');
    expect(result).toBeGreaterThan(100);
  });

  it('returns -1 when statutory days is 0 or negative', () => {
    expect(calculateElapsedPercentage('2025-01-01', 0, '2025-01-10')).toBe(-1);
    expect(calculateElapsedPercentage('2025-01-01', -5, '2025-01-10')).toBe(-1);
  });
});

// ─── checkDeadlineWarnings ───────────────────────────────────────────────────

describe('checkDeadlineWarnings', () => {
  it('returns warning event when deadline is within threshold', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const phases: PhaseRecord[] = [
      {
        phase: 'application_acceptance',
        status: 'active',
        startDate: '2025-01-01',
        deadline: futureDate.toISOString(),
        statutoryDays: 20,
      },
    ];

    const events = checkDeadlineWarnings(phases, 14);
    expect(events).toHaveLength(1);
    expect(events[0].priority).toBe('high');
    expect(events[0].title).toContain('Deadline approaching');
  });

  it('returns overdue event when deadline has passed', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    const phases: PhaseRecord[] = [
      {
        phase: 'authority_review',
        status: 'active',
        startDate: '2024-01-01',
        deadline: pastDate.toISOString(),
        statutoryDays: 107,
      },
    ];

    const events = checkDeadlineWarnings(phases, 14);
    expect(events).toHaveLength(1);
    expect(events[0].priority).toBe('critical');
    expect(events[0].title).toContain('Phase overdue');
  });

  it('returns empty when deadline is far in the future', () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 60);

    const phases: PhaseRecord[] = [
      {
        phase: 'authority_review',
        status: 'active',
        startDate: '2025-01-01',
        deadline: farFuture.toISOString(),
        statutoryDays: 107,
      },
    ];

    const events = checkDeadlineWarnings(phases, 14);
    expect(events).toHaveLength(0);
  });

  it('ignores non-active phases', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    const phases: PhaseRecord[] = [
      {
        phase: 'application_acceptance',
        status: 'completed',
        startDate: '2025-01-01',
        deadline: pastDate.toISOString(),
        statutoryDays: 20,
      },
    ];

    const events = checkDeadlineWarnings(phases, 14);
    expect(events).toHaveLength(0);
  });

  it('ignores phases without a deadline', () => {
    const phases: PhaseRecord[] = [
      {
        phase: 'bar_preparation',
        status: 'active',
        startDate: '2025-01-01',
      },
    ];

    const events = checkDeadlineWarnings(phases, 14);
    expect(events).toHaveLength(0);
  });
});

// ─── validatePhaseTransition ─────────────────────────────────────────────────

describe('validatePhaseTransition', () => {
  it('blocks EIR Public Participation when specialist studies are not final', () => {
    const studies: SpecialistStudy[] = [
      {
        id: 's1',
        studyType: 'ecological',
        specialistName: 'Dr Smith',
        status: 'in_progress',
        requiredDate: '2025-06-01',
      },
      {
        id: 's2',
        studyType: 'heritage',
        specialistName: 'Prof Jones',
        status: 'final',
        requiredDate: '2025-06-01',
      },
    ];

    const assessment = createFullEIAAssessment({ specialistStudies: studies });
    const result = validatePhaseTransition(assessment, 'eir_public_participation');

    expect(result.valid).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain('ecological');
    expect(result.blockers[0]).toContain('in_progress');
  });

  it('allows EIR Public Participation when all specialist studies are final', () => {
    const studies: SpecialistStudy[] = [
      {
        id: 's1',
        studyType: 'ecological',
        specialistName: 'Dr Smith',
        status: 'final',
        requiredDate: '2025-06-01',
      },
      {
        id: 's2',
        studyType: 'heritage',
        specialistName: 'Prof Jones',
        status: 'final',
        requiredDate: '2025-06-01',
      },
    ];

    const assessment = createFullEIAAssessment({ specialistStudies: studies });
    const result = validatePhaseTransition(assessment, 'eir_public_participation');

    expect(result.valid).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks when no specialist studies exist for Full EIA advancement to EIR PP', () => {
    const assessment = createFullEIAAssessment({ specialistStudies: [] });
    const result = validatePhaseTransition(assessment, 'eir_public_participation');

    expect(result.valid).toBe(false);
    expect(result.blockers[0]).toContain('No specialist studies');
  });

  it('allows any transition for basic assessment type', () => {
    const assessment = createBAAssessment();
    const result = validatePhaseTransition(assessment, 'public_participation');

    expect(result.valid).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('allows non-EIR transitions for Full EIA without checking studies', () => {
    const assessment = createFullEIAAssessment({ specialistStudies: [] });
    const result = validatePhaseTransition(assessment, 'scoping_public_participation');

    expect(result.valid).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });
});

// ─── advancePhase ────────────────────────────────────────────────────────────

describe('advancePhase', () => {
  it('completes active phase and activates next phase for BA', () => {
    const assessment = createBAAssessment();
    const { assessment: updated, event } = advancePhase(
      assessment,
      '2025-01-15',
      'REF-001',
      'user-123'
    );

    // First phase completed
    expect(updated.phases[0].status).toBe('completed');
    expect(updated.phases[0].completionDate).toBe('2025-01-15');
    expect(updated.phases[0].referenceNumber).toBe('REF-001');
    expect(updated.phases[0].completedBy).toBe('user-123');

    // Second phase activated
    expect(updated.phases[1].status).toBe('active');
    expect(updated.phases[1].startDate).toBe('2025-01-15');
    expect(updated.phases[1].statutoryDays).toBe(20);
    expect(updated.phases[1].deadline).toBeDefined();

    // Current phase updated
    expect(updated.currentPhase).toBe('application_acceptance');

    // Event generated
    expect(event).toBeDefined();
    expect(event!.type).toBe('project_phase_changed');
  });

  it('sets deadline on next phase when statutory days exist', () => {
    const assessment = createBAAssessment();
    const { assessment: updated } = advancePhase(assessment, '2025-01-15');

    // application_acceptance has 20 statutory days
    const expectedDeadline = new Date('2025-01-15');
    expectedDeadline.setDate(expectedDeadline.getDate() + 20);

    const nextPhase = updated.phases[1];
    expect(nextPhase.deadline).toBeDefined();
    expect(new Date(nextPhase.deadline!).getDate()).toBe(expectedDeadline.getDate());
  });

  it('does not set deadline on next phase when no statutory days', () => {
    // Advance to application_acceptance (has statutory days), then advance to bar_preparation (no statutory days)
    const assessment = createBAAssessment();
    const { assessment: step1 } = advancePhase(assessment, '2025-01-15');
    const { assessment: step2 } = advancePhase(step1, '2025-02-04');

    // bar_preparation has no statutory days
    expect(step2.phases[2].status).toBe('active');
    expect(step2.phases[2].deadline).toBeUndefined();
  });

  it('throws when completion date is before phase start date', () => {
    const assessment = createBAAssessment();
    expect(() => advancePhase(assessment, '2024-12-01')).toThrow(
      'Validation failed'
    );
  });

  it('throws when completion date is in the future', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const assessment = createBAAssessment();

    expect(() => advancePhase(assessment, futureDate.toISOString())).toThrow(
      'Validation failed'
    );
  });

  it('throws when no active phase exists', () => {
    const assessment = createBAAssessment();
    // Set all phases to completed
    assessment.phases = assessment.phases.map((p) => ({
      ...p,
      status: 'completed' as const,
    }));

    expect(() => advancePhase(assessment, '2025-01-15')).toThrow(
      'No active phase found'
    );
  });

  it('throws when specialist studies block transition for Full EIA', () => {
    const studies: SpecialistStudy[] = [
      {
        id: 's1',
        studyType: 'ecological',
        specialistName: 'Dr Smith',
        status: 'draft_complete',
        requiredDate: '2025-06-01',
      },
    ];

    // Create a Full EIA assessment at eir_preparation phase (index 7)
    const assessment = createFullEIAAssessment({ specialistStudies: studies });
    // Manually set phases so eir_preparation is active
    assessment.phases = assessment.phases.map((p, idx) => ({
      ...p,
      status: idx < 7 ? 'completed' as const : idx === 7 ? 'active' as const : 'pending' as const,
      startDate: idx <= 7 ? '2025-01-01' : undefined,
    }));
    assessment.currentPhase = 'eir_preparation';

    expect(() => advancePhase(assessment, '2025-03-01')).toThrow(
      'Phase transition blocked'
    );
  });

  it('advances Full EIA when specialist studies are all final', () => {
    const studies: SpecialistStudy[] = [
      {
        id: 's1',
        studyType: 'ecological',
        specialistName: 'Dr Smith',
        status: 'final',
        requiredDate: '2025-06-01',
      },
    ];

    const assessment = createFullEIAAssessment({ specialistStudies: studies });
    // Set eir_preparation as active (index 7)
    assessment.phases = assessment.phases.map((p, idx) => ({
      ...p,
      status: idx < 7 ? 'completed' as const : idx === 7 ? 'active' as const : 'pending' as const,
      startDate: idx <= 7 ? '2025-01-01' : undefined,
    }));
    assessment.currentPhase = 'eir_preparation';

    const { assessment: updated } = advancePhase(assessment, '2025-03-01');
    expect(updated.phases[8].status).toBe('active');
    expect(updated.currentPhase).toBe('eir_public_participation');
  });
});

// ─── Phase Constants ─────────────────────────────────────────────────────────

describe('BA_PHASES', () => {
  it('has 8 phases in correct order', () => {
    expect(BA_PHASES).toHaveLength(8);
    expect(BA_PHASES[0].phase).toBe('application_submission');
    expect(BA_PHASES[7].phase).toBe('decision');
  });

  it('has correct statutory days for regulated phases', () => {
    expect(BA_PHASES[1].statutoryDays).toBe(20); // application_acceptance
    expect(BA_PHASES[3].statutoryDays).toBe(30); // public_participation
    expect(BA_PHASES[5].statutoryDays).toBe(90); // bar_submission
    expect(BA_PHASES[6].statutoryDays).toBe(107); // authority_review
  });

  it('has null statutory days for unregulated phases', () => {
    expect(BA_PHASES[0].statutoryDays).toBeNull(); // application_submission
    expect(BA_PHASES[2].statutoryDays).toBeNull(); // bar_preparation
    expect(BA_PHASES[4].statutoryDays).toBeNull(); // bar_finalization
    expect(BA_PHASES[7].statutoryDays).toBeNull(); // decision
  });
});

describe('FULL_EIA_PHASES', () => {
  it('has 12 phases in correct order', () => {
    expect(FULL_EIA_PHASES).toHaveLength(12);
    expect(FULL_EIA_PHASES[0].phase).toBe('application_submission');
    expect(FULL_EIA_PHASES[11].phase).toBe('decision');
  });

  it('has correct statutory days for regulated phases', () => {
    expect(FULL_EIA_PHASES[1].statutoryDays).toBe(20);  // application_acceptance
    expect(FULL_EIA_PHASES[3].statutoryDays).toBe(30);  // scoping_public_participation
    expect(FULL_EIA_PHASES[4].statutoryDays).toBe(44);  // scoping_submission
    expect(FULL_EIA_PHASES[8].statutoryDays).toBe(30);  // eir_public_participation
    expect(FULL_EIA_PHASES[9].statutoryDays).toBe(106); // eir_submission
    expect(FULL_EIA_PHASES[10].statutoryDays).toBe(107); // authority_review
  });
});
