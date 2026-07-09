// ─── Award Service ───────────────────────────────────────────────────────────
// Handles award recommendation creation, conflict-of-interest checks, and the
// sequential approval gate (client → professional).
//
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8

import {
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDemoDoc } from '../../demo-seed/demoFirestore';
import type {
  AwardRecommendation,
  ApprovalRecord,
  ConflictFlag,
  ConflictType,
  ValidationResult,
  RfqValidationError,
  QuoteResponse,
  InvitedSupplier,
} from './types';
import {
  RFQ_ERROR_CODES,
  RFQ_ERROR_MESSAGES,
  MIN_JUSTIFICATION_LENGTH,
  MIN_CONFLICT_ACK_LENGTH,
} from './types';

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Generates a unique award recommendation ID.
 */
function generateAwardId(): string {
  return `award_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Returns the Firestore document reference for the single award recommendation
 * document stored at projects/{pid}/rfqs/{rfqId}/award/recommendation.
 */
function getAwardDocRef(projectId: string, rfqId: string) {
  return getDemoDoc('projects', projectId, 'rfqs', rfqId, 'award', 'recommendation');
}

/**
 * Writes an immutable audit event to the project audit trail:
 * projects/{pid}/rfqs/{rfqId}/audit/{eventId}
 *
 * Integration service (task 14.1) will handle full SpecForge + Passport
 * write-back; here we persist directly to the audit sub-collection so
 * audit records are always created regardless of integration status.
 */
async function writeAuditEvent(params: {
  projectId: string;
  rfqId: string;
  action: string;
  performedBy: string;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const eventId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const auditDocRef = getDemoDoc(
      'projects', params.projectId,
      'rfqs', params.rfqId,
      'audit', eventId
    );
    await setDoc(auditDocRef, {
      action: params.action,
      performedBy: params.performedBy,
      details: params.details,
      timestamp,
    });
  } catch {
    // Audit write failure must never block the primary operation.
    // The error is silently swallowed here — production would log to a
    // dead-letter queue or monitoring service.
  }
}

// ─── Conflict-of-Interest Check ──────────────────────────────────────────────

/** Minimal supplier affiliation data used by the COI check. */
export interface SupplierAffiliations {
  ownerships: string[];      // Entity names where the supplier has ownership
  directorships: string[];   // Entity names where the supplier holds directorship
  affiliations: string[];    // Other affiliated entity names
}

/** A single project team member entry for COI comparison. */
export interface TeamMember {
  name: string;
  role: string;
  affiliatedEntities: string[];
}

/**
 * Executes a conflict-of-interest check.
 *
 * Compares the recommended supplier's ownership, directorship, and affiliation
 * entities against every project team member's affiliated entities. Returns a
 * ConflictFlag for each match found.
 *
 * Requirement 6.3
 */
export function checkConflictOfInterest(
  supplierAffiliations: SupplierAffiliations,
  teamMembers: TeamMember[]
): ConflictFlag[] {
  const flags: ConflictFlag[] = [];

  const checkEntities = (
    entities: string[],
    type: ConflictType
  ) => {
    for (const entity of entities) {
      const normalised = entity.trim().toLowerCase();
      for (const member of teamMembers) {
        const matched = member.affiliatedEntities.some(
          (e) => e.trim().toLowerCase() === normalised
        );
        if (matched) {
          flags.push({
            type,
            supplierEntity: entity,
            teamMemberName: member.name,
            teamMemberRole: member.role,
            acknowledged: false,
          });
        }
      }
    }
  };

  checkEntities(supplierAffiliations.ownerships, 'ownership');
  checkEntities(supplierAffiliations.directorships, 'directorship');
  checkEntities(supplierAffiliations.affiliations, 'affiliation');

  return flags;
}

// ─── Create Award Recommendation ─────────────────────────────────────────────

/**
 * Creates an award recommendation for a scored quote.
 *
 * - Validates justification length (min 50 chars)
 * - Runs conflict-of-interest check via supplied affiliations
 * - Sets initial status to 'pending_client'
 * - Persists to projects/{pid}/rfqs/{rfqId}/award/recommendation
 * - Records creation in the project audit trail
 *
 * Requirement 6.1, 6.3, 6.6
 */
export async function createAwardRecommendation(params: {
  rfqId: string;
  projectId: string;
  recommendedSupplierId: string;
  recommendedQuoteId: string;
  quotedPrice: number;
  justification: string;
  riskNotes?: string;
  comparedQuoteIds: string[];
  createdBy: string;
  /** Pre-built supplier affiliations for the COI check (ownership/directorship/affiliation lists). */
  supplierAffiliations?: SupplierAffiliations;
  /** Project team members to compare against for the COI check. */
  teamMembers?: TeamMember[];
}): Promise<{ success: boolean; recommendation?: AwardRecommendation; errors?: ValidationResult }> {
  const errors: RfqValidationError[] = [];

  // Validate justification length (min 50 chars) — Requirement 6.1
  if (!params.justification || params.justification.length < MIN_JUSTIFICATION_LENGTH) {
    errors.push({
      code: RFQ_ERROR_CODES.AWARD_JUSTIFICATION_SHORT,
      message: RFQ_ERROR_MESSAGES.AWARD_JUSTIFICATION_SHORT,
      field: 'justification',
    });
  }

  if (errors.length > 0) {
    return { success: false, errors: { valid: false, errors } };
  }

  // Run conflict-of-interest check — Requirement 6.3
  const conflictFlags = checkConflictOfInterest(
    params.supplierAffiliations ?? { ownerships: [], directorships: [], affiliations: [] },
    params.teamMembers ?? []
  );

  const now = new Date().toISOString();
  const recommendationId = generateAwardId();

  const recommendation: AwardRecommendation = {
    id: recommendationId,
    rfqId: params.rfqId,
    recommendedSupplierId: params.recommendedSupplierId,
    recommendedQuoteId: params.recommendedQuoteId,
    quotedPrice: params.quotedPrice,
    justification: params.justification,
    riskNotes: params.riskNotes,
    comparedQuoteIds: params.comparedQuoteIds,
    conflictOfInterestFlags: conflictFlags,
    status: 'pending_client',
    createdBy: params.createdBy,
    createdAt: now,
  };

  // Persist to projects/{pid}/rfqs/{rfqId}/award/recommendation
  const awardDocRef = getAwardDocRef(params.projectId, params.rfqId);
  await setDoc(awardDocRef, recommendation);

  // Record in project audit trail — Requirement 6.6
  await writeAuditEvent({
    projectId: params.projectId,
    rfqId: params.rfqId,
    action: 'award_recommendation_created',
    performedBy: params.createdBy,
    details: {
      recommendationId,
      recommendedSupplierId: params.recommendedSupplierId,
      recommendedQuoteId: params.recommendedQuoteId,
      quotedPrice: params.quotedPrice,
      comparedQuoteIds: params.comparedQuoteIds,
      conflictFlagsCount: conflictFlags.length,
      justificationLength: params.justification.length,
    },
  });

  return { success: true, recommendation };
}

// ─── Validate Recommendation Currency ────────────────────────────────────────

/**
 * Checks whether the recommended quote is still current and the supplier
 * verification status has not degraded to 'expired' since recommendation creation.
 *
 * Returns `{ valid: false, reason }` if:
 *   - The recommended quote has status 'superseded'
 *   - The recommended supplier's verification status is 'expired'
 *
 * Requirement 6.8
 */
export async function validateRecommendationCurrency(
  projectId: string,
  rfqId: string
): Promise<{ valid: boolean; reason?: string }> {
  // Read the current award recommendation
  const awardDocRef = getAwardDocRef(projectId, rfqId);
  const awardSnap = await getDoc(awardDocRef);

  if (!awardSnap.exists()) {
    return { valid: false, reason: 'Award recommendation not found' };
  }

  const recommendation = awardSnap.data() as AwardRecommendation;

  // Check if the recommended quote has been superseded
  const quoteRef = getDemoDoc(
    'projects', projectId,
    'rfqs', rfqId,
    'quotes', recommendation.recommendedQuoteId
  );
  const quoteSnap = await getDoc(quoteRef);

  if (quoteSnap.exists()) {
    const quote = quoteSnap.data() as QuoteResponse;
    if (quote.status === 'superseded') {
      return {
        valid: false,
        reason: RFQ_ERROR_MESSAGES.AWARD_QUOTE_SUPERSEDED,
      };
    }
  }

  // Check if the recommended supplier's verification status has changed to 'expired'
  // The supplier's current verification status is stored on the RFQ's invitationList
  const rfqRef = getDemoDoc('projects', projectId, 'rfqs', rfqId);
  const rfqSnap = await getDoc(rfqRef);

  if (rfqSnap.exists()) {
    const rfqData = rfqSnap.data();
    const invitationList: InvitedSupplier[] = rfqData.invitationList ?? [];
    const supplier = invitationList.find(
      (s) => s.supplierId === recommendation.recommendedSupplierId
    );

    if (supplier && supplier.verificationStatus === 'expired') {
      return {
        valid: false,
        reason: RFQ_ERROR_MESSAGES.AWARD_QUOTE_SUPERSEDED,
      };
    }
  }

  return { valid: true };
}

// ─── Approval Gate: Client Approval ──────────────────────────────────────────

/**
 * Records client approval (or rejection) on an award recommendation.
 *
 * Pre-conditions enforced before recording approval:
 *   1. No unacknowledged conflict-of-interest flags (Requirement 6.4)
 *   2. Each acknowledged conflict must have justification >= 100 chars (Requirement 6.4)
 *   3. Recommended quote must not be superseded (Requirement 6.8)
 *   4. Recommended supplier verification must not be 'expired' (Requirement 6.8)
 *
 * On approval: transitions status to 'pending_professional'.
 * On rejection: transitions status to 'rejected' (delegates to rejectRecommendation).
 *
 * Requirement 6.2, 6.4, 6.6, 6.7, 6.8
 */
export async function recordClientApproval(params: {
  projectId: string;
  rfqId: string;
  approval: ApprovalRecord;
}): Promise<{ success: boolean; errors?: ValidationResult }> {
  const awardDocRef = getAwardDocRef(params.projectId, params.rfqId);
  const awardSnap = await getDoc(awardDocRef);

  if (!awardSnap.exists()) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED,
          message: 'Award recommendation not found',
          field: 'award',
        }],
      },
    };
  }

  const recommendation = awardSnap.data() as AwardRecommendation;

  // Only allow recording client approval when status is 'pending_client'
  if (recommendation.status !== 'pending_client') {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED,
          message: `Client approval cannot be recorded at current status: "${recommendation.status}"`,
          field: 'status',
        }],
      },
    };
  }

  // Delegate rejection path to rejectRecommendation — Requirement 6.7
  if (params.approval.decision === 'rejected') {
    return rejectRecommendation({
      projectId: params.projectId,
      rfqId: params.rfqId,
      reason: params.approval.reason ?? 'Rejected by client',
      rejectedBy: params.approval.approverId,
    });
  }

  const errors: RfqValidationError[] = [];

  // Requirement 6.4: All conflict flags must be acknowledged before client approval
  const flags = recommendation.conflictOfInterestFlags ?? [];
  const unacknowledged = flags.filter((f) => !f.acknowledged);
  if (unacknowledged.length > 0) {
    errors.push({
      code: RFQ_ERROR_CODES.AWARD_CONFLICT_UNRESOLVED,
      message: RFQ_ERROR_MESSAGES.AWARD_CONFLICT_UNRESOLVED,
      field: 'conflictOfInterestFlags',
    });
  }

  // Requirement 6.4: Each acknowledged conflict justification must be >= 100 chars
  const shortAck = flags.filter(
    (f) => f.acknowledged &&
      (!f.acknowledgementJustification ||
        f.acknowledgementJustification.length < MIN_CONFLICT_ACK_LENGTH)
  );
  if (shortAck.length > 0) {
    errors.push({
      code: RFQ_ERROR_CODES.AWARD_CONFLICT_ACK_SHORT,
      message: RFQ_ERROR_MESSAGES.AWARD_CONFLICT_ACK_SHORT,
      field: 'conflictOfInterestFlags',
    });
  }

  if (errors.length > 0) {
    return { success: false, errors: { valid: false, errors } };
  }

  // Requirement 6.8: Check that the recommendation is still current
  const currencyCheck = await validateRecommendationCurrency(
    params.projectId,
    params.rfqId
  );
  if (!currencyCheck.valid) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.AWARD_QUOTE_SUPERSEDED,
          message: currencyCheck.reason ?? RFQ_ERROR_MESSAGES.AWARD_QUOTE_SUPERSEDED,
          field: 'recommendedQuoteId',
        }],
      },
    };
  }

  // Record client approval and advance status — Requirement 6.2
  await updateDoc(awardDocRef, {
    clientApproval: params.approval,
    status: 'pending_professional' as AwardRecommendation['status'],
  });

  // Audit trail — Requirement 6.6
  await writeAuditEvent({
    projectId: params.projectId,
    rfqId: params.rfqId,
    action: 'client_approval_recorded',
    performedBy: params.approval.approverId,
    details: {
      decision: params.approval.decision,
      approverName: params.approval.approverName,
      decidedAt: params.approval.decidedAt,
      reason: params.approval.reason,
    },
  });

  return { success: true };
}

// ─── Approval Gate: Professional Approval ────────────────────────────────────

/**
 * Records professional approval (or rejection) on an award recommendation.
 *
 * Pre-conditions enforced:
 *   1. Client approval must already be recorded with decision 'approved' (Requirement 6.2)
 *   2. Recommended quote must not be superseded (Requirement 6.8)
 *   3. Recommended supplier verification must not be 'expired' (Requirement 6.8)
 *
 * On approval: transitions status to 'approved' and generates a PO draft.
 * On rejection: transitions status to 'rejected'.
 *
 * Requirement 6.2, 6.5, 6.6, 6.7, 6.8
 */
export async function recordProfessionalApproval(params: {
  projectId: string;
  rfqId: string;
  approval: ApprovalRecord;
}): Promise<{ success: boolean; errors?: ValidationResult }> {
  const awardDocRef = getAwardDocRef(params.projectId, params.rfqId);
  const awardSnap = await getDoc(awardDocRef);

  if (!awardSnap.exists()) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED,
          message: 'Award recommendation not found',
          field: 'award',
        }],
      },
    };
  }

  const recommendation = awardSnap.data() as AwardRecommendation;

  // Requirement 6.2: Professional approval only after client approval
  if (recommendation.status !== 'pending_professional') {
    const isBeforeClient = recommendation.status === 'pending_client';
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED,
          message: isBeforeClient
            ? RFQ_ERROR_MESSAGES.AWARD_CLIENT_REQUIRED
            : `Professional approval cannot be recorded at current status: "${recommendation.status}"`,
          field: 'status',
        }],
      },
    };
  }

  // Requirement 6.2: Confirm client approval was approved (not just recorded)
  if (!recommendation.clientApproval || recommendation.clientApproval.decision !== 'approved') {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED,
          message: RFQ_ERROR_MESSAGES.AWARD_CLIENT_REQUIRED,
          field: 'clientApproval',
        }],
      },
    };
  }

  // Delegate rejection path — Requirement 6.7
  if (params.approval.decision === 'rejected') {
    return rejectRecommendation({
      projectId: params.projectId,
      rfqId: params.rfqId,
      reason: params.approval.reason ?? 'Rejected by professional approver',
      rejectedBy: params.approval.approverId,
    });
  }

  // Requirement 6.8: Check recommendation currency
  const currencyCheck = await validateRecommendationCurrency(
    params.projectId,
    params.rfqId
  );
  if (!currencyCheck.valid) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.AWARD_QUOTE_SUPERSEDED,
          message: currencyCheck.reason ?? RFQ_ERROR_MESSAGES.AWARD_QUOTE_SUPERSEDED,
          field: 'recommendedQuoteId',
        }],
      },
    };
  }

  // Record professional approval and advance status to 'approved' — Requirement 6.2, 6.5
  await updateDoc(awardDocRef, {
    professionalApproval: params.approval,
    status: 'approved' as AwardRecommendation['status'],
  });

  // Generate a PO draft — Requirement 6.5
  // The PO draft is stored as a document alongside the award at
  // projects/{pid}/rfqs/{rfqId}/award/po_draft
  await generatePurchaseOrderDraft({
    projectId: params.projectId,
    rfqId: params.rfqId,
    recommendation,
    approvedAt: params.approval.decidedAt,
  });

  // Audit trail — Requirement 6.6
  await writeAuditEvent({
    projectId: params.projectId,
    rfqId: params.rfqId,
    action: 'professional_approval_recorded',
    performedBy: params.approval.approverId,
    details: {
      decision: params.approval.decision,
      approverName: params.approval.approverName,
      decidedAt: params.approval.decidedAt,
      reason: params.approval.reason,
      rfqStatus: 'approved',
    },
  });

  return { success: true };
}

// ─── Reject Recommendation ────────────────────────────────────────────────────

/**
 * Rejects an award recommendation at any approval stage.
 *
 * - Transitions status to 'rejected'
 * - Records the rejection reason
 * - Records in audit trail (notifying author is handled by rfqNotificationService)
 *
 * Requirement 6.7
 */
export async function rejectRecommendation(params: {
  projectId: string;
  rfqId: string;
  reason: string;
  rejectedBy: string;
}): Promise<{ success: boolean; errors?: ValidationResult }> {
  const awardDocRef = getAwardDocRef(params.projectId, params.rfqId);
  const awardSnap = await getDoc(awardDocRef);

  if (!awardSnap.exists()) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED,
          message: 'Award recommendation not found',
          field: 'award',
        }],
      },
    };
  }

  const recommendation = awardSnap.data() as AwardRecommendation;

  // Only active recommendations can be rejected
  if (recommendation.status === 'approved' || recommendation.status === 'rejected') {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED,
          message: `Cannot reject recommendation with status "${recommendation.status}"`,
          field: 'status',
        }],
      },
    };
  }

  const now = new Date().toISOString();

  await updateDoc(awardDocRef, {
    status: 'rejected' as AwardRecommendation['status'],
    rejectionReason: params.reason,
    rejectedBy: params.rejectedBy,
    rejectedAt: now,
  });

  // Audit trail — Requirement 6.6
  await writeAuditEvent({
    projectId: params.projectId,
    rfqId: params.rfqId,
    action: 'award_recommendation_rejected',
    performedBy: params.rejectedBy,
    details: {
      reason: params.reason,
      previousStatus: recommendation.status,
      recommendationAuthor: recommendation.createdBy,
      rejectedAt: now,
    },
  });

  return { success: true };
}

// ─── Get Award Recommendation ─────────────────────────────────────────────────

/**
 * Gets the current award recommendation for an RFQ.
 * Returns null if no recommendation exists.
 */
export async function getAwardRecommendation(
  projectId: string,
  rfqId: string
): Promise<AwardRecommendation | null> {
  const awardDocRef = getAwardDocRef(projectId, rfqId);
  const awardSnap = await getDoc(awardDocRef);

  if (!awardSnap.exists()) {
    return null;
  }

  return awardSnap.data() as AwardRecommendation;
}

// ─── Purchase Order Draft Generation ─────────────────────────────────────────

/** A minimal PO draft document persisted alongside the award. */
interface PurchaseOrderDraft {
  rfqId: string;
  projectId: string;
  supplierId: string;
  quoteId: string;
  quotedPrice: number;
  generatedAt: string;
  status: 'draft';
  approvedByClient: string;
  approvedByProfessional: string;
}

/**
 * Generates a Purchase Order draft linked to the winning quote.
 * Persisted to projects/{pid}/rfqs/{rfqId}/award/po_draft.
 *
 * Requirement 6.5 — No automatic appointment; PO is draft only.
 */
async function generatePurchaseOrderDraft(params: {
  projectId: string;
  rfqId: string;
  recommendation: AwardRecommendation;
  approvedAt: string;
}): Promise<void> {
  const { recommendation } = params;

  const poDraft: PurchaseOrderDraft = {
    rfqId: recommendation.rfqId,
    projectId: params.projectId,
    supplierId: recommendation.recommendedSupplierId,
    quoteId: recommendation.recommendedQuoteId,
    quotedPrice: recommendation.quotedPrice,
    generatedAt: params.approvedAt,
    status: 'draft',
    approvedByClient: recommendation.clientApproval?.approverId ?? '',
    approvedByProfessional: recommendation.professionalApproval?.approverId ?? '',
  };

  const poDocRef = getDemoDoc(
    'projects', params.projectId,
    'rfqs', params.rfqId,
    'award', 'po_draft'
  );
  await setDoc(poDocRef, poDraft);
}
