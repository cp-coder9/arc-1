/**
 * Procurement Inbox Event Adapter
 *
 * Generates inbox events for all procurement workflow state changes.
 * Routes actions to the appropriate participant roles:
 *   - client, lead_professional, quantity_surveyor
 *   - contractor, subcontractor, supplier
 *   - specialist_consultant, freelancer_candidate_professional
 *   - marketplace_admin
 */

export type InboxEventSeverity = 'info' | 'action_required' | 'blocked' | 'critical';
export type ProcurementParticipantRole =
  | 'client'
  | 'lead_professional'
  | 'quantity_surveyor'
  | 'contractor'
  | 'subcontractor'
  | 'supplier'
  | 'specialist_consultant'
  | 'freelancer_candidate_professional'
  | 'marketplace_admin';

export interface ProcurementInboxEvent {
  eventId: string;
  recipientRole: ProcurementParticipantRole;
  recipientId?: string;
  title: string;
  description: string;
  severity: InboxEventSeverity;
  action: string;
  targetType: string;
  targetId: string;
  moduleKey: 'procurement_marketplace';
  createdAt: string;
  readAt?: string;
  actedAt?: string;
}

function createEvent(
  recipientRole: ProcurementParticipantRole,
  title: string,
  description: string,
  severity: InboxEventSeverity,
  action: string,
  targetType: string,
  targetId: string,
  recipientId?: string,
): ProcurementInboxEvent {
  return {
    eventId: `inbox_proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    recipientRole,
    recipientId,
    title,
    description,
    severity,
    action,
    targetType,
    targetId,
    moduleKey: 'procurement_marketplace',
    createdAt: new Date().toISOString(),
  };
}

// ─── RFQ Package Events ──────────────────────────────────────────────────

export function rfqCreatedEvent(rfqTitle: string, rfqId: string): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `RFQ Package Created: ${rfqTitle}`,
    `A new RFQ package "${rfqTitle}" has been created and requires review before issue.`,
    'action_required',
    'Review and issue RFQ package',
    'rfq_package',
    rfqId,
  );
}

export function rfqReadyForIssueEvent(rfqTitle: string, rfqId: string): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `RFQ Ready for Issue: ${rfqTitle}`,
    `RFQ package "${rfqTitle}" has passed completeness checks and is ready for issue.`,
    'action_required',
    'Issue RFQ package to bidders',
    'rfq_package',
    rfqId,
  );
}

// ─── Invitation Events ───────────────────────────────────────────────────

export function bidderInvitedEvent(
  bidderId: string,
  rfqTitle: string,
  invitationId: string,
): ProcurementInboxEvent {
  return createEvent(
    'contractor',
    `You are invited to quote: ${rfqTitle}`,
    `You have been invited to submit a quote for the RFQ "${rfqTitle}". Review the package and submit your quote before the deadline.`,
    'action_required',
    'Review RFQ and submit quote',
    'bidder_invitation',
    invitationId,
    bidderId,
  );
}

export function invitationAcceptedEvent(
  bidderName: string,
  rfqTitle: string,
  invitationId: string,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `${bidderName} accepted invitation`,
    `${bidderName} has accepted the invitation to quote for "${rfqTitle}".`,
    'info',
    'Await quote submission',
    'bidder_invitation',
    invitationId,
  );
}

export function invitationDeclinedEvent(
  bidderName: string,
  rfqTitle: string,
  reason: string | undefined,
  invitationId: string,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `${bidderName} declined invitation`,
    `${bidderName} has declined the invitation to quote for "${rfqTitle}".${reason ? ` Reason: ${reason}` : ''}`,
    'info',
    'Review bidder shortlist',
    'bidder_invitation',
    invitationId,
  );
}

export function insufficientBiddersEvent(
  rfqTitle: string,
  rfqId: string,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `Insufficient Bidders: ${rfqTitle}`,
    `RFQ "${rfqTitle}" has fewer than the minimum required bidders. Consider extending invitations or adjusting procurement strategy.`,
    'blocked',
    'Invite additional bidders',
    'rfq_package',
    rfqId,
  );
}

// ─── Clarification Events ────────────────────────────────────────────────

export function clarificationReceivedEvent(
  bidderName: string,
  question: string,
  questionId: string,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `Clarification Question from ${bidderName}`,
    `Question: "${question.slice(0, 200)}"`,
    'action_required',
    'Review and respond to clarification',
    'clarification_question',
    questionId,
  );
}

export function clarificationEscalatedEvent(
  subject: string,
  addendumId: string,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `Material Clarification Requires Addendum: ${subject}`,
    `A clarification has been escalated because it materially affects scope, price, programme, or risk. An addendum must be issued to ALL bidders.`,
    'action_required',
    'Create and issue addendum to all bidders',
    'addendum',
    addendumId,
  );
}

// ─── Addendum Events ─────────────────────────────────────────────────────

export function addendumIssuedEvent(
  addendumSubject: string,
  addendumId: string,
  bidderIds: string[],
): ProcurementInboxEvent[] {
  return bidderIds.map((bidderId) =>
    createEvent(
      'contractor',
      `Addendum Issued: ${addendumSubject}`,
      `An addendum has been issued for the RFQ. Review the updated information before submitting your quote. Equal-information principle applies — all bidders receive the same information.`,
      'info',
      'Review addendum and update quote if needed',
      'addendum',
      addendumId,
      bidderId,
    ),
  );
}

// ─── Quote Events ────────────────────────────────────────────────────────

export function quoteSubmittedEvent(
  bidderName: string,
  priceZar: number,
  quoteId: string,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `Quote Submitted: ${bidderName}`,
    `${bidderName} submitted a quote for R${priceZar.toLocaleString()}. Review and validate against returnables.`,
    'action_required',
    'Validate and compare quote',
    'quote_submission',
    quoteId,
  );
}

export function quoteValidationFailedEvent(
  bidderName: string,
  validationSummary: string,
  quoteId: string,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `Quote Validation Issues: ${bidderName}`,
    `${bidderName}'s quote has compliance issues: ${validationSummary.slice(0, 200)}`,
    'action_required',
    'Request missing returnables from bidder',
    'quote_submission',
    quoteId,
  );
}

// ─── Award Events ────────────────────────────────────────────────────────

export function awardRecommendationCreatedEvent(
  recommendedBidder: string,
  priceZar: number,
  recommendationId: string,
): ProcurementInboxEvent {
  return createEvent(
    'client',
    `Award Recommendation: ${recommendedBidder}`,
    `Award recommended to ${recommendedBidder} at R${priceZar.toLocaleString()}. Your approval is required before the appointment can proceed.`,
    'action_required',
    'Review and approve award recommendation',
    'award_recommendation',
    recommendationId,
  );
}

export function awardPendingProfessionalApprovalEvent(
  recommendedBidder: string,
  recommendationId: string,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `Award Awaiting Professional Approval: ${recommendedBidder}`,
    `The client has approved the award to ${recommendedBidder}. Professional approval is now required.`,
    'action_required',
    'Review and approve award recommendation',
    'award_recommendation',
    recommendationId,
  );
}

export function awardApprovedEvent(
  recommendedBidder: string,
  priceZar: number,
  recommendationId: string,
): ProcurementInboxEvent {
  return createEvent(
    'marketplace_admin',
    `Award Approved: ${recommendedBidder}`,
    `Award to ${recommendedBidder} at R${priceZar.toLocaleString()} has been approved by both client and professional. Appointment can now be created.`,
    'info',
    'Create procurement appointment',
    'award_recommendation',
    recommendationId,
  );
}

export function conflictOfInterestBlockedEvent(
  recommendationId: string,
  conflictSummary: string,
): ProcurementInboxEvent {
  return createEvent(
    'marketplace_admin',
    'Conflict of Interest Detected — Award Blocked',
    `Award recommendation ${recommendationId} has been blocked due to: ${conflictSummary.slice(0, 200)}`,
    'critical',
    'Investigate and resolve conflict of interest',
    'award_recommendation',
    recommendationId,
  );
}

// ─── General Procurement Events ──────────────────────────────────────────

export function procurementDeadlineApproachingEvent(
  rfqTitle: string,
  rfqId: string,
  daysRemaining: number,
  activeBidders: number,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `Deadline Approaching: ${rfqTitle}`,
    `${daysRemaining} day(s) remaining until RFQ deadline. ${activeBidders} active bidder(s) yet to submit.`,
    daysRemaining <= 2 ? 'action_required' : 'info',
    daysRemaining <= 2 ? 'Send reminders to bidders' : 'Monitor bidder progress',
    'rfq_package',
    rfqId,
  );
}

export function marketplaceMatchEvent(
  matchCount: number,
  rfqTitle: string,
  rfqId: string,
): ProcurementInboxEvent {
  return createEvent(
    'lead_professional',
    `Marketplace Matches Found: ${rfqTitle}`,
    `${matchCount} potential bidders matched from the marketplace. Matches are advisory only — human selection required.`,
    'info',
    'Review marketplace matches and invite suitable bidders',
    'rfq_package',
    rfqId,
  );
}
