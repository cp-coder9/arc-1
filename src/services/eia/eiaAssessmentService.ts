/**
 * EIA Assessment Service — Basic Assessment + Full EIA phase management.
 *
 * Pure functions for phase-based workflow progression, deadline calculation,
 * elapsed percentage tracking, and deadline warning generation.
 *
 * Requirements: 4.1–4.7, 5.1–5.7
 */

import type {
  AssessmentRecord,
  BAPhase,
  FullEIAPhase,
  PhaseRecord,
  WorkflowEvent,
} from './eiaTypes';
import { PhaseCompletionSchema } from '@/lib/eiaSchemas';

// ─── Phase Order & Statutory Days ────────────────────────────────────────────

export interface PhaseDefinition {
  phase: BAPhase | FullEIAPhase;
  statutoryDays: number | null;
}

/**
 * Basic Assessment phase order with statutory days.
 * Phases with `null` have no prescribed regulatory timeframe.
 */
export const BA_PHASES: PhaseDefinition[] = [
  { phase: 'application_submission', statutoryDays: null },
  { phase: 'application_acceptance', statutoryDays: 20 },
  { phase: 'bar_preparation', statutoryDays: null },
  { phase: 'public_participation', statutoryDays: 30 },
  { phase: 'bar_finalization', statutoryDays: null },
  { phase: 'bar_submission', statutoryDays: 90 },
  { phase: 'authority_review', statutoryDays: 107 },
  { phase: 'decision', statutoryDays: null },
];

/**
 * Full EIA phase order with statutory days.
 * Phases with `null` have no prescribed regulatory timeframe.
 */
export const FULL_EIA_PHASES: PhaseDefinition[] = [
  { phase: 'application_submission', statutoryDays: null },
  { phase: 'application_acceptance', statutoryDays: 20 },
  { phase: 'scoping_preparation', statutoryDays: null },
  { phase: 'scoping_public_participation', statutoryDays: 30 },
  { phase: 'scoping_submission', statutoryDays: 44 },
  { phase: 'scoping_acceptance', statutoryDays: null },
  { phase: 'specialist_studies', statutoryDays: null },
  { phase: 'eir_preparation', statutoryDays: null },
  { phase: 'eir_public_participation', statutoryDays: 30 },
  { phase: 'eir_submission', statutoryDays: 106 },
  { phase: 'authority_review', statutoryDays: 107 },
  { phase: 'decision', statutoryDays: null },
];

// ─── Deadline Calculation ────────────────────────────────────────────────────

/**
 * Adds calendar days to a start date and returns the deadline as an ISO string.
 */
export function calculateDeadline(startDate: string, statutoryDays: number): string {
  const start = new Date(startDate);
  const deadline = new Date(start);
  deadline.setDate(deadline.getDate() + statutoryDays);
  return deadline.toISOString();
}

// ─── Elapsed Percentage ──────────────────────────────────────────────────────

/**
 * Calculates the elapsed percentage of a statutory phase.
 * Returns a number between 0 and 100 (clamped — can exceed 100 if overdue).
 * For phases without statutory days, returns -1 to indicate no percentage applies.
 */
export function calculateElapsedPercentage(
  startDate: string,
  statutoryDays: number,
  currentDate?: string
): number {
  if (statutoryDays <= 0) return -1;

  const start = new Date(startDate);
  const now = currentDate ? new Date(currentDate) : new Date();
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  const percentage = (elapsedDays / statutoryDays) * 100;

  return Math.max(0, Math.round(percentage * 100) / 100);
}

// ─── Deadline Warnings ───────────────────────────────────────────────────────

/**
 * Checks active phases for deadline warnings and overdue status.
 * Returns WorkflowEvent-like objects for phases within the threshold or overdue.
 */
export function checkDeadlineWarnings(
  phases: PhaseRecord[],
  warningThresholdDays: number = 14
): Partial<WorkflowEvent>[] {
  const now = new Date();
  const events: Partial<WorkflowEvent>[] = [];

  for (const phase of phases) {
    if (phase.status !== 'active' || !phase.deadline) continue;

    const deadline = new Date(phase.deadline);
    const remainingMs = deadline.getTime() - now.getTime();
    const remainingDays = remainingMs / (1000 * 60 * 60 * 24);

    if (remainingDays < 0) {
      // Overdue
      events.push({
        type: 'task_overdue',
        title: `Phase overdue: ${phase.phase}`,
        detail: `The ${phase.phase} phase deadline was ${deadline.toISOString().split('T')[0]}. It is now ${Math.abs(Math.floor(remainingDays))} days overdue.`,
        priority: 'critical',
      });
    } else if (remainingDays <= warningThresholdDays) {
      // Within warning threshold
      events.push({
        type: 'task_overdue',
        title: `Deadline approaching: ${phase.phase}`,
        detail: `The ${phase.phase} phase deadline is ${deadline.toISOString().split('T')[0]}. ${Math.floor(remainingDays)} days remaining.`,
        priority: 'high',
      });
    }
  }

  return events;
}

// ─── Phase Transition Validation ─────────────────────────────────────────────

/**
 * Validates whether a phase transition is allowed for Full EIA assessments.
 * Specifically checks that all specialist studies have status "final" before
 * allowing advancement from eir_preparation to eir_public_participation.
 */
export function validatePhaseTransition(
  assessment: AssessmentRecord,
  targetPhase: BAPhase | FullEIAPhase
): { valid: boolean; blockers: string[] } {
  const blockers: string[] = [];

  // For Full EIA, check specialist studies before EIR Public Participation
  if (
    assessment.type === 'full_scoping_eia' &&
    targetPhase === 'eir_public_participation'
  ) {
    const studies = assessment.specialistStudies ?? [];

    if (studies.length === 0) {
      blockers.push('No specialist studies are recorded. At least one is expected before EIR Public Participation.');
    } else {
      const nonFinalStudies = studies.filter((s) => s.status !== 'final');
      if (nonFinalStudies.length > 0) {
        for (const study of nonFinalStudies) {
          blockers.push(
            `Specialist study "${study.studyType}" (${study.specialistName}) has status "${study.status}" — must be "final" before EIR Public Participation.`
          );
        }
      }
    }
  }

  return {
    valid: blockers.length === 0,
    blockers,
  };
}

// ─── Phase Advancement ───────────────────────────────────────────────────────

/**
 * Advances an assessment to the next phase by completing the current active phase.
 *
 * Validates:
 * - Completion date is not before the phase start date
 * - Completion date is not in the future
 * - Phase transition is valid (specialist studies check for Full EIA)
 *
 * Returns the updated assessment and an optional WorkflowEvent for Action Centre.
 */
export function advancePhase(
  assessment: AssessmentRecord,
  completionDate: string,
  referenceNumber?: string,
  userId?: string
): { assessment: AssessmentRecord; event?: Partial<WorkflowEvent> } {
  // Find the current active phase
  const activePhaseIndex = assessment.phases.findIndex(
    (p) => p.status === 'active'
  );

  if (activePhaseIndex === -1) {
    throw new Error('No active phase found in assessment. Cannot advance.');
  }

  const activePhase = assessment.phases[activePhaseIndex];

  // Validate completion date using PhaseCompletionSchema
  const validationResult = PhaseCompletionSchema.safeParse({
    completionDate,
    startDate: activePhase.startDate ?? completionDate,
    referenceNumber,
  });

  if (!validationResult.success) {
    const messages = validationResult.error.issues.map((i) => i.message);
    throw new Error(`Validation failed: ${messages.join('; ')}`);
  }

  // Determine phase definitions based on assessment type
  const phaseDefinitions =
    assessment.type === 'basic_assessment' ? BA_PHASES : FULL_EIA_PHASES;

  // Check if there's a next phase
  const nextPhaseIndex = activePhaseIndex + 1;
  const hasNextPhase = nextPhaseIndex < assessment.phases.length;

  // If there's a next phase, validate the transition
  if (hasNextPhase) {
    const nextPhase = assessment.phases[nextPhaseIndex];
    const validation = validatePhaseTransition(assessment, nextPhase.phase as BAPhase | FullEIAPhase);
    if (!validation.valid) {
      throw new Error(
        `Phase transition blocked: ${validation.blockers.join('; ')}`
      );
    }
  }

  // Complete the current phase
  const updatedPhases = [...assessment.phases];
  updatedPhases[activePhaseIndex] = {
    ...activePhase,
    status: 'completed',
    completionDate,
    referenceNumber: referenceNumber ?? activePhase.referenceNumber,
    completedBy: userId,
  };

  // Activate the next phase if it exists
  let event: Partial<WorkflowEvent> | undefined;

  if (hasNextPhase) {
    const nextPhaseDef = phaseDefinitions[nextPhaseIndex];
    const nextPhaseStartDate = completionDate;
    const deadline = nextPhaseDef.statutoryDays
      ? calculateDeadline(nextPhaseStartDate, nextPhaseDef.statutoryDays)
      : undefined;

    updatedPhases[nextPhaseIndex] = {
      ...updatedPhases[nextPhaseIndex],
      status: 'active',
      startDate: nextPhaseStartDate,
      statutoryDays: nextPhaseDef.statutoryDays ?? undefined,
      deadline,
    };

    // Generate informational event for the phase transition
    event = {
      type: 'project_phase_changed',
      title: `Phase advanced: ${updatedPhases[nextPhaseIndex].phase}`,
      detail: `Assessment moved from "${activePhase.phase}" to "${updatedPhases[nextPhaseIndex].phase}".${deadline ? ` Deadline: ${deadline.split('T')[0]}.` : ''}`,
      priority: 'medium',
    };
  }

  const updatedAssessment: AssessmentRecord = {
    ...assessment,
    phases: updatedPhases,
    currentPhase: hasNextPhase
      ? updatedPhases[nextPhaseIndex].phase
      : activePhase.phase,
    updatedAt: new Date().toISOString(),
  };

  return { assessment: updatedAssessment, event };
}
