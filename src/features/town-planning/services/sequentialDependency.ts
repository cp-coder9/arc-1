/**
 * Sequential Dependency Service
 *
 * Manages the mandatory dependency chain for development applications:
 *   SPLUMA (Land Use) → SDP (Site Development Plan) → Building Plan
 *
 * Each step must be completed (or marked N/A) before the next can proceed.
 */

import type { LandUseApplication, SiteDevelopmentPlan } from '../types';

// ─── Dependency Chain Definition ──────────────────────────────────────────────

export type PlanningPhase = 'spluma' | 'sdp' | 'building_plan';

export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'not_applicable';

export interface PhaseDependency {
  phase: PlanningPhase;
  status: PhaseStatus;
  label: string;
  description: string;
  prerequisite?: PlanningPhase;
  completedDate?: string;
  markedNaDate?: string;
  markedNaBy?: string;
  markedNaReason?: string;
}

export interface ProgressIndicator {
  phases: PhaseDependency[];
  currentPhase: PlanningPhase | null;
  overallProgress: number; // 0-100
  canProceedToNext: boolean;
  nextPhase: PlanningPhase | null;
  blockers: string[];
}

// ─── Phase Configuration ──────────────────────────────────────────────────────

const PHASE_CONFIG: Array<{
  phase: PlanningPhase;
  label: string;
  description: string;
  prerequisite?: PlanningPhase;
}> = [
  {
    phase: 'spluma',
    label: 'SPLUMA Application',
    description: 'Land use application (rezoning, consent use, subdivision, etc.)',
  },
  {
    phase: 'sdp',
    label: 'Site Development Plan',
    description: 'Site layout and development controls approval',
    prerequisite: 'spluma',
  },
  {
    phase: 'building_plan',
    label: 'Building Plan Submission',
    description: 'Architectural plans for NBR/SANS compliance review',
    prerequisite: 'sdp',
  },
];

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Determine the status of the SPLUMA phase based on the land use application.
 */
function getSPLUMAStatus(application: LandUseApplication | null): PhaseStatus {
  if (!application) return 'not_started';

  if (application.currentStage === 'conditions_compliance') {
    // Conditions compliance stage means decision is done
    return 'completed';
  }

  if (application.decision === 'approved' || application.decision === 'approved_with_conditions') {
    return 'completed';
  }

  if (application.currentStage === 'withdrawn') {
    return 'not_started';
  }

  return 'in_progress';
}

/**
 * Determine the status of the SDP phase.
 */
function getSDPStatus(sdp: SiteDevelopmentPlan | null): PhaseStatus {
  if (!sdp) return 'not_started';

  if (sdp.stage === 'approved') return 'completed';
  if (sdp.stage === 'rejected') return 'not_started';

  return 'in_progress';
}

/**
 * Check if a project is ready to proceed to a given phase.
 * Returns blockers if not ready.
 */
export function checkReadiness(
  targetPhase: PlanningPhase,
  application: LandUseApplication | null,
  sdp: SiteDevelopmentPlan | null,
  overrides: Map<PlanningPhase, PhaseStatus> = new Map(),
): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];

  const phaseConfig = PHASE_CONFIG.find((p) => p.phase === targetPhase);
  if (!phaseConfig) {
    return { ready: false, blockers: ['Unknown planning phase'] };
  }

  if (!phaseConfig.prerequisite) {
    return { ready: true, blockers: [] };
  }

  const prerequisitePhase = phaseConfig.prerequisite;

  // Check override first
  const overrideStatus = overrides.get(prerequisitePhase);
  if (overrideStatus === 'not_applicable' || overrideStatus === 'completed') {
    return { ready: true, blockers: [] };
  }

  // Check actual status
  let prerequisiteStatus: PhaseStatus;

  switch (prerequisitePhase) {
    case 'spluma':
      prerequisiteStatus = getSPLUMAStatus(application);
      break;
    case 'sdp':
      prerequisiteStatus = getSDPStatus(sdp);
      break;
    default:
      prerequisiteStatus = 'not_started';
  }

  if (prerequisiteStatus === 'completed' || prerequisiteStatus === 'not_applicable') {
    return { ready: true, blockers: [] };
  }

  const prereqConfig = PHASE_CONFIG.find((p) => p.phase === prerequisitePhase);
  blockers.push(
    `${prereqConfig?.label ?? prerequisitePhase} must be completed or marked N/A before proceeding to ${phaseConfig.label}`,
  );

  return { ready: false, blockers };
}

/**
 * Mark a planning phase as not applicable.
 * Used when a specific step in the chain is not required for a project
 * (e.g., no rezoning needed if already correctly zoned).
 */
export function markPlanningNotApplicable(
  phase: PlanningPhase,
  markedBy: string,
  reason: string,
): PhaseDependency {
  const config = PHASE_CONFIG.find((p) => p.phase === phase);
  if (!config) {
    throw new Error(`Unknown planning phase: ${phase}`);
  }

  return {
    phase,
    status: 'not_applicable',
    label: config.label,
    description: config.description,
    prerequisite: config.prerequisite,
    markedNaDate: new Date().toISOString(),
    markedNaBy: markedBy,
    markedNaReason: reason,
  };
}

/**
 * Get a progress indicator showing the current state of all phases.
 */
export function getProgressIndicator(
  application: LandUseApplication | null,
  sdp: SiteDevelopmentPlan | null,
  buildingPlanSubmitted: boolean,
  overrides: Map<PlanningPhase, PhaseStatus> = new Map(),
): ProgressIndicator {
  const phases: PhaseDependency[] = PHASE_CONFIG.map((config) => {
    // Check overrides
    const override = overrides.get(config.phase);
    if (override) {
      return {
        phase: config.phase,
        status: override,
        label: config.label,
        description: config.description,
        prerequisite: config.prerequisite,
      };
    }

    let status: PhaseStatus;
    switch (config.phase) {
      case 'spluma':
        status = getSPLUMAStatus(application);
        break;
      case 'sdp':
        status = getSDPStatus(sdp);
        break;
      case 'building_plan':
        status = buildingPlanSubmitted ? 'completed' : 'not_started';
        break;
      default:
        status = 'not_started';
    }

    return {
      phase: config.phase,
      status,
      label: config.label,
      description: config.description,
      prerequisite: config.prerequisite,
    };
  });

  // Determine current phase (first non-completed, non-NA phase)
  const currentPhase = phases.find(
    (p) => p.status === 'in_progress' || p.status === 'not_started',
  );

  // Calculate overall progress
  const completedCount = phases.filter(
    (p) => p.status === 'completed' || p.status === 'not_applicable',
  ).length;
  const overallProgress = Math.round((completedCount / phases.length) * 100);

  // Determine next phase
  const currentIdx = currentPhase
    ? phases.indexOf(currentPhase)
    : phases.length;
  const nextPhase = currentIdx < phases.length - 1 ? phases[currentIdx + 1] : null;

  // Check if can proceed to next
  let canProceedToNext = false;
  const blockers: string[] = [];

  if (nextPhase) {
    const readiness = checkReadiness(
      nextPhase.phase,
      application,
      sdp,
      overrides,
    );
    canProceedToNext = readiness.ready;
    blockers.push(...readiness.blockers);
  }

  return {
    phases,
    currentPhase: currentPhase?.phase ?? null,
    overallProgress,
    canProceedToNext,
    nextPhase: nextPhase?.phase ?? null,
    blockers,
  };
}
