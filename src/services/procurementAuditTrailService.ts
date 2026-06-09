/**
 * Procurement Audit Trail Service
 *
 * Records auditable events throughout the procurement lifecycle:
 *   - RFQ package creation, issue, and closure
 *   - Invitation creation, delivery, acceptance, and declination
 *   - Clarification submission and response
 *   - Addendum creation and distribution verification
 *   - Quote submission, validation, and comparison
 *   - Award recommendation, approval, and rejection
 *
 * Every audit record captures: who, what, when, and a snapshot of relevant state.
 * All audit records are immutable and suitable for regulatory review.
 */

export type ProcurementAuditAction =
  | 'rfq_package_created'
  | 'rfq_package_issued'
  | 'rfq_package_closed'
  | 'bidder_invitation_created'
  | 'bidder_invitation_issued'
  | 'bidder_invitation_delivered'
  | 'bidder_invitation_accepted'
  | 'bidder_invitation_declined'
  | 'bidder_invitation_revoked'
  | 'clarification_question_submitted'
  | 'clarification_response_recorded'
  | 'clarification_escalated_to_addendum'
  | 'addendum_created'
  | 'addendum_issued'
  | 'addendum_distribution_verified'
  | 'quote_submitted'
  | 'quote_validated'
  | 'quote_compared'
  | 'award_recommendation_created'
  | 'award_client_approved'
  | 'award_professional_approved'
  | 'award_rejected'
  | 'appointment_placeholder_created'
  | 'guardrail_violation'
  | 'fairness_audit_check';

export interface ProcurementAuditRecord {
  auditId: string;
  rfqId?: string;
  projectId?: string;
  action: ProcurementAuditAction;
  actor: string;
  actorRole: string;
  targetType: string;
  targetId: string;
  description: string;
  snapshot: Record<string, unknown>;
  fairnessFlags: string[];
  createdAt: string;
}

const AUDIT_GOVERNANCE =
  'Procurement audit records are immutable. Each record captures a material procurement event with actor, timestamp, and state snapshot. Fairness and equal-information principles are monitored across all records.';

export function createAuditRecord(
  action: ProcurementAuditAction,
  actor: string,
  actorRole: string,
  targetType: string,
  targetId: string,
  description: string,
  snapshot: Record<string, unknown> = {},
  rfqId?: string,
  projectId?: string,
  fairnessFlags: string[] = [],
): ProcurementAuditRecord {
  return {
    auditId: `audit_proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    rfqId,
    projectId,
    action,
    actor,
    actorRole,
    targetType,
    targetId,
    description,
    snapshot,
    fairnessFlags,
    createdAt: new Date().toISOString(),
  };
}

// ─── RFQ Package Audits ──────────────────────────────────────────────────

export function auditRfqPackageCreated(
  rfqId: string,
  title: string,
  actor: string,
  actorRole: string,
  projectId: string,
  snapshot: Record<string, unknown>,
): ProcurementAuditRecord {
  return createAuditRecord(
    'rfq_package_created',
    actor,
    actorRole,
    'rfq_package',
    rfqId,
    `RFQ package "${title}" created.`,
    snapshot,
    rfqId,
    projectId,
  );
}

export function auditRfqPackageIssued(
  rfqId: string,
  title: string,
  actor: string,
  actorRole: string,
  projectId: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    'rfq_package_issued',
    actor,
    actorRole,
    'rfq_package',
    rfqId,
    `RFQ package "${title}" issued to bidders.`,
    { rfqId, title, issuedAt: new Date().toISOString() },
    rfqId,
    projectId,
  );
}

// ─── Invitation Audits ───────────────────────────────────────────────────

export function auditInvitationCreated(
  invitationId: string,
  bidderName: string,
  rfqId: string,
  actor: string,
  actorRole: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    'bidder_invitation_created',
    actor,
    actorRole,
    'bidder_invitation',
    invitationId,
    `Bidder invitation created for ${bidderName}.`,
    { invitationId, bidderName },
    rfqId,
  );
}

export function auditInvitationAccepted(
  invitationId: string,
  bidderName: string,
  rfqId: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    'bidder_invitation_accepted',
    bidderName,
    'contractor',
    'bidder_invitation',
    invitationId,
    `${bidderName} accepted the invitation.`,
    { invitationId, bidderName },
    rfqId,
  );
}

export function auditInvitationDeclined(
  invitationId: string,
  bidderName: string,
  rfqId: string,
  reason?: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    'bidder_invitation_declined',
    bidderName,
    'contractor',
    'bidder_invitation',
    invitationId,
    `${bidderName} declined the invitation${reason ? `. Reason: ${reason}` : ''}.`,
    { invitationId, bidderName, declineReason: reason },
    rfqId,
  );
}

// ─── Clarification Audits ────────────────────────────────────────────────

export function auditClarificationSubmitted(
  questionId: string,
  bidderName: string,
  rfqId: string,
  isMaterial: boolean,
): ProcurementAuditRecord {
  return createAuditRecord(
    'clarification_question_submitted',
    bidderName,
    'contractor',
    'clarification_question',
    questionId,
    `Clarification question submitted by ${bidderName}. Material: ${isMaterial}.`,
    { questionId, bidderName, isMaterial },
    rfqId,
    undefined,
    isMaterial ? ['material_clarification_received'] : [],
  );
}

export function auditClarificationResponded(
  questionId: string,
  responderId: string,
  rfqId: string,
  escalated: boolean,
): ProcurementAuditRecord {
  return createAuditRecord(
    'clarification_response_recorded',
    responderId,
    'lead_professional',
    'clarification_question',
    questionId,
    `Clarification responded to. Escalated to addendum: ${escalated}.`,
    { questionId, responderId, escalated },
    rfqId,
    undefined,
    escalated ? ['clarification_escalated'] : [],
  );
}

// ─── Addendum Audits ─────────────────────────────────────────────────────

export function auditAddendumCreated(
  addendumId: string,
  subject: string,
  rfqId: string,
  actor: string,
  distributionCount: number,
): ProcurementAuditRecord {
  return createAuditRecord(
    'addendum_created',
    actor,
    'lead_professional',
    'addendum',
    addendumId,
    `Addendum #${addendumId} created: "${subject}". Distributed to ${distributionCount} bidders.`,
    { addendumId, subject, distributionCount },
    rfqId,
    undefined,
    ['equal_information_check'],
  );
}

export function auditAddendumDistributionVerified(
  addendumId: string,
  rfqId: string,
  verifiedBy: string,
  allBiddersCovered: boolean,
): ProcurementAuditRecord {
  return createAuditRecord(
    'addendum_distribution_verified',
    verifiedBy,
    'lead_professional',
    'addendum',
    addendumId,
    `Addendum distribution verified. All bidders covered: ${allBiddersCovered}.`,
    { addendumId, allBiddersCovered },
    rfqId,
    undefined,
    allBiddersCovered ? [] : ['EQUAL_INFORMATION_VIOLATION'],
  );
}

// ─── Quote Audits ────────────────────────────────────────────────────────

export function auditQuoteSubmitted(
  quoteId: string,
  bidderName: string,
  priceZar: number,
  rfqId: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    'quote_submitted',
    bidderName,
    'contractor',
    'quote_submission',
    quoteId,
    `Quote submitted by ${bidderName} for R${priceZar.toLocaleString()}.`,
    { quoteId, bidderName, priceZar },
    rfqId,
  );
}

export function auditQuoteValidated(
  quoteId: string,
  validationResult: string,
  rfqId: string,
  actor: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    'quote_validated',
    actor,
    'lead_professional',
    'quote_submission',
    quoteId,
    `Quote validation completed: ${validationResult}.`,
    { quoteId, validationResult },
    rfqId,
  );
}

// ─── Award Audits ────────────────────────────────────────────────────────

export function auditAwardRecommendationCreated(
  recommendationId: string,
  recommendedBidder: string,
  rfqId: string,
  actor: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    'award_recommendation_created',
    actor,
    'lead_professional',
    'award_recommendation',
    recommendationId,
    `Award recommendation created: ${recommendedBidder}.`,
    { recommendationId, recommendedBidder },
    rfqId,
  );
}

export function auditAwardApproved(
  recommendationId: string,
  approvedBy: string,
  approvalType: 'client' | 'professional',
  rfqId: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    approvalType === 'client' ? 'award_client_approved' : 'award_professional_approved',
    approvedBy,
    approvalType,
    'award_recommendation',
    recommendationId,
    `Award ${approvalType} approval recorded.`,
    { recommendationId, approvedBy, approvalType },
    rfqId,
  );
}

// ─── Guardrail Audits ────────────────────────────────────────────────────

export function auditGuardrailViolation(
  guardrailId: string,
  guardrailName: string,
  detail: string,
  rfqId: string,
  actor: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    'guardrail_violation',
    actor,
    'system',
    'procurement_guardrail',
    guardrailId,
    `Guardrail violation: ${guardrailName} — ${detail}`,
    { guardrailId, guardrailName, detail },
    rfqId,
    undefined,
    [guardrailId],
  );
}

export function auditFairnessCheck(
  rfqId: string,
  checkType: string,
  result: boolean,
  details: string,
  actor: string,
): ProcurementAuditRecord {
  return createAuditRecord(
    'fairness_audit_check',
    actor,
    'system',
    'fairness_check',
    rfqId,
    `Fairness check "${checkType}": ${result ? 'PASSED' : 'FAILED'} — ${details}`,
    { checkType, result, details },
    rfqId,
    undefined,
    result ? [] : ['FAIRNESS_AUDIT_FAILED'],
  );
}

export function getAuditGovernanceStatement(): string {
  return AUDIT_GOVERNANCE;
}
