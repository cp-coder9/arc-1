/**
 * Environmental & Heritage Module — EMPr Compliance Service
 *
 * Pure business logic for tracking Environmental Management Programme
 * compliance during construction. Manages ECO audit scheduling, corrective
 * action state transitions, compliance status derivation from audit ratings,
 * environmental incident logging, and overdue action flagging.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9
 */

import type {
  EMPrRecord,
  ECOAudit,
  CorrectiveAction,
  CorrectiveActionState,
  EnvironmentalIncident,
  AuditFrequency,
  ECOAuditRating,
  IncidentType,
} from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Domain Types ─────────────────────────────────────────────────────────────

/** A scheduled audit date generated from EMPr frequency configuration */
export interface ScheduledAudit {
  emprId: string;
  scheduledDate: Date;
  auditFrequency: AuditFrequency;
}

/** Overall EMPr compliance status derived from most recent ECO audit rating */
export type EMPrComplianceStatus = 'compliant' | 'at_risk' | 'non_compliant' | 'no_audits';

/** Result of overdue corrective action check */
export interface OverdueCorrectiveAction {
  action: CorrectiveAction;
  daysPastDeadline: number;
}

/** Parameters for logging an environmental incident */
export interface IncidentLogParams {
  id: string;
  emprId: string;
  projectId: string;
  incidentType: IncidentType;
  description: string;
  locationOnSite: string;
  photographicEvidence: string[];
  immediateRemedialAction: string;
  date: string;
  reportedBy: string;
}

// ─── Corrective Action State Machine ──────────────────────────────────────────

/**
 * Forward-only corrective action states:
 * issued → in_progress → completed → verified_closed
 */
const CORRECTIVE_ACTION_SEQUENCE: CorrectiveActionState[] = [
  'issued',
  'in_progress',
  'completed',
  'verified_closed',
];

// ─── Audit Frequency Intervals (in calendar days) ─────────────────────────────

const FREQUENCY_DAYS: Record<AuditFrequency, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 91,
};

// ─── Public Functions ─────────────────────────────────────────────────────────

/**
 * Generates a schedule of audit dates based on the EMPr's configured
 * audit frequency within the specified date range.
 *
 * Validates: Requirements 19.2, 19.7
 */
export function generateAuditSchedule(
  empr: EMPrRecord,
  range: { start: Date; end: Date },
): ServiceResult<ScheduledAudit[]> {
  if (!empr) {
    return {
      success: false,
      error: {
        code: 'INVALID_EMPR',
        message: 'EMPr record is required.',
      },
    };
  }

  if (!range || !range.start || !range.end) {
    return {
      success: false,
      error: {
        code: 'INVALID_RANGE',
        message: 'Date range with start and end dates is required.',
      },
    };
  }

  if (range.start > range.end) {
    return {
      success: false,
      error: {
        code: 'INVALID_RANGE',
        message: 'Range start must not be after range end.',
      },
    };
  }

  const intervalDays = FREQUENCY_DAYS[empr.auditFrequency];
  if (!intervalDays) {
    return {
      success: false,
      error: {
        code: 'INVALID_FREQUENCY',
        message: `Unknown audit frequency: ${empr.auditFrequency}.`,
      },
    };
  }

  const schedule: ScheduledAudit[] = [];
  const current = new Date(range.start);

  while (current <= range.end) {
    schedule.push({
      emprId: empr.id,
      scheduledDate: new Date(current),
      auditFrequency: empr.auditFrequency,
    });
    current.setDate(current.getDate() + intervalDays);
  }

  return { success: true, data: schedule };
}

/**
 * Transitions a corrective action to the target state.
 * Only forward transitions are permitted:
 * issued → in_progress → completed → verified_closed
 *
 * Validates: Requirements 19.4, 19.8
 */
export function transitionCorrectiveAction(
  action: CorrectiveAction,
  targetState: CorrectiveActionState,
): { next: CorrectiveAction; valid: boolean; error?: string } {
  if (!action) {
    return {
      next: action,
      valid: false,
      error: 'Corrective action record is required.',
    };
  }

  if (!targetState) {
    return {
      next: action,
      valid: false,
      error: 'Target state is required.',
    };
  }

  const currentIndex = CORRECTIVE_ACTION_SEQUENCE.indexOf(action.state);
  const targetIndex = CORRECTIVE_ACTION_SEQUENCE.indexOf(targetState);

  // Invalid current state
  if (currentIndex === -1) {
    return {
      next: action,
      valid: false,
      error: `Current state '${action.state}' is not a valid corrective action state.`,
    };
  }

  // Invalid target state
  if (targetIndex === -1) {
    return {
      next: action,
      valid: false,
      error: `Target state '${targetState}' is not a valid corrective action state.`,
    };
  }

  // Must be exactly one step forward
  if (targetIndex !== currentIndex + 1) {
    if (targetIndex <= currentIndex) {
      return {
        next: action,
        valid: false,
        error: `Cannot transition backwards from '${action.state}' to '${targetState}'. Only forward transitions are permitted.`,
      };
    }
    return {
      next: action,
      valid: false,
      error: `Cannot skip states. From '${action.state}', the next valid state is '${CORRECTIVE_ACTION_SEQUENCE[currentIndex + 1]}'.`,
    };
  }

  const now = new Date().toISOString();
  const next: CorrectiveAction = {
    ...action,
    state: targetState,
    stateHistory: [
      ...action.stateHistory,
      {
        state: targetState,
        date: now.split('T')[0],
        actor: 'system',
      },
    ],
  };

  return { next, valid: true };
}

/**
 * Calculates the overall EMPr compliance status from the most recent
 * ECO audit rating. Maps audit ratings to project-level compliance:
 * - compliant → "compliant"
 * - minor_non_conformance → "at_risk"
 * - major_non_conformance → "non_compliant"
 * - critical_non_conformance → "non_compliant"
 *
 * Validates: Requirements 19.8
 */
export function calculateEMPrComplianceStatus(audits: ECOAudit[]): EMPrComplianceStatus {
  if (!audits || audits.length === 0) {
    return 'no_audits';
  }

  // Sort by audit date descending to get the most recent audit
  const sorted = [...audits].sort(
    (a, b) => new Date(b.auditDate).getTime() - new Date(a.auditDate).getTime(),
  );

  const mostRecent = sorted[0];
  return mapRatingToComplianceStatus(mostRecent.overallRating);
}

/**
 * Identifies corrective actions that are past their deadline without
 * reaching 'completed' or 'verified_closed' status.
 *
 * Validates: Requirement 19.5
 */
export function flagOverdueCorrectiveActions(
  actions: CorrectiveAction[],
  now: Date,
): ServiceResult<OverdueCorrectiveAction[]> {
  if (!actions) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Corrective actions array is required.',
      },
    };
  }

  const overdue: OverdueCorrectiveAction[] = [];

  for (const action of actions) {
    // Only flag if not yet completed or verified_closed
    if (action.state === 'completed' || action.state === 'verified_closed') {
      continue;
    }

    const deadline = new Date(action.deadline);
    if (now > deadline) {
      const daysPast = calculateDaysBetween(deadline, now);
      overdue.push({
        action,
        daysPastDeadline: daysPast,
      });
    }
  }

  return { success: true, data: overdue };
}

/**
 * Validates and creates an environmental incident record.
 * Enforces field constraints:
 * - description: max 1000 characters
 * - locationOnSite: max 200 characters
 * - photographicEvidence: 0–10 items
 * - immediateRemedialAction: max 1000 characters
 *
 * Validates: Requirement 19.6
 */
export function logEnvironmentalIncident(
  params: IncidentLogParams,
): ServiceResult<EnvironmentalIncident> {
  if (!params) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Incident parameters are required.',
      },
    };
  }

  // Validate required fields
  if (!params.incidentType) {
    return {
      success: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Incident type is required.',
      },
    };
  }

  if (!params.description || params.description.trim().length === 0) {
    return {
      success: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Description is required.',
      },
    };
  }

  if (params.description.length > 1000) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Description must not exceed 1000 characters.',
      },
    };
  }

  if (!params.locationOnSite || params.locationOnSite.trim().length === 0) {
    return {
      success: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Location on site is required.',
      },
    };
  }

  if (params.locationOnSite.length > 200) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Location on site must not exceed 200 characters.',
      },
    };
  }

  if (params.immediateRemedialAction && params.immediateRemedialAction.length > 1000) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Immediate remedial action must not exceed 1000 characters.',
      },
    };
  }

  if (params.photographicEvidence && params.photographicEvidence.length > 10) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Photographic evidence must not exceed 10 items.',
      },
    };
  }

  const validIncidentTypes: IncidentType[] = [
    'spill', 'clearing', 'dust', 'water_pollution', 'noise', 'waste', 'other',
  ];
  if (!validIncidentTypes.includes(params.incidentType)) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid incident type: ${params.incidentType}. Must be one of: ${validIncidentTypes.join(', ')}.`,
      },
    };
  }

  const incident: EnvironmentalIncident = {
    id: params.id,
    emprId: params.emprId,
    projectId: params.projectId,
    incidentType: params.incidentType,
    description: params.description,
    locationOnSite: params.locationOnSite,
    photographicEvidence: params.photographicEvidence || [],
    immediateRemedialAction: params.immediateRemedialAction || '',
    date: params.date,
    reportedBy: params.reportedBy,
    createdAt: new Date().toISOString(),
  };

  return { success: true, data: incident };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps an ECO audit rating to the EMPr compliance status for Project Passport.
 */
function mapRatingToComplianceStatus(rating: ECOAuditRating): EMPrComplianceStatus {
  switch (rating) {
    case 'compliant':
      return 'compliant';
    case 'minor_non_conformance':
      return 'at_risk';
    case 'major_non_conformance':
    case 'critical_non_conformance':
      return 'non_compliant';
    default:
      return 'no_audits';
  }
}

/**
 * Calculates the number of calendar days between two dates.
 */
function calculateDaysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / msPerDay);
}
