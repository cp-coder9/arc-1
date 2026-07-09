// ─── EIA Integration Service ─────────────────────────────────────────────────
// Adapts EIA records into the platform spine's ProjectRecord envelope,
// emits WorkflowEvent objects to the Action Centre, evaluates environmental
// lifecycle blockers, and writes audit trail entries.
//
// Requirements: 12.1–12.7, 13.1–13.5

import type {
  EIAWorkflowEventType,
  EIAAuditEntry,
  EnvironmentalBlockerResult,
  AuthorizationStatus,
  ScreeningResult,
  AssessmentRecord,
  AuthorizationRecord,
  EMPrCommitment,
  GreenStarResult,
  EDGEResult,
} from './eiaTypes';

import type {
  ProjectRecord,
  WorkflowEvent,
  ArchitexRole,
  Priority,
  ProjectRecordType,
} from '../lifecycleTypes';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Union of all EIA record types that can be enveloped into a ProjectRecord. */
export type EIARecord =
  | ScreeningResult
  | AssessmentRecord
  | AuthorizationRecord
  | EMPrCommitment
  | GreenStarResult
  | EDGEResult;

// ─── ID Generation ───────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// ─── Record Type Derivation ──────────────────────────────────────────────────

/**
 * Derives a ProjectRecordType-compatible string from the shape of an EIA record.
 * Uses duck-typing to identify the record type.
 */
function deriveRecordType(record: EIARecord): ProjectRecordType {
  if ('recommendation' in record && 'triggeredActivities' in record) {
    return 'municipal_submission_pack'; // Screening maps to municipal context
  }
  if ('currentPhase' in record && 'phases' in record) {
    return 'municipal_submission_pack'; // Assessment maps to municipal context
  }
  if ('conditions' in record && 'competentAuthority' in record) {
    return 'municipal_approval_letter'; // Authorization maps to approval
  }
  if ('monitoringFrequency' in record && 'complianceStatus' in record) {
    return 'inspection_test_plan'; // EMPr commitment maps to inspection
  }
  if ('starRating' in record && 'credits' in record) {
    return 'inspection_test_plan'; // Green Star maps to inspection context
  }
  if ('categories' in record && 'level' in record) {
    return 'inspection_test_plan'; // EDGE maps to inspection context
  }
  return 'municipal_submission_pack';
}

// ─── toProjectRecord ─────────────────────────────────────────────────────────

/**
 * Adapts any EIA record into a ProjectRecord envelope for integration
 * with Project Passport and the lifecycle engine.
 *
 * Creates a generic envelope with:
 * - id: generated unique identifier
 * - projectId: from the calling context
 * - tenantId: from the calling context
 * - recordType: derived from the EIA record shape
 * - data: the EIA record itself (stored in payload)
 * - createdAt: ISO 8601 timestamp
 *
 * Requirement 12.3: Write updated status record to Project Passport.
 * Requirement 13.3: Store using ProjectRecord envelope structure.
 */
export function toProjectRecord(
  eiaRecord: EIARecord,
  projectId: string,
  tenantId: string
): ProjectRecord {
  const now = new Date().toISOString();
  const recordType = deriveRecordType(eiaRecord);

  return {
    id: generateId('eia_rec'),
    tenantId,
    projectId,
    phase: 'municipal_submission',
    moduleKey: 'municipal',
    recordType,
    title: `EIA Record — ${recordType}`,
    status: 'draft',
    payload: eiaRecord as unknown as Record<string, unknown>,
    approvals: {
      required: false,
    },
    audit: {
      createdBy: 'eia_integration_service',
      createdAt: now,
    },
    linkedRecordIds: [],
  };
}

// ─── emitWorkflowEvent ───────────────────────────────────────────────────────

/**
 * Creates a WorkflowEvent object for the Action Centre.
 * The actual persistence/dispatch is handled by the wiring layer;
 * this function builds the event payload.
 *
 * Maps EIA event types to the platform's WorkflowEvent.type enum:
 * - 'deadline_warning' → 'task_overdue'
 * - 'action_required' → 'approval_required'
 * - 'blocker' → 'municipal_blocker'
 * - 'info' → 'risk_detected'
 *
 * Requirement 12.4: Emit WorkflowEvent with correct severity.
 */
export function emitWorkflowEvent(
  type: EIAWorkflowEventType,
  projectId: string,
  title: string,
  detail: string,
  assignedRoles: ArchitexRole[],
  priority: Priority
): WorkflowEvent {
  const typeMap: Record<EIAWorkflowEventType, WorkflowEvent['type']> = {
    deadline_warning: 'task_overdue',
    action_required: 'approval_required',
    blocker: 'municipal_blocker',
    info: 'risk_detected',
  };

  return {
    id: generateId('eia_evt'),
    type: typeMap[type],
    projectId,
    title,
    detail,
    priority,
    sourceModule: 'documents',
    assignedRoles,
    createdAt: new Date().toISOString(),
  };
}

// ─── evaluateEnvironmentalBlockers ───────────────────────────────────────────

/**
 * Determines whether environmental authorization status constitutes
 * a lifecycle blocker preventing construction phase advancement.
 *
 * Authorization status 'authorized' or 'authorized_with_conditions'
 * are the only non-blocking states. All other statuses block.
 *
 * Requirement 12.5: Authorization not approved/issued → blocker for
 * construction_execution advancement.
 */
export function evaluateEnvironmentalBlockers(
  _projectId: string,
  authorizationStatus: AuthorizationStatus
): EnvironmentalBlockerResult {
  const nonBlockingStatuses: AuthorizationStatus[] = [
    'authorized',
    'authorized_with_conditions',
  ];

  if (nonBlockingStatuses.includes(authorizationStatus)) {
    return {
      isBlocker: false,
      reason: '',
    };
  }

  return {
    isBlocker: true,
    reason: `Environmental authorization status is "${authorizationStatus}". Construction phase advancement requires authorization status of "authorized" or "authorized_with_conditions".`,
  };
}

// ─── writeAuditEntry ─────────────────────────────────────────────────────────

/**
 * Creates an audit trail entry for an EIA action.
 * Returns the structured EIAAuditEntry object.
 * Actual persistence is handled by the wiring layer (Firestore write).
 *
 * Requirement 12.6: Produce audit trail record for each significant action.
 */
export function writeAuditEntry(
  action: string,
  actorId: string,
  projectId: string,
  outcome: string,
  metadata?: Record<string, unknown>
): EIAAuditEntry {
  return {
    id: generateId('eia_aud'),
    action,
    actorId,
    projectId,
    timestamp: new Date().toISOString(),
    outcome,
    ...(metadata !== undefined ? { metadata } : {}),
  };
}
