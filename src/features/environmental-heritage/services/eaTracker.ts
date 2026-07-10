/**
 * Environmental & Heritage Module — EA Tracker Service
 *
 * Pure business logic for tracking Environmental Authorisation applications
 * through the regulatory process. Manages stage transitions, decision
 * branching (ea_granted/ea_refused), appeal paths, and regulatory timeframe
 * compliance calculations based on NEMA EIA Regulations 2014.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8
 */

import type { EAApplication, EAStage } from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Stage Transition Parameters ──────────────────────────────────────────────

export interface StageTransitionParams {
  decisionOutcome?: 'ea_granted' | 'ea_refused';
  decisionReferenceNumber?: string;
  actorId: string;
}

// ─── Regulatory Timeframe Result ──────────────────────────────────────────────

export interface RegulatoryTimeframeStatus {
  stage: string;
  prescribedDays: number;
  elapsedDays: number;
  isOverdue: boolean;
  daysRemaining: number;
  warningActive: boolean;
}

// ─── Stage Sequences ──────────────────────────────────────────────────────────

/**
 * Basic Assessment stage sequence:
 * pre_application → application_submitted → acknowledgement_received →
 * public_participation → comments_period_closed → specialist_studies →
 * bar_submitted → authority_review → decision_issued → appeal_period →
 * (ea_granted | ea_refused) → appeal_lodged → appeal_decision
 */
const BASIC_ASSESSMENT_SEQUENCE: EAStage[] = [
  'pre_application',
  'application_submitted',
  'acknowledgement_received',
  'public_participation',
  'comments_period_closed',
  'specialist_studies',
  'bar_submitted',
  'authority_review',
  'decision_issued',
  'appeal_period',
  'ea_granted',
  'ea_refused',
  'appeal_lodged',
  'appeal_decision',
];

/**
 * Scoping & EIR stage sequence:
 * pre_application → scoping_report_submitted → authority_acceptance_scoping →
 * specialist_studies → eir_submitted → authority_review → decision_issued →
 * appeal_period → (ea_granted | ea_refused) → appeal_lodged → appeal_decision
 */
const SCOPING_EIR_SEQUENCE: EAStage[] = [
  'pre_application',
  'scoping_report_submitted',
  'authority_acceptance_scoping',
  'specialist_studies',
  'eir_submitted',
  'authority_review',
  'decision_issued',
  'appeal_period',
  'ea_granted',
  'ea_refused',
  'appeal_lodged',
  'appeal_decision',
];

// ─── Permitted Transitions Map ────────────────────────────────────────────────

/**
 * Defines valid next stages for each current stage.
 * Key aspects:
 * - Sequential progression through the application lifecycle
 * - decision_issued branches to either ea_granted or ea_refused
 * - appeal_period can advance to appeal_lodged (optional)
 * - ea_granted/ea_refused can advance to appeal_lodged (appeal path)
 */
const BASIC_ASSESSMENT_TRANSITIONS: Record<EAStage, EAStage[]> = {
  pre_application: ['application_submitted'],
  application_submitted: ['acknowledgement_received'],
  acknowledgement_received: ['public_participation'],
  public_participation: ['comments_period_closed'],
  comments_period_closed: ['specialist_studies'],
  specialist_studies: ['bar_submitted'],
  bar_submitted: ['authority_review'],
  authority_review: ['decision_issued'],
  decision_issued: ['ea_granted', 'ea_refused'],
  ea_granted: ['appeal_period'],
  ea_refused: ['appeal_period'],
  appeal_period: ['appeal_lodged'],
  appeal_lodged: ['appeal_decision'],
  appeal_decision: [],
  // Stages not in basic assessment sequence — no transitions
  scoping_report_submitted: [],
  authority_acceptance_scoping: [],
  eir_submitted: [],
};

const SCOPING_EIR_TRANSITIONS: Record<EAStage, EAStage[]> = {
  pre_application: ['scoping_report_submitted'],
  scoping_report_submitted: ['authority_acceptance_scoping'],
  authority_acceptance_scoping: ['specialist_studies'],
  specialist_studies: ['eir_submitted'],
  eir_submitted: ['authority_review'],
  authority_review: ['decision_issued'],
  decision_issued: ['ea_granted', 'ea_refused'],
  ea_granted: ['appeal_period'],
  ea_refused: ['appeal_period'],
  appeal_period: ['appeal_lodged'],
  appeal_lodged: ['appeal_decision'],
  appeal_decision: [],
  // Stages not in scoping & EIR sequence — no transitions
  application_submitted: [],
  acknowledgement_received: [],
  public_participation: [],
  comments_period_closed: [],
  bar_submitted: [],
};

// ─── Regulatory Timeframe Constants (NEMA EIA Regulations 2014) ───────────────

/**
 * Prescribed periods:
 * - Basic Assessment: authority must decide within 107 calendar days of acknowledgement
 * - Scoping: acceptance of scoping report within 43 calendar days of submission
 * - EIR: decision within 107 calendar days of acceptance of scoping report
 *
 * Warning threshold: 14 calendar days before prescribed period expiry
 */
const TIMEFRAME_BA_DECISION_DAYS = 107;
const TIMEFRAME_SCOPING_ACCEPTANCE_DAYS = 43;
const TIMEFRAME_EIR_DECISION_DAYS = 107;
const WARNING_THRESHOLD_DAYS = 14;

// ─── Public Functions ─────────────────────────────────────────────────────────

/**
 * Returns valid next stages based on assessment type and current stage.
 *
 * Validates: Requirement 16.2
 */
export function getPermittedTransitions(
  assessmentType: 'basic_assessment' | 'scoping_and_eir',
  currentStage: EAStage,
): ServiceResult<EAStage[]> {
  if (!assessmentType || !currentStage) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Assessment type and current stage are required.',
      },
    };
  }

  if (assessmentType !== 'basic_assessment' && assessmentType !== 'scoping_and_eir') {
    return {
      success: false,
      error: {
        code: 'INVALID_ASSESSMENT_TYPE',
        message: `Invalid assessment type: ${assessmentType}. Must be 'basic_assessment' or 'scoping_and_eir'.`,
      },
    };
  }

  const transitionMap =
    assessmentType === 'basic_assessment'
      ? BASIC_ASSESSMENT_TRANSITIONS
      : SCOPING_EIR_TRANSITIONS;

  const permitted = transitionMap[currentStage];

  if (permitted === undefined) {
    return {
      success: false,
      error: {
        code: 'INVALID_STAGE',
        message: `Stage '${currentStage}' is not valid for assessment type '${assessmentType}'.`,
      },
    };
  }

  return { success: true, data: permitted };
}

/**
 * Transitions an EA application to a target stage, validating that the
 * transition is permitted. Handles decision branching and records the
 * transition in stage history.
 *
 * Validates: Requirements 16.2, 16.3, 16.6
 */
export function transitionEAApplication(
  application: EAApplication,
  targetStage: EAStage,
  params?: StageTransitionParams,
): ServiceResult<{ next: EAApplication; valid: boolean }> {
  if (!application) {
    return {
      success: false,
      error: {
        code: 'INVALID_APPLICATION',
        message: 'Application record is required.',
      },
    };
  }

  if (!params?.actorId) {
    return {
      success: false,
      error: {
        code: 'ACTOR_REQUIRED',
        message: 'Actor ID is required for stage transitions.',
      },
    };
  }

  // Determine the assessment type for transition map lookup
  const assessmentType = application.assessmentType as 'basic_assessment' | 'scoping_and_eir';
  if (assessmentType !== 'basic_assessment' && assessmentType !== 'scoping_and_eir') {
    return {
      success: false,
      error: {
        code: 'INVALID_ASSESSMENT_TYPE',
        message: `Application has invalid assessment type: ${application.assessmentType}.`,
      },
    };
  }

  // Get permitted transitions for the current stage
  const permittedResult = getPermittedTransitions(assessmentType, application.currentStage);
  if (!permittedResult.success) {
    return {
      success: false,
      error: (permittedResult as any).error,
    };
  }

  const permittedStages = permittedResult.data;

  // Check if the target stage is in the permitted transitions
  if (!permittedStages.includes(targetStage)) {
    return {
      success: true,
      data: {
        next: application,
        valid: false,
      },
    };
  }

  // For decision_issued → ea_granted/ea_refused, validate decision params
  if (targetStage === 'ea_granted' || targetStage === 'ea_refused') {
    if (application.currentStage !== 'decision_issued') {
      return {
        success: true,
        data: {
          next: application,
          valid: false,
        },
      };
    }
  }

  const now = new Date().toISOString();

  // Build the updated application
  const next: EAApplication = {
    ...application,
    currentStage: targetStage,
    stageHistory: [
      ...application.stageHistory,
      {
        stage: targetStage,
        date: now.split('T')[0],
        actor: params.actorId,
      },
    ],
    updatedAt: now,
  };

  // Apply decision-specific fields
  if (targetStage === 'ea_granted' || targetStage === 'ea_refused') {
    next.decisionOutcome = targetStage === 'ea_granted' ? 'ea_granted' : 'ea_refused';
    next.decisionDate = now.split('T')[0];
    if (params.decisionReferenceNumber) {
      next.decisionReferenceNumber = params.decisionReferenceNumber;
    }
  }

  // Set appeal period end date when entering appeal_period (20 days from decision)
  if (targetStage === 'appeal_period' && next.decisionDate) {
    const decisionDate = new Date(next.decisionDate);
    const appealEnd = new Date(decisionDate);
    appealEnd.setDate(appealEnd.getDate() + 20);
    next.appealPeriodEndDate = appealEnd.toISOString().split('T')[0];
  }

  return {
    success: true,
    data: {
      next,
      valid: true,
    },
  };
}

/**
 * Calculates regulatory timeframe compliance for an EA application.
 * Returns elapsed days vs prescribed periods with warning indicators.
 *
 * Prescribed periods (NEMA EIA Regulations 2014):
 * - Basic Assessment: 107 calendar days from acknowledgement to decision
 * - Scoping: 43 calendar days from scoping submission to acceptance
 * - EIR: 107 calendar days from acceptance to decision
 *
 * Warning active when within 14 days of prescribed period expiry.
 *
 * Validates: Requirements 16.4, 16.5
 */
export function calculateRegulatoryTimeframes(
  application: EAApplication,
  now: Date,
): ServiceResult<RegulatoryTimeframeStatus[]> {
  if (!application) {
    return {
      success: false,
      error: {
        code: 'INVALID_APPLICATION',
        message: 'Application record is required.',
      },
    };
  }

  const timeframes: RegulatoryTimeframeStatus[] = [];

  if (application.assessmentType === 'basic_assessment') {
    // BA: authority must decide within 107 calendar days of acknowledgement
    const acknowledgementEntry = application.stageHistory.find(
      (h) => h.stage === 'acknowledgement_received',
    );

    if (acknowledgementEntry) {
      const startDate = new Date(acknowledgementEntry.date);
      const elapsedDays = calculateDaysBetween(startDate, now);
      const prescribedDays = TIMEFRAME_BA_DECISION_DAYS;
      const daysRemaining = prescribedDays - elapsedDays;
      const isOverdue = daysRemaining < 0;
      const warningActive = !isOverdue && daysRemaining <= WARNING_THRESHOLD_DAYS;

      timeframes.push({
        stage: 'authority_decision',
        prescribedDays,
        elapsedDays,
        isOverdue,
        daysRemaining: Math.max(daysRemaining, 0),
        warningActive,
      });
    }
  } else if (application.assessmentType === 'scoping_and_eir') {
    // Scoping: acceptance within 43 calendar days of scoping report submission
    const scopingSubmissionEntry = application.stageHistory.find(
      (h) => h.stage === 'scoping_report_submitted',
    );

    if (scopingSubmissionEntry) {
      const startDate = new Date(scopingSubmissionEntry.date);
      const elapsedDays = calculateDaysBetween(startDate, now);
      const prescribedDays = TIMEFRAME_SCOPING_ACCEPTANCE_DAYS;
      const daysRemaining = prescribedDays - elapsedDays;
      const isOverdue = daysRemaining < 0;
      const warningActive = !isOverdue && daysRemaining <= WARNING_THRESHOLD_DAYS;

      timeframes.push({
        stage: 'scoping_acceptance',
        prescribedDays,
        elapsedDays,
        isOverdue,
        daysRemaining: Math.max(daysRemaining, 0),
        warningActive,
      });
    }

    // EIR: decision within 107 calendar days of acceptance of scoping
    const acceptanceEntry = application.stageHistory.find(
      (h) => h.stage === 'authority_acceptance_scoping',
    );

    if (acceptanceEntry) {
      const startDate = new Date(acceptanceEntry.date);
      const elapsedDays = calculateDaysBetween(startDate, now);
      const prescribedDays = TIMEFRAME_EIR_DECISION_DAYS;
      const daysRemaining = prescribedDays - elapsedDays;
      const isOverdue = daysRemaining < 0;
      const warningActive = !isOverdue && daysRemaining <= WARNING_THRESHOLD_DAYS;

      timeframes.push({
        stage: 'eir_decision',
        prescribedDays,
        elapsedDays,
        isOverdue,
        daysRemaining: Math.max(daysRemaining, 0),
        warningActive,
      });
    }
  }

  return { success: true, data: timeframes };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculates the number of calendar days between two dates (inclusive of start, exclusive of end).
 */
function calculateDaysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / msPerDay);
}
