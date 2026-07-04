/**
 * Contract Administration — Claims Register Service
 *
 * Manages loss/expense, disruption, prolongation, and varied work claims:
 * registration, state transitions, dissatisfaction/dispute escalation,
 * cumulative summaries, and submission deadline warnings.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9
 */

import type {
  ClaimInput,
  ClaimRecord,
  ClaimStatus,
  ClaimType,
  ClaimsCumulativeSummary,
  ContractAuditRecord,
  ContractWorkflowEvent,
  ContractProjectAssignment,
  ContractError,
  ContractConfig,
} from './contractTypes';
import { CLAIM_TRANSITIONS } from './contractTypes';
import { assertAccess } from './contractRbacService';
import { getFormConfig } from './contractFormConfigs';
import { writeToAuditTrail } from './contractIntegrationService';
import { adminDb } from '@/lib/firebase-admin';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** Valid claim types */
const VALID_CLAIM_TYPES: ClaimType[] = [
  'loss_and_expense',
  'disruption',
  'prolongation',
  'varied_work',
];

/** Claim reference prefix per type */
const CLAIM_TYPE_PREFIX: Record<ClaimType, string> = {
  loss_and_expense: 'LE',
  disruption: 'DIS',
  prolongation: 'PRO',
  varied_work: 'VW',
};

/** Adjudication referral deadlines per contract form (in days) and day type */
const ADJUDICATION_DEADLINES: Record<string, { days: number; dayType: 'working' | 'calendar' }> = {
  jbcc_pba: { days: 10, dayType: 'working' },
  nec_ecc: { days: 28, dayType: 'calendar' },
  gcc_2025: { days: 28, dayType: 'calendar' },
  fidic: { days: 28, dayType: 'calendar' },
};

/** Warning thresholds in calendar days for submission deadlines */
const WARNING_THRESHOLDS = [14, 7];

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Get current ISO timestamp */
function nowIso(): string {
  return new Date().toISOString();
}

/** Generate a unique ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/** Validate an ISO date string (YYYY-MM-DD) */
function isValidIsoDate(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  if (!match) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !isNaN(date.getTime());
}

/** Add calendar days to an ISO date string */
function addCalendarDays(isoDate: string, days: number): string {
  const date = new Date(isoDate + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Calculate calendar days remaining from today to a target date */
function calendarDaysUntil(targetIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetIso + 'T00:00:00Z');
  const diffMs = target.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Determine whether a claim status transition is valid.
 *
 * Pure function using the CLAIM_TRANSITIONS map from contractTypes.
 *
 * Permitted transitions:
 *   notified → substantiated
 *   substantiated → assessed
 *   assessed → accepted | partially_accepted | rejected
 *   accepted | partially_accepted | rejected → disputed
 *
 * @param from - Current claim status
 * @param to - Target claim status
 * @returns true if the transition is permitted
 */
export function isValidClaimTransition(
  from: ClaimStatus,
  to: ClaimStatus
): boolean {
  const permitted = CLAIM_TRANSITIONS[from];
  if (!permitted) return false;
  return permitted.includes(to);
}

/**
 * Register a new claim.
 *
 * Validates mandatory fields (claimType, dateOfEvent, notificationDate,
 * amountClaimed), generates a sequential claim reference, persists the
 * record, calculates submission deadline, and creates an audit record.
 *
 * @param input - The claim registration input
 * @param projectAssignment - The creator's project assignment (for RBAC)
 * @returns Object containing the claim record, audit record, and any deadline warnings
 */
export async function registerClaim(
  input: ClaimInput,
  projectAssignment: ContractProjectAssignment
): Promise<{
  claim: ClaimRecord;
  auditRecord: ContractAuditRecord;
  warnings: ContractWorkflowEvent[];
}> {
  // RBAC check — requires write access to claims
  assertAccess(
    projectAssignment.roles,
    'claims',
    'write',
    projectAssignment
  );

  // Validate mandatory fields (Requirement 8.8)
  const invalidFields: string[] = [];

  if (!input.projectId) invalidFields.push('projectId');
  if (!input.claimType || !VALID_CLAIM_TYPES.includes(input.claimType)) {
    invalidFields.push('claimType');
  }
  if (!isValidIsoDate(input.dateOfEvent)) {
    invalidFields.push('dateOfEvent');
  }
  if (!isValidIsoDate(input.notificationDate)) {
    invalidFields.push('notificationDate');
  }
  if (
    input.amountClaimed === undefined ||
    input.amountClaimed === null ||
    !Number.isFinite(input.amountClaimed) ||
    input.amountClaimed < 0.01 ||
    input.amountClaimed > 999_999_999.99
  ) {
    invalidFields.push('amountClaimed');
  }
  if (!input.createdBy) invalidFields.push('createdBy');

  if (invalidFields.length > 0) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'Claim registration failed: mandatory fields missing or invalid.',
      details: { invalidFields },
    };
    throw error;
  }

  // Validate optional timeImpactDays if provided
  if (
    input.timeImpactDays !== undefined &&
    (input.timeImpactDays < 0 || input.timeImpactDays > 9999 || !Number.isFinite(input.timeImpactDays))
  ) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'Claim registration failed: timeImpactDays must be between 0 and 9999.',
      details: { invalidFields: ['timeImpactDays'] },
    };
    throw error;
  }

  // Generate sequential claim reference: CLM-{prefix}-{seq}
  const existingSnapshot = await adminDb
    .collection(`projects/${input.projectId}/contractClaims`)
    .get();
  const seq = existingSnapshot.size + 1;
  const prefix = CLAIM_TYPE_PREFIX[input.claimType];
  const claimReference = `CLM-${prefix}-${String(seq).padStart(4, '0')}`;

  // Calculate submission deadline based on contract form (Requirement 8.3)
  let submissionDeadline: string | undefined;
  const warnings: ContractWorkflowEvent[] = [];

  try {
    const configSnapshot = await adminDb
      .collection(`projects/${input.projectId}/contractConfig`)
      .doc('config')
      .get();

    if (configSnapshot.exists) {
      const contractConfig = configSnapshot.data() as ContractConfig;
      const formConfig = getFormConfig(contractConfig.contractForm);

      // Use the EoT notification rule period as basis for claim submission deadline
      // (claims follow the same notification period structure)
      const { notificationPeriodDays, dayType } = formConfig.eotNotificationRule;

      if (dayType === 'calendar') {
        submissionDeadline = addCalendarDays(input.notificationDate, notificationPeriodDays);
      } else {
        // For working days, approximate with calendar days * 1.4
        // (working day calculation deferred to WorkingDayCalculator for exact value)
        submissionDeadline = addCalendarDays(
          input.notificationDate,
          Math.ceil(notificationPeriodDays * 1.4)
        );
      }

      // Surface warnings at 14 and 7 calendar days (Requirement 8.3)
      if (submissionDeadline) {
        const daysRemaining = calendarDaysUntil(submissionDeadline);

        for (const threshold of WARNING_THRESHOLDS) {
          if (daysRemaining <= threshold && daysRemaining > 0) {
            warnings.push({
              projectId: input.projectId,
              targetUserId: input.createdBy,
              priority: threshold <= 7 ? 'high' : 'normal',
              deadlineDate: submissionDeadline,
              remainingDays: daysRemaining,
              subject: `Claim ${claimReference}: submission deadline in ${daysRemaining} calendar days`,
              entityType: 'claim',
              entityId: claimReference,
            });
            break; // Only the most urgent warning
          }
        }
      }
    }
  } catch {
    // If contract config is not available, proceed without deadline
  }

  // Build claim record
  const claimId = generateId();
  const now = nowIso();

  const claim: ClaimRecord = {
    id: claimId,
    projectId: input.projectId,
    claimReference,
    claimType: input.claimType,
    dateOfEvent: input.dateOfEvent,
    notificationDate: input.notificationDate,
    amountClaimed: input.amountClaimed,
    timeImpactDays: input.timeImpactDays ?? 0,
    status: 'notified',
    submissionDeadline,
    linkedEvidenceIds: input.linkedEvidenceIds ?? [],
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // Persist to Firestore
  await adminDb
    .collection(`projects/${input.projectId}/contractClaims`)
    .doc(claimId)
    .set(claim);

  // Create audit record (Requirement 8.7) via integration service
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId: input.projectId,
    entityType: 'claim',
    entityId: claimId,
    action: 'claim_registered',
    newValue: {
      claimReference,
      claimType: input.claimType,
      dateOfEvent: input.dateOfEvent,
      notificationDate: input.notificationDate,
      amountClaimed: input.amountClaimed,
      timeImpactDays: input.timeImpactDays ?? 0,
      status: 'notified',
    },
    actorId: input.createdBy,
    timestamp: now,
  };

  await writeToAuditTrail(input.projectId, auditRecord);

  return { claim, auditRecord, warnings };
}

/**
 * Transition a claim to a new status.
 *
 * Reads the current status, validates the transition against the state machine,
 * persists the new status, and creates an audit record with reason for transition.
 *
 * @param projectId - The project identifier
 * @param claimId - The claim identifier
 * @param toStatus - The target status
 * @param actorId - The user performing the transition
 * @param reason - The reason for the transition
 * @param projectAssignment - The actor's project assignment (for RBAC)
 * @returns Object containing the audit record
 */
export async function transitionClaim(
  projectId: string,
  claimId: string,
  toStatus: ClaimStatus,
  actorId: string,
  reason: string,
  projectAssignment: ContractProjectAssignment
): Promise<{ auditRecord: ContractAuditRecord }> {
  // RBAC check
  assertAccess(
    projectAssignment.roles,
    'claims',
    'write',
    projectAssignment
  );

  // Read current claim
  const claimRef = adminDb
    .collection(`projects/${projectId}/contractClaims`)
    .doc(claimId);
  const doc = await claimRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Claim ${claimId} not found.`,
      details: { invalidFields: ['claimId'] },
    };
    throw error;
  }

  const claim = doc.data() as ClaimRecord;
  const fromStatus = claim.status;

  // Validate transition (Requirement 8.2, 8.9)
  if (!isValidClaimTransition(fromStatus, toStatus)) {
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot transition claim from '${fromStatus}' to '${toStatus}'.`,
      details: {
        currentStatus: fromStatus,
        attemptedStatus: toStatus,
        permittedTransitions: CLAIM_TRANSITIONS[fromStatus],
      },
    };
    throw error;
  }

  // Persist new status
  const now = nowIso();
  await claimRef.update({
    status: toStatus,
    updatedAt: now,
  });

  // Create audit record (Requirement 8.7) via integration service
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'claim',
    entityId: claimId,
    action: `claim_transitioned_to_${toStatus}`,
    previousValue: { status: fromStatus },
    newValue: { status: toStatus, reason },
    clauseReference: claim.claimReference,
    actorId,
    timestamp: now,
  };

  await writeToAuditTrail(projectId, auditRecord);

  return { auditRecord };
}

/**
 * Register a notice of dissatisfaction for a claim.
 *
 * Sets the dissatisfactionDate on the claim and calculates the adjudication
 * referral deadline based on the contract form's prescribed referral period.
 *
 * Adjudication referral deadlines by form:
 * - JBCC PBA: 10 working days
 * - NEC ECC: 28 calendar days
 * - GCC 2025: 28 calendar days
 * - FIDIC: 28 calendar days
 *
 * @param projectId - The project identifier
 * @param claimId - The claim identifier
 * @param noticeDate - The date of the dissatisfaction notice (ISO date)
 * @param actorId - The user registering the dissatisfaction
 * @param projectAssignment - The actor's project assignment (for RBAC)
 * @returns Object containing the calculated adjudication deadline
 */
export async function registerDissatisfaction(
  projectId: string,
  claimId: string,
  noticeDate: string,
  actorId: string,
  projectAssignment: ContractProjectAssignment
): Promise<{ adjudicationDeadline: string }> {
  // RBAC check
  assertAccess(
    projectAssignment.roles,
    'claims',
    'write',
    projectAssignment
  );

  // Validate noticeDate
  if (!isValidIsoDate(noticeDate)) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'Invalid notice date. Must be a valid ISO date (YYYY-MM-DD).',
      details: { invalidFields: ['noticeDate'] },
    };
    throw error;
  }

  // Read current claim
  const claimRef = adminDb
    .collection(`projects/${projectId}/contractClaims`)
    .doc(claimId);
  const doc = await claimRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Claim ${claimId} not found.`,
      details: { invalidFields: ['claimId'] },
    };
    throw error;
  }

  const claim = doc.data() as ClaimRecord;

  // Only claims in rejected, partially_accepted, or accepted status can have dissatisfaction
  const dissatisfactionStatuses: ClaimStatus[] = ['rejected', 'partially_accepted', 'accepted'];
  if (!dissatisfactionStatuses.includes(claim.status)) {
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot register dissatisfaction for a claim in '${claim.status}' status. Claim must be in accepted, partially_accepted, or rejected status.`,
      details: {
        currentStatus: claim.status,
        permittedTransitions: CLAIM_TRANSITIONS[claim.status],
      },
    };
    throw error;
  }

  // Get contract form to determine adjudication deadline
  let contractForm = 'jbcc_pba'; // Default
  try {
    const configSnapshot = await adminDb
      .collection(`projects/${projectId}/contractConfig`)
      .doc('config')
      .get();

    if (configSnapshot.exists) {
      const contractConfig = configSnapshot.data() as ContractConfig;
      contractForm = contractConfig.contractForm;
    }
  } catch {
    // Use default if config unavailable
  }

  // Calculate adjudication referral deadline (Requirement 8.5)
  const deadlineConfig = ADJUDICATION_DEADLINES[contractForm] ?? ADJUDICATION_DEADLINES['jbcc_pba'];
  let adjudicationDeadline: string;

  if (deadlineConfig.dayType === 'calendar') {
    adjudicationDeadline = addCalendarDays(noticeDate, deadlineConfig.days);
  } else {
    // For working days, approximate with calendar days * 1.4
    // This provides a conservative estimate; exact calculation would use WorkingDayCalculator
    adjudicationDeadline = addCalendarDays(
      noticeDate,
      Math.ceil(deadlineConfig.days * 1.4)
    );
  }

  // Update claim record
  const now = nowIso();
  await claimRef.update({
    dissatisfactionDate: noticeDate,
    adjudicationDeadline,
    updatedAt: now,
  });

  // Create audit record via integration service
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'claim',
    entityId: claimId,
    action: 'claim_dissatisfaction_registered',
    previousValue: {
      dissatisfactionDate: claim.dissatisfactionDate ?? null,
      adjudicationDeadline: claim.adjudicationDeadline ?? null,
    },
    newValue: {
      dissatisfactionDate: noticeDate,
      adjudicationDeadline,
    },
    clauseReference: claim.claimReference,
    actorId,
    timestamp: now,
  };

  await writeToAuditTrail(projectId, auditRecord);

  return { adjudicationDeadline };
}

/**
 * Compute cumulative claims summary for a project.
 *
 * Queries all claims and computes:
 * - Total claims by type (count per ClaimType)
 * - Total amount claimed (sum of all amountClaimed values)
 * - Total amount assessed (sum of amountClaimed for claims in assessed+ statuses)
 * - Total amount settled (sum of amountClaimed for accepted/partially_accepted claims)
 *
 * @param projectId - The project identifier
 * @returns The cumulative claims summary
 */
export async function getCumulativeSummary(
  projectId: string
): Promise<ClaimsCumulativeSummary> {
  const snapshot = await adminDb
    .collection(`projects/${projectId}/contractClaims`)
    .get();

  const totalByType: Record<ClaimType, number> = {
    loss_and_expense: 0,
    disruption: 0,
    prolongation: 0,
    varied_work: 0,
  };

  let totalAmountClaimed = 0;
  let totalAmountAssessed = 0;
  let totalAmountSettled = 0;

  /** Statuses indicating a claim has been assessed */
  const assessedStatuses: ClaimStatus[] = [
    'assessed',
    'accepted',
    'partially_accepted',
    'rejected',
    'disputed',
  ];

  /** Statuses indicating a claim has been settled */
  const settledStatuses: ClaimStatus[] = ['accepted', 'partially_accepted'];

  for (const doc of snapshot.docs) {
    const claim = doc.data() as ClaimRecord;

    // Count by type
    if (claim.claimType in totalByType) {
      totalByType[claim.claimType]++;
    }

    // Sum total claimed
    totalAmountClaimed += claim.amountClaimed;

    // Sum assessed (claims that have reached assessed stage or beyond)
    if (assessedStatuses.includes(claim.status)) {
      totalAmountAssessed += claim.amountClaimed;
    }

    // Sum settled (claims accepted or partially accepted)
    if (settledStatuses.includes(claim.status)) {
      totalAmountSettled += claim.amountClaimed;
    }
  }

  return {
    totalByType,
    totalAmountClaimed,
    totalAmountAssessed,
    totalAmountSettled,
  };
}

/**
 * Check submission deadline warnings for all active claims in a project.
 *
 * Surfaces warnings at 14 and 7 calendar days before submission deadline.
 *
 * @param projectId - The project identifier
 * @returns Array of workflow events for claims approaching deadlines
 */
export async function checkSubmissionDeadlines(
  projectId: string
): Promise<ContractWorkflowEvent[]> {
  const snapshot = await adminDb
    .collection(`projects/${projectId}/contractClaims`)
    .where('status', '==', 'notified')
    .get();

  const warnings: ContractWorkflowEvent[] = [];

  for (const doc of snapshot.docs) {
    const claim = doc.data() as ClaimRecord;

    if (!claim.submissionDeadline) continue;

    const daysRemaining = calendarDaysUntil(claim.submissionDeadline);

    for (const threshold of WARNING_THRESHOLDS) {
      if (daysRemaining <= threshold && daysRemaining > 0) {
        warnings.push({
          projectId,
          targetUserId: claim.createdBy,
          priority: threshold <= 7 ? 'high' : 'normal',
          deadlineDate: claim.submissionDeadline,
          remainingDays: daysRemaining,
          subject: `Claim ${claim.claimReference}: submission deadline in ${daysRemaining} calendar days`,
          entityType: 'claim',
          entityId: claim.id,
        });
        break; // Only the most urgent warning per claim
      }
    }
  }

  return warnings;
}

/**
 * Link evidence to an existing claim.
 *
 * Supports linking from: site diary, payment records, variation orders,
 * site instructions, and correspondence (Requirement 8.4).
 *
 * @param projectId - The project identifier
 * @param claimId - The claim identifier
 * @param evidenceIds - Array of evidence document IDs to link
 * @param actorId - The user performing the linkage
 * @param projectAssignment - The actor's project assignment (for RBAC)
 */
export async function linkEvidence(
  projectId: string,
  claimId: string,
  evidenceIds: string[],
  actorId: string,
  projectAssignment: ContractProjectAssignment
): Promise<{ auditRecord: ContractAuditRecord }> {
  // RBAC check
  assertAccess(
    projectAssignment.roles,
    'claims',
    'write',
    projectAssignment
  );

  if (!evidenceIds || evidenceIds.length === 0) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'At least one evidence ID is required.',
      details: { invalidFields: ['evidenceIds'] },
    };
    throw error;
  }

  // Read current claim
  const claimRef = adminDb
    .collection(`projects/${projectId}/contractClaims`)
    .doc(claimId);
  const doc = await claimRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Claim ${claimId} not found.`,
      details: { invalidFields: ['claimId'] },
    };
    throw error;
  }

  const claim = doc.data() as ClaimRecord;
  const existingIds = claim.linkedEvidenceIds ?? [];
  const newIds = [...new Set([...existingIds, ...evidenceIds])];

  // Update claim record
  const now = nowIso();
  await claimRef.update({
    linkedEvidenceIds: newIds,
    updatedAt: now,
  });

  // Create audit record via integration service
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'claim',
    entityId: claimId,
    action: 'claim_evidence_linked',
    previousValue: { linkedEvidenceIds: existingIds },
    newValue: { linkedEvidenceIds: newIds },
    clauseReference: claim.claimReference,
    actorId,
    timestamp: now,
  };

  await writeToAuditTrail(projectId, auditRecord);

  return { auditRecord };
}
