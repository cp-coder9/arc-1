/**
 * Practice Management — Audit Trail Adapter
 *
 * Firm-scoped audit trail integration for the Practice Management module.
 * Writes AuditEvent records scoped to the firm entity (firmId). Uses
 * dependency injection for persistence — no direct Firestore imports.
 *
 * Graceful degradation: audit trail writes should NEVER break main
 * operations. On failure, logs a warning and returns a failure result.
 *
 * Requirements: 8.8, 9.5, 13.8
 */

import type { AuditEvent } from '../../p2-shared/types';

// ─── Service Result ───────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Dependency Injection ─────────────────────────────────────────────────────

/** Injected persistence callback — writes the audit event and returns the stored ID */
export type PersistAuditEvent = (event: AuditEvent) => Promise<string>;

/** Logger dependency for graceful degradation warnings */
export interface Logger {
  warn: (message: string, context?: Record<string, unknown>) => void;
}

const defaultLogger: Logger = {
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(`[practice-management:auditTrail] ${message}`, context ?? '');
  },
};

// ─── Audit Event Input Types ──────────────────────────────────────────────────

/**
 * Input for recording an audit event. `id` and `timestamp` are generated
 * if not supplied.
 */
export interface AuditEventInput {
  firmId: string;
  eventType: string;
  actorId: string;
  actorDisplayName: string;
  metadata: Record<string, unknown>;
  id?: string;
  timestamp?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `pm_audit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function generateTimestamp(): string {
  return new Date().toISOString();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Records an enquiry stage transition in the firm audit trail.
 *
 * Requirement: 8.8 — all stage transitions recorded with enquiry reference,
 * previous stage, new stage, actor identity, and timestamp.
 */
export async function recordEnquiryTransition(
  input: {
    firmId: string;
    enquiryId: string;
    previousStage: string;
    newStage: string;
    actorId: string;
    actorDisplayName: string;
    lossReason?: string;
    notes?: string;
  },
  persist: PersistAuditEvent,
  logger: Logger = defaultLogger,
): Promise<ServiceResult<AuditEvent>> {
  const event: AuditEvent = {
    id: generateId(),
    entityType: 'firm',
    entityId: input.firmId,
    eventType: 'enquiry_stage_transition',
    actorId: input.actorId,
    actorDisplayName: input.actorDisplayName,
    metadata: {
      enquiryId: input.enquiryId,
      previousStage: input.previousStage,
      newStage: input.newStage,
      ...(input.lossReason && { lossReason: input.lossReason }),
      ...(input.notes && { notes: input.notes }),
    },
    timestamp: generateTimestamp(),
  };

  return persistEvent(event, persist, logger);
}

/**
 * Records a WIP adjustment (write-down) in the firm audit trail.
 *
 * Requirement: 9.5 — WIP budget alerts are tracked; manual adjustments
 * captured with amount, reason, actor, and date.
 */
export async function recordWIPAdjustment(
  input: {
    firmId: string;
    projectId: string;
    adjustmentAmountZAR: number;
    reason: string;
    actorId: string;
    actorDisplayName: string;
  },
  persist: PersistAuditEvent,
  logger: Logger = defaultLogger,
): Promise<ServiceResult<AuditEvent>> {
  const event: AuditEvent = {
    id: generateId(),
    entityType: 'firm',
    entityId: input.firmId,
    eventType: 'wip_adjustment',
    actorId: input.actorId,
    actorDisplayName: input.actorDisplayName,
    metadata: {
      projectId: input.projectId,
      adjustmentAmountZAR: input.adjustmentAmountZAR,
      reason: input.reason,
    },
    timestamp: generateTimestamp(),
  };

  return persistEvent(event, persist, logger);
}

/**
 * Records a compliance record change (PI insurance or registration update)
 * in the firm audit trail.
 *
 * Requirement: 13.8 — all compliance record changes logged with staff member,
 * field changed, old/new values, actor, and timestamp.
 */
export async function recordComplianceChange(
  input: {
    firmId: string;
    staffId: string;
    staffDisplayName: string;
    fieldChanged: string;
    oldValue: unknown;
    newValue: unknown;
    actorId: string;
    actorDisplayName: string;
  },
  persist: PersistAuditEvent,
  logger: Logger = defaultLogger,
): Promise<ServiceResult<AuditEvent>> {
  const event: AuditEvent = {
    id: generateId(),
    entityType: 'firm',
    entityId: input.firmId,
    eventType: 'compliance_record_change',
    actorId: input.actorId,
    actorDisplayName: input.actorDisplayName,
    metadata: {
      staffId: input.staffId,
      staffDisplayName: input.staffDisplayName,
      fieldChanged: input.fieldChanged,
      oldValue: input.oldValue,
      newValue: input.newValue,
    },
    timestamp: generateTimestamp(),
  };

  return persistEvent(event, persist, logger);
}

/**
 * Records a generic practice management audit event in the firm trail.
 * Use for events not covered by specialised functions above.
 */
export async function recordPracticeEvent(
  input: AuditEventInput,
  persist: PersistAuditEvent,
  logger: Logger = defaultLogger,
): Promise<ServiceResult<AuditEvent>> {
  const event: AuditEvent = {
    id: input.id || generateId(),
    entityType: 'firm',
    entityId: input.firmId,
    eventType: input.eventType,
    actorId: input.actorId,
    actorDisplayName: input.actorDisplayName,
    metadata: input.metadata,
    timestamp: input.timestamp || generateTimestamp(),
  };

  return persistEvent(event, persist, logger);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Persists an audit event with graceful degradation.
 * Never throws — returns a failure ServiceResult on error.
 */
async function persistEvent(
  event: AuditEvent,
  persist: PersistAuditEvent,
  logger: Logger,
): Promise<ServiceResult<AuditEvent>> {
  try {
    await persist(event);
    return { success: true, data: event };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown persistence error';
    logger.warn(`Failed to persist audit event: ${message}`, {
      eventType: event.eventType,
      entityId: event.entityId,
    });
    return {
      success: false,
      error: {
        code: 'PERSISTENCE_ERROR',
        message: 'Failed to record audit event — audit trail unavailable',
        details: { originalError: message },
      },
    };
  }
}
