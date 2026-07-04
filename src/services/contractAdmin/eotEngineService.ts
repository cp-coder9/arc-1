/**
 * Contract Administration — Extension of Time (EoT) Engine Service
 *
 * Manages the full lifecycle of Extension of Time claims:
 * creation, submission validation, review decisions, notification
 * deadline calculation, and revised completion date updates.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9
 */

import type {
  EoTClaimInput,
  EoTClaimRecord,
  EoTStatus,
  DelayCause,
  ContractAuditRecord,
  ContractWorkflowEvent,
  ContractConfig,
  ContractError,
  PublicHoliday,
  ContractForm,
} from './contractTypes';
import { getEoTNotificationRule } from './contractFormConfigs';
import {
  addWorkingDays,
  getRemainingWorkingDays,
  getSouthAfricanHolidays,
} from './workingDayCalculator';
import { assertAccess } from './contractRbacService';
import {
  writeToAuditTrail,
  writeToProjectPassport,
  surfaceToActionCentre,
} from './contractIntegrationService';
import type { ContractProjectAssignment } from './contractTypes';
import { adminDb } from '@/lib/firebase-admin';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** Valid delay cause categories (Requirement 6.1) */
const VALID_CAUSES: DelayCause[] = [
  'weather',
  'materials',
  'labour',
  'client',
  'professional',
  'contractor',
  'unforeseen_ground_conditions',
  'force_majeure',
];

/** EoT claim state machine: permitted transitions (Requirement 6.7) */
const EOT_TRANSITIONS: Record<EoTStatus, EoTStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review'],
  under_review: ['granted', 'partially_granted', 'rejected'],
  granted: [],
  partially_granted: [],
  rejected: [],
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

/** Validate an ISO date string format YYYY-MM-DD */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate the notification deadline for an EoT claim based on contract form.
 *
 * Uses the form's EoT notification rule (from contractFormConfigs) to determine
 * how many days the contractor has from the delay event date to notify.
 *
 * - For working day rules: uses addWorkingDays
 * - For calendar day rules: adds calendar days
 *
 * @param contractForm - The contract form in use
 * @param delayEventDate - ISO date of the delay event
 * @param holidays - Array of PublicHoliday entries
 * @returns Object containing the deadline date and remaining working days from today
 */
export function calculateNotificationDeadline(
  contractForm: ContractForm,
  delayEventDate: string,
  holidays: PublicHoliday[]
): { deadline: string; remainingDays: number } {
  const rule = getEoTNotificationRule(contractForm);

  let deadline: string;
  if (rule.dayType === 'working') {
    deadline = addWorkingDays(delayEventDate, rule.notificationPeriodDays, holidays);
  } else {
    deadline = addCalendarDays(delayEventDate, rule.notificationPeriodDays);
  }

  const today = todayIso();
  const remainingDays = getRemainingWorkingDays(today, deadline, holidays);

  return { deadline, remainingDays };
}

/**
 * Create a new Extension of Time claim in draft status.
 *
 * Auto-generates a unique claim reference in the format EOT-{projectId.substring(0,8)}-{seq}.
 * Persists to Firestore at `projects/{projectId}/contractEotClaims/{claimId}`.
 *
 * Requirement 6.1: captures all mandatory fields
 * Requirement 6.3: calculates notification deadline
 * Requirement 6.4: marks late submission if deadline has passed
 *
 * @param input - The EoT claim creation input
 * @returns Object containing the claim record and audit record
 */
export async function createEoTClaim(
  input: EoTClaimInput
): Promise<{
  claim: EoTClaimRecord;
  auditRecord: ContractAuditRecord;
}> {
  // Validate input fields
  const errors: string[] = [];

  if (!input.projectId) errors.push('projectId');
  if (!input.cause || !VALID_CAUSES.includes(input.cause)) errors.push('cause');
  if (
    !input.periodClaimedDays ||
    !Number.isInteger(input.periodClaimedDays) ||
    input.periodClaimedDays < 1 ||
    input.periodClaimedDays > 365
  ) {
    errors.push('periodClaimedDays');
  }
  if (!input.delayEventDate || !isValidIsoDate(input.delayEventDate)) {
    errors.push('delayEventDate');
  }
  if (!input.narrative || input.narrative.trim().length === 0) {
    errors.push('narrative');
  } else if (input.narrative.length > 2000) {
    errors.push('narrative');
  }
  if (!input.createdBy) errors.push('createdBy');

  if (errors.length > 0) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'EoT claim creation failed: invalid or missing fields.',
      details: { invalidFields: errors },
    };
    throw error;
  }

  // Generate sequential claim reference
  const existingClaimsSnapshot = await adminDb
    .collection(`projects/${input.projectId}/contractEotClaims`)
    .get();
  const sequenceNumber = existingClaimsSnapshot.size + 1;
  const projectPrefix = input.projectId.substring(0, 8).toUpperCase();
  const claimReference = `EOT-${projectPrefix}-${String(sequenceNumber).padStart(3, '0')}`;

  // Calculate notification deadline from contract config
  let notificationDeadline: string | undefined;
  let isLateSubmission = false;

  const configDoc = await adminDb
    .collection(`projects/${input.projectId}/contractConfig`)
    .doc('config')
    .get();

  if (configDoc.exists) {
    const contractConfig = configDoc.data() as ContractConfig;
    if (contractConfig?.contractForm) {
      const holidays = getHolidaysForRange(input.delayEventDate);
      const { deadline } = calculateNotificationDeadline(
        contractConfig.contractForm,
        input.delayEventDate,
        holidays
      );
      notificationDeadline = deadline;

      // Check if current date exceeds notification deadline (Requirement 6.4)
      const today = todayIso();
      if (today > deadline) {
        isLateSubmission = true;
      }
    }
  }

  // Build claim record
  const claimId = generateId();
  const now = nowIso();

  const claim: EoTClaimRecord = {
    id: claimId,
    projectId: input.projectId,
    claimReference,
    cause: input.cause,
    periodClaimedDays: input.periodClaimedDays,
    delayEventDate: input.delayEventDate,
    narrative: input.narrative,
    evidenceAttachments: input.evidenceAttachments || [],
    status: 'draft',
    notificationDeadline,
    isLateSubmission,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // Persist to Firestore
  await adminDb
    .collection(`projects/${input.projectId}/contractEotClaims`)
    .doc(claimId)
    .set(claim);

  // Create audit record via integration service (Requirement 10.6)
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId: input.projectId,
    entityType: 'eot',
    entityId: claimId,
    action: 'eot_claim_created',
    newValue: {
      claimReference,
      cause: input.cause,
      periodClaimedDays: input.periodClaimedDays,
      delayEventDate: input.delayEventDate,
      status: 'draft',
      isLateSubmission,
    },
    actorId: input.createdBy,
    timestamp: now,
  };

  await writeToAuditTrail(input.projectId, auditRecord);

  return { claim, auditRecord };
}

/**
 * Submit an EoT claim for review.
 *
 * Validates all mandatory fields before allowing submission (Requirement 6.5):
 * - cause (one of 8 categories)
 * - periodClaimedDays (1–365)
 * - delayEventDate (valid date)
 * - narrative (non-empty, max 2000)
 * - evidenceAttachments (min 1)
 *
 * Marks as late submission if notification deadline has passed (Requirement 6.4).
 * Surfaces Action Centre item for Principal Agent / Employer Agent (Requirement 6.6).
 *
 * @param projectId - The project ID
 * @param claimId - The claim ID to submit
 * @param submittedBy - User ID of the submitter
 * @returns Object containing audit record and action centre event
 */
export async function submitEoTClaim(
  projectId: string,
  claimId: string,
  submittedBy: string
): Promise<{
  auditRecord: ContractAuditRecord;
  actionCentreEvent: ContractWorkflowEvent;
}> {
  const claimRef = adminDb
    .collection(`projects/${projectId}/contractEotClaims`)
    .doc(claimId);
  const doc = await claimRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `EoT claim ${claimId} not found.`,
      details: { invalidFields: ['claimId'] },
    };
    throw error;
  }

  const claim = doc.data() as EoTClaimRecord;

  // Verify transition is valid
  if (!EOT_TRANSITIONS[claim.status]?.includes('submitted')) {
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot submit EoT claim in status '${claim.status}'.`,
      details: {
        currentStatus: claim.status,
        attemptedStatus: 'submitted',
        permittedTransitions: EOT_TRANSITIONS[claim.status],
      },
    };
    throw error;
  }

  // Validate all mandatory fields for submission (Requirement 6.5)
  const errors: string[] = [];

  if (!claim.cause || !VALID_CAUSES.includes(claim.cause)) {
    errors.push('cause');
  }
  if (
    !claim.periodClaimedDays ||
    claim.periodClaimedDays < 1 ||
    claim.periodClaimedDays > 365
  ) {
    errors.push('periodClaimedDays');
  }
  if (!claim.delayEventDate || !isValidIsoDate(claim.delayEventDate)) {
    errors.push('delayEventDate');
  }
  if (!claim.narrative || claim.narrative.trim().length === 0 || claim.narrative.length > 2000) {
    errors.push('narrative');
  }
  if (!claim.evidenceAttachments || claim.evidenceAttachments.length < 1) {
    errors.push('evidenceAttachments');
  }

  if (errors.length > 0) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'EoT claim submission failed: mandatory fields not satisfied.',
      details: { invalidFields: errors },
    };
    throw error;
  }

  // Check for late submission (Requirement 6.4)
  let isLateSubmission = claim.isLateSubmission;
  if (claim.notificationDeadline) {
    const today = todayIso();
    if (today > claim.notificationDeadline) {
      isLateSubmission = true;
    }
  }

  const now = nowIso();

  // Update claim status
  await claimRef.update({
    status: 'submitted',
    isLateSubmission,
    submittedAt: now,
    updatedAt: now,
  });

  // Create audit record via integration service (Requirement 10.6)
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'eot',
    entityId: claimId,
    action: 'eot_claim_submitted',
    previousValue: { status: claim.status },
    newValue: { status: 'submitted', isLateSubmission, submittedAt: now },
    actorId: submittedBy,
    timestamp: now,
  };

  await writeToAuditTrail(projectId, auditRecord);

  // Surface Action Centre item for Principal Agent / Employer Agent (Requirement 6.6)
  // Determine target user from contract parties
  let targetUserId = '';
  const configDoc = await adminDb
    .collection(`projects/${projectId}/contractConfig`)
    .doc('config')
    .get();

  if (configDoc.exists) {
    const contractConfig = configDoc.data() as ContractConfig;
    const principalAgent = contractConfig.parties.find(
      (p) => p.role === 'principal_agent' || p.role === 'employer_agent'
    );
    if (principalAgent) {
      targetUserId = principalAgent.userId || principalAgent.id;
    }
  }

  const actionCentreEvent: ContractWorkflowEvent = {
    projectId,
    targetUserId,
    priority: 'high',
    deadlineDate: undefined,
    clauseReference: claim.notificationDeadline
      ? undefined
      : undefined,
    requiredResponseType: 'eot_review',
    remainingDays: undefined,
    subject: `EoT Claim Submitted: ${claim.claimReference} — ${claim.cause} (${claim.periodClaimedDays} working days)`,
    entityType: 'eot',
    entityId: claimId,
  };

  // Surface via integration service with retry (Requirement 10.5)
  await surfaceToActionCentre(actionCentreEvent);

  return { auditRecord, actionCentreEvent };
}

/**
 * Review an EoT claim — grant, partially grant, or reject.
 *
 * State transitions (Requirement 6.7):
 * - submitted → under_review (automatic on first review action)
 * - under_review → granted | partially_granted | rejected
 *
 * On grant (Requirement 6.8): updates revised completion date by adding full period.
 * On partial grant (Requirement 6.9): updates revised completion date by adding approvedDays.
 *
 * @param projectId - The project ID
 * @param claimId - The claim ID to review
 * @param decision - The review decision
 * @param approvedDays - Days approved (required for partial grant, must be 1 ≤ approvedDays < periodClaimed)
 * @param reviewedBy - User ID of the reviewer
 * @returns Object containing audit record and optional revised completion date
 */
export async function reviewEoTClaim(
  projectId: string,
  claimId: string,
  decision: 'granted' | 'partially_granted' | 'rejected',
  approvedDays: number | undefined,
  reviewedBy: string
): Promise<{
  auditRecord: ContractAuditRecord;
  revisedCompletionDate?: string;
}> {
  const claimRef = adminDb
    .collection(`projects/${projectId}/contractEotClaims`)
    .doc(claimId);
  const doc = await claimRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `EoT claim ${claimId} not found.`,
      details: { invalidFields: ['claimId'] },
    };
    throw error;
  }

  const claim = doc.data() as EoTClaimRecord;

  // Handle automatic transition: submitted → under_review → decision
  // If currently 'submitted', first move to under_review, then apply decision
  if (claim.status === 'submitted') {
    // Validate submitted → under_review transition
    if (!EOT_TRANSITIONS['submitted']?.includes('under_review')) {
      const error: ContractError = {
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from 'submitted' to 'under_review'.`,
        details: {
          currentStatus: 'submitted',
          attemptedStatus: 'under_review',
          permittedTransitions: EOT_TRANSITIONS['submitted'],
        },
      };
      throw error;
    }

    // Move to under_review first
    await claimRef.update({ status: 'under_review', updatedAt: nowIso() });
  } else if (claim.status !== 'under_review') {
    // Only submitted or under_review can be reviewed
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot review EoT claim in status '${claim.status}'.`,
      details: {
        currentStatus: claim.status,
        attemptedStatus: decision,
        permittedTransitions: EOT_TRANSITIONS[claim.status],
      },
    };
    throw error;
  }

  // Validate under_review → decision transition
  if (!EOT_TRANSITIONS['under_review']?.includes(decision)) {
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot transition from 'under_review' to '${decision}'.`,
      details: {
        currentStatus: 'under_review',
        attemptedStatus: decision,
        permittedTransitions: EOT_TRANSITIONS['under_review'],
      },
    };
    throw error;
  }

  // Validate approvedDays for partial grant (Requirement 6.9)
  if (decision === 'partially_granted') {
    if (
      approvedDays === undefined ||
      approvedDays === null ||
      !Number.isInteger(approvedDays) ||
      approvedDays < 1 ||
      approvedDays >= claim.periodClaimedDays
    ) {
      const error: ContractError = {
        code: 'VALIDATION_ERROR',
        message: `Partial grant requires approvedDays between 1 and ${claim.periodClaimedDays - 1} (less than period claimed).`,
        details: { invalidFields: ['approvedDays'] },
      };
      throw error;
    }
  }

  const now = nowIso();
  let revisedCompletionDate: string | undefined;

  // Update claim with decision
  const updateData: Record<string, unknown> = {
    status: decision,
    reviewedBy,
    reviewedAt: now,
    updatedAt: now,
  };

  if (decision === 'partially_granted') {
    updateData.approvedDays = approvedDays;
  }

  await claimRef.update(updateData);

  // On grant or partial grant: update revised completion date (Requirements 6.8, 6.9)
  if (decision === 'granted' || decision === 'partially_granted') {
    const daysToAdd = decision === 'granted' ? claim.periodClaimedDays : approvedDays!;

    // Read contract config to get current completion date
    const configDoc = await adminDb
      .collection(`projects/${projectId}/contractConfig`)
      .doc('config')
      .get();

    if (configDoc.exists) {
      const contractConfig = configDoc.data() as ContractConfig;
      const currentCompletionDate =
        contractConfig.revisedCompletionDate || contractConfig.practicalCompletionDate;

      const holidays = getHolidaysForRange(currentCompletionDate);
      revisedCompletionDate = addWorkingDays(currentCompletionDate, daysToAdd, holidays);

      // Update the contract config with new revised completion date
      await adminDb
        .collection(`projects/${projectId}/contractConfig`)
        .doc('config')
        .update({
          revisedCompletionDate,
          updatedAt: now,
        });

      // Write revised completion date to Project Passport (Requirement 10.1)
      await writeToProjectPassport(projectId, {
        contractStatus: 'active',
        keyDates: {
          commencementDate: contractConfig.commencementDate,
          practicalCompletionDate: contractConfig.practicalCompletionDate,
          revisedCompletionDate,
        },
        outstandingNoticesCount: 0,
        nearestDeadlineDays: undefined,
      });
    }
  }

  // Create audit record via integration service (Requirement 10.6)
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'eot',
    entityId: claimId,
    action: `eot_claim_${decision}`,
    previousValue: { status: claim.status },
    newValue: {
      status: decision,
      reviewedBy,
      ...(decision === 'partially_granted' ? { approvedDays } : {}),
      ...(revisedCompletionDate ? { revisedCompletionDate } : {}),
    },
    actorId: reviewedBy,
    timestamp: now,
  };

  await writeToAuditTrail(projectId, auditRecord);

  return { auditRecord, revisedCompletionDate };
}
