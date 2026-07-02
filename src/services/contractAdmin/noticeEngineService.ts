/**
 * Contract Administration — Notice Engine Service
 *
 * Manages the full lifecycle of contractual notices:
 * registration, deadline calculation, state transitions,
 * deadline checking, warning generation, and deemed outcomes.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import type {
  NoticeRegistrationInput,
  NoticeRecord,
  NoticeStatus,
  NoticeResponse,
  DeadlineCheckResult,
  ContractAuditRecord,
  ContractWorkflowEvent,
  ContractProjectAssignment,
  ContractError,
  PublicHoliday,
} from './contractTypes';
import {
  getClauseResponsePeriod,
  getFormConfig,
  type DayType,
  type DeemedOutcome,
} from './contractFormConfigs';
import {
  addWorkingDays,
  getRemainingWorkingDays,
  getSouthAfricanHolidays,
  getNextWorkingDay,
} from './workingDayCalculator';
import { assertAccess } from './contractRbacService';
import {
  writeToAuditTrail,
  surfaceToActionCentre,
  createRiskEvent,
} from './contractIntegrationService';
import { adminDb } from '@/lib/firebase-admin';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** Terminal statuses — no further transitions or warnings allowed */
const TERMINAL_STATUSES: NoticeStatus[] = ['responded', 'expired', 'withdrawn'];

/** Warning thresholds in working days */
const WARNING_THRESHOLDS = [7, 3, 1] as const;

/** Notice state machine: permitted transitions */
const NOTICE_TRANSITIONS: Record<NoticeStatus, NoticeStatus[]> = {
  issued: ['acknowledged', 'responded', 'expired', 'withdrawn'],
  acknowledged: ['responded', 'expired'],
  responded: [],
  expired: [],
  withdrawn: [],
};

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Get current ISO timestamp */
function nowIso(): string {
  return new Date().toISOString();
}

/** Get current ISO date (YYYY-MM-DD) */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Generate a unique ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/** Check if a transition is valid */
function isValidTransition(from: NoticeStatus, to: NoticeStatus): boolean {
  return NOTICE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Add calendar days to an ISO date string */
function addCalendarDays(startDate: string, days: number): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const ry = date.getFullYear();
  const rm = String(date.getMonth() + 1).padStart(2, '0');
  const rd = String(date.getDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

/** Determine warning level from remaining days */
function getWarningLevel(remainingDays: number): 'info' | 'urgent' | 'critical' | undefined {
  if (remainingDays <= 1) return 'critical';
  if (remainingDays <= 3) return 'urgent';
  if (remainingDays <= 7) return 'info';
  return undefined;
}

/** Get holidays for relevant years given a date range */
function getHolidaysForRange(startDate: string, endDate?: string): PublicHoliday[] {
  const startYear = parseInt(startDate.split('-')[0], 10);
  const endYear = endDate ? parseInt(endDate.split('-')[0], 10) : startYear + 1;
  const holidays: PublicHoliday[] = [];
  for (let y = startYear; y <= endYear; y++) {
    holidays.push(...getSouthAfricanHolidays(y));
  }
  return holidays;
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate the deadline date based on date issued, response period, and day type.
 *
 * - For working days: uses addWorkingDays (excludes weekends + holidays)
 * - For calendar days: adds calendar days, adjusting to next working day if result is non-working
 *
 * @param dateIssued - ISO date string of the notice issue date
 * @param responsePeriodDays - Number of days for the response period
 * @param dayType - Whether to count working or calendar days
 * @param holidays - Array of PublicHoliday entries
 * @returns ISO date string of the calculated deadline
 */
export function calculateDeadline(
  dateIssued: string,
  responsePeriodDays: number,
  dayType: DayType,
  holidays: PublicHoliday[]
): string {
  if (dayType === 'working') {
    return addWorkingDays(dateIssued, responsePeriodDays, holidays);
  }

  // Calendar day calculation: add exact calendar days
  const rawDeadline = addCalendarDays(dateIssued, responsePeriodDays);
  // If result falls on a non-working day, move to next working day
  return getNextWorkingDay(rawDeadline, holidays);
}

/**
 * Register a new contractual notice.
 *
 * Validates input (subject max 500 chars, 0–20 linked docs), looks up clause
 * response period from form config, calculates deadline if available, persists
 * the notice record, creates an audit record, and returns an action centre event.
 *
 * @param input - The notice registration input
 * @param projectAssignment - The registrant's project assignment (for RBAC)
 * @returns Object containing the notice record, audit record, and action centre event
 */
export async function registerNotice(
  input: NoticeRegistrationInput,
  projectAssignment: ContractProjectAssignment
): Promise<{
  notice: NoticeRecord;
  auditRecord: ContractAuditRecord;
  actionCentreEvent: ContractWorkflowEvent;
}> {
  // RBAC check
  assertAccess(
    projectAssignment.roles,
    'notices',
    'write',
    projectAssignment
  );

  // Validate input
  const errors: string[] = [];

  if (!input.subject || input.subject.trim().length === 0) {
    errors.push('subject');
  } else if (input.subject.length > 500) {
    errors.push('subject');
  }

  if (input.linkedDocumentIds.length > 20) {
    errors.push('linkedDocumentIds');
  }

  if (!input.projectId) errors.push('projectId');
  if (!input.noticeType) errors.push('noticeType');
  if (!input.issuingPartyId) errors.push('issuingPartyId');
  if (!input.receivingPartyId) errors.push('receivingPartyId');
  if (!input.referenceClause) errors.push('referenceClause');
  if (!input.dateIssued) errors.push('dateIssued');
  if (!input.registeredBy) errors.push('registeredBy');

  if (errors.length > 0) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Notice registration failed: invalid or missing fields.`,
      details: { invalidFields: errors },
    };
    throw error;
  }

  // Look up contract config to determine clause response period
  const configDoc = await adminDb
    .collection(`projects/${input.projectId}/contractConfig`)
    .doc('config')
    .get();

  let deadline: string | undefined;
  let deadlineDayType: DayType | undefined;
  let responsePeriodDays: number | undefined;
  let deemedOutcome: DeemedOutcome | undefined;

  if (configDoc.exists) {
    const contractConfig = configDoc.data();
    if (contractConfig?.contractForm) {
      const clauseConfig = getClauseResponsePeriod(
        contractConfig.contractForm,
        input.referenceClause
      );

      if (clauseConfig) {
        responsePeriodDays = clauseConfig.responsePeriodDays;
        deadlineDayType = clauseConfig.dayType;
        deemedOutcome = clauseConfig.deemedOutcome;

        const holidays = getHolidaysForRange(input.dateIssued);
        deadline = calculateDeadline(
          input.dateIssued,
          clauseConfig.responsePeriodDays,
          clauseConfig.dayType,
          holidays
        );
      }
    }
  }

  // Build notice record
  const noticeId = generateId();
  const now = nowIso();

  const notice: NoticeRecord = {
    id: noticeId,
    projectId: input.projectId,
    noticeType: input.noticeType,
    issuingPartyId: input.issuingPartyId,
    receivingPartyId: input.receivingPartyId,
    referenceClause: input.referenceClause,
    dateIssued: input.dateIssued,
    subject: input.subject,
    linkedDocumentIds: input.linkedDocumentIds,
    status: 'issued',
    deadline,
    deadlineDayType,
    responsePeriodDays,
    deemedOutcome: deemedOutcome !== undefined ? deemedOutcome : undefined,
    registeredBy: input.registeredBy,
    createdAt: now,
    updatedAt: now,
  };

  // Persist to Firestore
  await adminDb
    .collection(`projects/${input.projectId}/contractNotices`)
    .doc(noticeId)
    .set(notice);

  // Create audit record and write via integration service (Requirement 10.6)
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId: input.projectId,
    entityType: 'notice',
    entityId: noticeId,
    action: 'notice_registered',
    newValue: {
      noticeType: input.noticeType,
      issuingPartyId: input.issuingPartyId,
      receivingPartyId: input.receivingPartyId,
      referenceClause: input.referenceClause,
      dateIssued: input.dateIssued,
      deadline,
    },
    clauseReference: input.referenceClause,
    actorId: input.registeredBy,
    timestamp: now,
  };

  await writeToAuditTrail(input.projectId, auditRecord);

  // Create action centre event for receiving party and surface via integration service (Requirement 10.5)
  const actionCentreEvent: ContractWorkflowEvent = {
    projectId: input.projectId,
    targetUserId: input.receivingPartyId,
    priority: deadline ? 'high' : 'normal',
    deadlineDate: deadline,
    clauseReference: input.referenceClause,
    requiredResponseType: 'notice_response',
    remainingDays: undefined,
    subject: `Notice: ${input.subject}`,
    entityType: 'notice',
    entityId: noticeId,
  };

  await surfaceToActionCentre(actionCentreEvent);

  return { notice, auditRecord, actionCentreEvent };
}

/**
 * Acknowledge receipt of a notice (receiving party confirms receipt).
 *
 * Transitions notice from 'issued' → 'acknowledged'.
 */
export async function acknowledgeNotice(
  projectId: string,
  noticeId: string,
  userId: string,
  projectAssignment: ContractProjectAssignment
): Promise<{ auditRecord: ContractAuditRecord }> {
  assertAccess(projectAssignment.roles, 'notices', 'write', projectAssignment);

  const noticeRef = adminDb
    .collection(`projects/${projectId}/contractNotices`)
    .doc(noticeId);
  const doc = await noticeRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Notice ${noticeId} not found.`,
      details: { invalidFields: ['noticeId'] },
    };
    throw error;
  }

  const notice = doc.data() as NoticeRecord;

  if (!isValidTransition(notice.status, 'acknowledged')) {
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot acknowledge notice in status '${notice.status}'.`,
      details: {
        currentStatus: notice.status,
        attemptedStatus: 'acknowledged',
        permittedTransitions: NOTICE_TRANSITIONS[notice.status],
      },
    };
    throw error;
  }

  const now = nowIso();
  await noticeRef.update({
    status: 'acknowledged',
    updatedAt: now,
  });

  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'notice',
    entityId: noticeId,
    action: 'notice_acknowledged',
    previousValue: { status: notice.status },
    newValue: { status: 'acknowledged' },
    clauseReference: notice.referenceClause,
    actorId: userId,
    timestamp: now,
  };

  // Write via integration service with retry (Requirement 10.6)
  await writeToAuditTrail(projectId, auditRecord);

  return { auditRecord };
}

/**
 * Submit a formal response to a notice.
 *
 * Transitions notice to 'responded', cancelling any future warnings.
 */
export async function respondToNotice(
  projectId: string,
  noticeId: string,
  responseData: NoticeResponse,
  projectAssignment: ContractProjectAssignment
): Promise<{ auditRecord: ContractAuditRecord }> {
  assertAccess(projectAssignment.roles, 'notices', 'write', projectAssignment);

  const noticeRef = adminDb
    .collection(`projects/${projectId}/contractNotices`)
    .doc(noticeId);
  const doc = await noticeRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Notice ${noticeId} not found.`,
      details: { invalidFields: ['noticeId'] },
    };
    throw error;
  }

  const notice = doc.data() as NoticeRecord;

  if (!isValidTransition(notice.status, 'responded')) {
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot respond to notice in status '${notice.status}'.`,
      details: {
        currentStatus: notice.status,
        attemptedStatus: 'responded',
        permittedTransitions: NOTICE_TRANSITIONS[notice.status],
      },
    };
    throw error;
  }

  const now = nowIso();
  await noticeRef.update({
    status: 'responded',
    respondedAt: responseData.responseDate,
    respondedBy: responseData.respondedBy,
    updatedAt: now,
  });

  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'notice',
    entityId: noticeId,
    action: 'notice_responded',
    previousValue: { status: notice.status },
    newValue: {
      status: 'responded',
      responseType: responseData.responseType,
      responseDate: responseData.responseDate,
    },
    clauseReference: notice.referenceClause,
    actorId: responseData.respondedBy,
    timestamp: now,
  };

  // Write via integration service with retry (Requirement 10.6)
  await writeToAuditTrail(projectId, auditRecord);

  return { auditRecord };
}

/**
 * Withdraw a notice (issuing party cancels).
 *
 * Transitions notice to 'withdrawn', cancelling any future warnings.
 */
export async function withdrawNotice(
  projectId: string,
  noticeId: string,
  userId: string,
  projectAssignment: ContractProjectAssignment
): Promise<{ auditRecord: ContractAuditRecord }> {
  assertAccess(projectAssignment.roles, 'notices', 'write', projectAssignment);

  const noticeRef = adminDb
    .collection(`projects/${projectId}/contractNotices`)
    .doc(noticeId);
  const doc = await noticeRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Notice ${noticeId} not found.`,
      details: { invalidFields: ['noticeId'] },
    };
    throw error;
  }

  const notice = doc.data() as NoticeRecord;

  if (!isValidTransition(notice.status, 'withdrawn')) {
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot withdraw notice in status '${notice.status}'.`,
      details: {
        currentStatus: notice.status,
        attemptedStatus: 'withdrawn',
        permittedTransitions: NOTICE_TRANSITIONS[notice.status],
      },
    };
    throw error;
  }

  const now = nowIso();
  await noticeRef.update({
    status: 'withdrawn',
    withdrawnAt: now,
    withdrawnBy: userId,
    updatedAt: now,
  });

  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'notice',
    entityId: noticeId,
    action: 'notice_withdrawn',
    previousValue: { status: notice.status },
    newValue: { status: 'withdrawn' },
    clauseReference: notice.referenceClause,
    actorId: userId,
    timestamp: now,
  };

  // Write via integration service with retry (Requirement 10.6)
  await writeToAuditTrail(projectId, auditRecord);

  return { auditRecord };
}

/**
 * Get all active (non-terminal) notices for a project.
 *
 * Returns notices with status 'issued' or 'acknowledged'.
 */
export async function getActiveNotices(projectId: string): Promise<NoticeRecord[]> {
  const snapshot = await adminDb
    .collection(`projects/${projectId}/contractNotices`)
    .where('status', 'in', ['issued', 'acknowledged'])
    .get();

  return snapshot.docs.map((doc) => doc.data() as NoticeRecord);
}

/**
 * Run a deadline check for all active notices in a project.
 *
 * Calculates remaining working days for each active notice with a deadline.
 * Generates warnings at 7, 3, 1 working day thresholds (exactly one per
 * threshold per entity — tracked via `generatedWarnings` field).
 * Applies deemed outcome on expiry.
 *
 * @returns Array of deadline check results with optional warnings
 */
export async function runDeadlineCheck(
  projectId: string
): Promise<{
  results: DeadlineCheckResult[];
  warnings: ContractWorkflowEvent[];
  auditRecords: ContractAuditRecord[];
}> {
  const activeNotices = await getActiveNotices(projectId);
  const today = todayIso();
  const holidays = getHolidaysForRange(today);

  const results: DeadlineCheckResult[] = [];
  const warnings: ContractWorkflowEvent[] = [];
  const auditRecords: ContractAuditRecord[] = [];

  for (const notice of activeNotices) {
    if (!notice.deadline) {
      // No deadline configured — include in results without warning
      results.push({
        noticeId: notice.id,
        subject: notice.subject,
        deadline: '',
        remainingWorkingDays: -1,
        status: notice.status,
        warningLevel: undefined,
      });
      continue;
    }

    const remainingDays = getRemainingWorkingDays(today, notice.deadline, holidays);

    // Check for expiry
    if (remainingDays <= 0) {
      // Deadline has passed — apply deemed outcome
      const { auditRecord } = await applyDeemedOutcome(projectId, notice);
      if (auditRecord) {
        auditRecords.push(auditRecord);
      }

      // Create risk event for deadline miss (Requirement 10.8)
      await createRiskEvent(projectId, {
        entityType: 'notice',
        entityId: notice.id,
        severity: 'deemed_acceptance',
        description: `Notice deadline missed: ${notice.subject}`,
        clauseReference: notice.referenceClause,
        deadlineMissedDate: notice.deadline,
      });

      results.push({
        noticeId: notice.id,
        subject: notice.subject,
        deadline: notice.deadline,
        remainingWorkingDays: 0,
        status: 'expired',
        warningLevel: 'critical',
      });
      continue;
    }

    // Check warning thresholds
    const warningLevel = getWarningLevel(remainingDays);

    // Generate warnings at exact thresholds (only if not already generated)
    const noticeRef = adminDb
      .collection(`projects/${projectId}/contractNotices`)
      .doc(notice.id);
    const currentDoc = await noticeRef.get();
    const currentData = currentDoc.data() as NoticeRecord & { generatedWarnings?: number[] };
    const generatedWarnings: number[] = currentData?.generatedWarnings ?? [];

    for (const threshold of WARNING_THRESHOLDS) {
      if (remainingDays <= threshold && !generatedWarnings.includes(threshold)) {
        // Generate warning for this threshold
        const priority = threshold === 1 ? 'high' : 'normal';
        const warning: ContractWorkflowEvent = {
          projectId,
          targetUserId: notice.receivingPartyId,
          priority,
          deadlineDate: notice.deadline,
          clauseReference: notice.referenceClause,
          requiredResponseType: 'notice_response',
          remainingDays,
          subject: `Deadline warning (${threshold} working day${threshold > 1 ? 's' : ''} remaining): ${notice.subject}`,
          entityType: 'notice',
          entityId: notice.id,
        };
        warnings.push(warning);

        // Surface warning via integration service (Requirement 10.5)
        await surfaceToActionCentre(warning);

        // Track that this threshold warning has been generated
        generatedWarnings.push(threshold);
      }
    }

    // Update the notice with generated warnings tracking
    if (generatedWarnings.length > (currentData?.generatedWarnings?.length ?? 0)) {
      await noticeRef.update({ generatedWarnings });
    }

    results.push({
      noticeId: notice.id,
      subject: notice.subject,
      deadline: notice.deadline,
      remainingWorkingDays: remainingDays,
      status: notice.status,
      warningLevel,
    });
  }

  return { results, warnings, auditRecords };
}

// ══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply deemed outcome when a notice expires.
 *
 * If the contract form/clause has a configured deemed outcome (acceptance or
 * rejection), sets the notice status to 'expired' with that outcome recorded.
 * If no deemed outcome is configured, marks as expired with null outcome.
 */
async function applyDeemedOutcome(
  projectId: string,
  notice: NoticeRecord
): Promise<{ auditRecord: ContractAuditRecord | null }> {
  const noticeRef = adminDb
    .collection(`projects/${projectId}/contractNotices`)
    .doc(notice.id);

  const now = nowIso();

  // The deemed outcome is already stored on the notice record from registration
  const outcome = notice.deemedOutcome ?? null;

  await noticeRef.update({
    status: 'expired',
    deemedOutcome: outcome,
    updatedAt: now,
  });

  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'notice',
    entityId: notice.id,
    action: outcome
      ? `notice_expired_deemed_${outcome}`
      : 'notice_expired_no_deemed_outcome',
    previousValue: { status: notice.status },
    newValue: { status: 'expired', deemedOutcome: outcome },
    clauseReference: notice.referenceClause,
    actorId: 'system',
    timestamp: now,
  };

  // Write via integration service with retry (Requirement 10.6)
  await writeToAuditTrail(projectId, auditRecord);

  return { auditRecord };
}
