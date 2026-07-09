/**
 * Practice Management → Audit Trail Adapter
 *
 * Provides factory functions for creating PracticeAuditEvent records for all
 * state-changing operations in the practice management module. Also logs
 * access violations for role-based access control enforcement.
 *
 * Key behaviours:
 * - Factory functions emit typed PracticeAuditEvent for each action category
 * - Access violations are logged with full context (userId, attempted action, role)
 * - All events include firmId, userId, timestamp, entityType, and entityId
 * - Never throws — audit failures are logged to console for observability
 *
 * Requirements: 14.5, 15.4
 *
 * @module practiceManagement/adapters/auditAdapter
 */

import type { PracticeAuditAction, PracticeAuditEvent } from '@/services/practiceManagement/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique audit event ID. */
function generateAuditId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `pma-${ts}-${rand}`;
}

/** Create an ISO timestamp for the current moment. */
function now(): string {
  return new Date().toISOString();
}

// ── Core Factory ────────────────────────────────────────────────────────────

/**
 * Create a PracticeAuditEvent with common fields populated.
 * All factory functions delegate to this helper.
 */
export function createAuditEvent(params: {
  firmId: string;
  userId: string;
  action: PracticeAuditAction;
  entityType: string;
  entityId: string;
  projectId?: string;
  details?: Record<string, unknown>;
}): PracticeAuditEvent {
  return {
    id: generateAuditId(),
    firmId: params.firmId,
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    projectId: params.projectId,
    details: params.details ?? {},
    timestamp: now(),
  };
}

// ── Timesheet Audit Events ──────────────────────────────────────────────────

/** Emit audit event when a weekly timesheet is submitted for approval. */
export function createTimesheetSubmittedEvent(params: {
  firmId: string;
  userId: string;
  submissionId: string;
  projectId?: string;
  weekStartDate: string;
  totalHours: number;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'timesheet_submitted',
    entityType: 'timesheet_submission',
    entityId: params.submissionId,
    projectId: params.projectId,
    details: {
      weekStartDate: params.weekStartDate,
      totalHours: params.totalHours,
    },
  });
}

/** Emit audit event when a timesheet submission is approved. */
export function createTimesheetApprovedEvent(params: {
  firmId: string;
  userId: string;
  submissionId: string;
  projectId?: string;
  approvedUserId: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'timesheet_approved',
    entityType: 'timesheet_submission',
    entityId: params.submissionId,
    projectId: params.projectId,
    details: {
      approvedUserId: params.approvedUserId,
    },
  });
}

/** Emit audit event when a timesheet submission is rejected. */
export function createTimesheetRejectedEvent(params: {
  firmId: string;
  userId: string;
  submissionId: string;
  projectId?: string;
  rejectedUserId: string;
  reason: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'timesheet_rejected',
    entityType: 'timesheet_submission',
    entityId: params.submissionId,
    projectId: params.projectId,
    details: {
      rejectedUserId: params.rejectedUserId,
      reason: params.reason,
    },
  });
}

// ── Expense Audit Events ────────────────────────────────────────────────────

/** Emit audit event when an expense claim is submitted for approval. */
export function createExpenseSubmittedEvent(params: {
  firmId: string;
  userId: string;
  claimId: string;
  projectId: string;
  amountCents: number;
  category: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'expense_submitted',
    entityType: 'expense_claim',
    entityId: params.claimId,
    projectId: params.projectId,
    details: {
      amountCents: params.amountCents,
      category: params.category,
    },
  });
}

/** Emit audit event when an expense claim is approved. */
export function createExpenseApprovedEvent(params: {
  firmId: string;
  userId: string;
  claimId: string;
  projectId: string;
  approvedUserId: string;
  amountCents: number;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'expense_approved',
    entityType: 'expense_claim',
    entityId: params.claimId,
    projectId: params.projectId,
    details: {
      approvedUserId: params.approvedUserId,
      amountCents: params.amountCents,
    },
  });
}

/** Emit audit event when an expense claim is rejected. */
export function createExpenseRejectedEvent(params: {
  firmId: string;
  userId: string;
  claimId: string;
  projectId: string;
  rejectedUserId: string;
  reason: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'expense_rejected',
    entityType: 'expense_claim',
    entityId: params.claimId,
    projectId: params.projectId,
    details: {
      rejectedUserId: params.rejectedUserId,
      reason: params.reason,
    },
  });
}

// ── Invoice Audit Events ────────────────────────────────────────────────────

/** Emit audit event when a practice invoice is created. */
export function createInvoiceCreatedEvent(params: {
  firmId: string;
  userId: string;
  invoiceId: string;
  projectId: string;
  invoiceType: string;
  amountCents: number;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'invoice_created',
    entityType: 'practice_invoice',
    entityId: params.invoiceId,
    projectId: params.projectId,
    details: {
      invoiceType: params.invoiceType,
      amountCents: params.amountCents,
    },
  });
}

/** Emit audit event when a practice invoice status changes. */
export function createInvoiceStatusChangedEvent(params: {
  firmId: string;
  userId: string;
  invoiceId: string;
  projectId: string;
  previousStatus: string;
  newStatus: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'invoice_status_changed',
    entityType: 'practice_invoice',
    entityId: params.invoiceId,
    projectId: params.projectId,
    details: {
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
    },
  });
}

// ── Leave Audit Events ──────────────────────────────────────────────────────

/** Emit audit event when a leave request is submitted. */
export function createLeaveRequestedEvent(params: {
  firmId: string;
  userId: string;
  requestId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  workingDays: number;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'leave_requested',
    entityType: 'leave_request',
    entityId: params.requestId,
    details: {
      leaveType: params.leaveType,
      startDate: params.startDate,
      endDate: params.endDate,
      workingDays: params.workingDays,
    },
  });
}

/** Emit audit event when a leave request is approved. */
export function createLeaveApprovedEvent(params: {
  firmId: string;
  userId: string;
  requestId: string;
  approvedUserId: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'leave_approved',
    entityType: 'leave_request',
    entityId: params.requestId,
    details: {
      approvedUserId: params.approvedUserId,
    },
  });
}

/** Emit audit event when a leave request is rejected. */
export function createLeaveRejectedEvent(params: {
  firmId: string;
  userId: string;
  requestId: string;
  rejectedUserId: string;
  reason: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'leave_rejected',
    entityType: 'leave_request',
    entityId: params.requestId,
    details: {
      rejectedUserId: params.rejectedUserId,
      reason: params.reason,
    },
  });
}

// ── Write-Off Audit Events ──────────────────────────────────────────────────

/** Emit audit event when a write-off is created. */
export function createWriteOffCreatedEvent(params: {
  firmId: string;
  userId: string;
  writeOffId: string;
  projectId: string;
  amountCents: number;
  reason: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'write_off_created',
    entityType: 'write_off',
    entityId: params.writeOffId,
    projectId: params.projectId,
    details: {
      amountCents: params.amountCents,
      reason: params.reason,
    },
  });
}

/** Emit audit event when a write-off is reversed. */
export function createWriteOffReversedEvent(params: {
  firmId: string;
  userId: string;
  writeOffId: string;
  projectId: string;
  originalWriteOffId: string;
  reason: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'write_off_reversed',
    entityType: 'write_off',
    entityId: params.writeOffId,
    projectId: params.projectId,
    details: {
      originalWriteOffId: params.originalWriteOffId,
      reason: params.reason,
    },
  });
}

// ── Billing Rate Audit Events ───────────────────────────────────────────────

/** Emit audit event when a billing rate is created. */
export function createRateCreatedEvent(params: {
  firmId: string;
  userId: string;
  rateId: string;
  role: string;
  rateType: string;
  rateCents: number;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'rate_created',
    entityType: 'billing_rate',
    entityId: params.rateId,
    details: {
      role: params.role,
      rateType: params.rateType,
      rateCents: params.rateCents,
    },
  });
}

/** Emit audit event when a billing rate is updated. */
export function createRateUpdatedEvent(params: {
  firmId: string;
  userId: string;
  rateId: string;
  changes: Record<string, unknown>;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'rate_updated',
    entityType: 'billing_rate',
    entityId: params.rateId,
    details: {
      changes: params.changes,
    },
  });
}

// ── Fee Tracker Audit Events ────────────────────────────────────────────────

/** Emit audit event when a project fee structure is defined. */
export function createFeeDefinedEvent(params: {
  firmId: string;
  userId: string;
  feeStructureId: string;
  projectId: string;
  totalAgreedFeeCents: number;
  feeBasis: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'fee_defined',
    entityType: 'fee_structure',
    entityId: params.feeStructureId,
    projectId: params.projectId,
    details: {
      totalAgreedFeeCents: params.totalAgreedFeeCents,
      feeBasis: params.feeBasis,
    },
  });
}

/** Emit audit event when a project fee structure is updated. */
export function createFeeUpdatedEvent(params: {
  firmId: string;
  userId: string;
  feeStructureId: string;
  projectId: string;
  changes: Record<string, unknown>;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'fee_updated',
    entityType: 'fee_structure',
    entityId: params.feeStructureId,
    projectId: params.projectId,
    details: {
      changes: params.changes,
    },
  });
}

// ── Pipeline Audit Events ───────────────────────────────────────────────────

/** Emit audit event when a pipeline opportunity is created. */
export function createPipelineCreatedEvent(params: {
  firmId: string;
  userId: string;
  opportunityId: string;
  projectId: string;
  estimatedFeeCents: number;
  probability: number;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'pipeline_created',
    entityType: 'pipeline_opportunity',
    entityId: params.opportunityId,
    projectId: params.projectId,
    details: {
      estimatedFeeCents: params.estimatedFeeCents,
      probability: params.probability,
    },
  });
}

/** Emit audit event when a pipeline opportunity is won. */
export function createPipelineWonEvent(params: {
  firmId: string;
  userId: string;
  opportunityId: string;
  projectId: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'pipeline_won',
    entityType: 'pipeline_opportunity',
    entityId: params.opportunityId,
    projectId: params.projectId,
  });
}

/** Emit audit event when a pipeline opportunity is lost. */
export function createPipelineLostEvent(params: {
  firmId: string;
  userId: string;
  opportunityId: string;
  projectId: string;
  reason: string;
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'pipeline_lost',
    entityType: 'pipeline_opportunity',
    entityId: params.opportunityId,
    projectId: params.projectId,
    details: {
      reason: params.reason,
    },
  });
}

// ── Access Violation Logging ────────────────────────────────────────────────

/**
 * Log an access violation when a user attempts to access or modify data
 * outside their role scope. This is the enforcement point for Requirement 14.5:
 * "prevent users from viewing or modifying data outside their role scope and
 * log access violations in the audit trail."
 */
export function createAccessViolationEvent(params: {
  firmId: string;
  userId: string;
  attemptedAction: string;
  resourceType: string;
  resourceId: string;
  projectId?: string;
  userRole: string;
  requiredRoles: string[];
}): PracticeAuditEvent {
  return createAuditEvent({
    firmId: params.firmId,
    userId: params.userId,
    action: 'access_violation',
    entityType: params.resourceType,
    entityId: params.resourceId,
    projectId: params.projectId,
    details: {
      attemptedAction: params.attemptedAction,
      userRole: params.userRole,
      requiredRoles: params.requiredRoles,
    },
  });
}
