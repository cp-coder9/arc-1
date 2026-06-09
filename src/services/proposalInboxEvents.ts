/**
 * Proposal Inbox Events
 *
 * Generates inbox events based on proposal state transitions and conditions.
 * Integrates with the existing notification system (Firestore notifications collection).
 *
 * Event types:
 *   - proposal_ready_for_review
 *   - proposal_issued
 *   - proposal_accepted
 *   - proposal_expiring
 *   - terms_review_required
 */

import type { CashflowAgentEvent, ProposalStatus, ProposalTermsSnapshot } from '../types/proposalBuilder';

export interface InboxEvent {
  id: string;
  type: CashflowAgentEvent['type'];
  actor: CashflowAgentEvent['actor'];
  projectId: string;
  proposalId: string;
  message: string;
  /** Priority for display ordering */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Which roles should see this event */
  assignedRoles: string[];
  createdAt: string;
  /** ISO date when the event expires / should be dismissed */
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

interface EventContext {
  projectId: string;
  proposalId: string;
  status: ProposalStatus;
  payeeRole: string;
  clientUserId: string;
  professionalUserId: string;
}

/**
 * Generate inbox events based on the current proposal state.
 */
export function generateProposalInboxEvents(
  context: EventContext,
  terms?: ProposalTermsSnapshot,
  discountReason?: string,
): InboxEvent[] {
  const events: InboxEvent[] = [];
  const now = new Date().toISOString();

  // 1. Terms review required — when terms contain profession-specific terms needing approval
  if (terms && terms.standardTermsText && terms.standardTermsText.length > 100) {
    events.push({
      id: `inbox-${context.proposalId}-terms-review`,
      type: 'proposal_generated',
      actor: 'terms_agent',
      projectId: context.projectId,
      proposalId: context.proposalId,
      message: 'Terms and conditions require professional review before proposal can be issued.',
      priority: 'medium',
      assignedRoles: [context.payeeRole, 'client'],
      createdAt: now,
      metadata: { termsTemplateId: terms.termsTemplateId, termsTemplateVersion: terms.termsTemplateVersion },
    });
  }

  // 2. Discount reason missing
  if (discountReason !== undefined && discountReason.trim() === '') {
    events.push({
      id: `inbox-${context.proposalId}-discount-reason`,
      type: 'proposal_generated',
      actor: 'proposal_agent',
      projectId: context.projectId,
      proposalId: context.proposalId,
      message: 'A discount was applied without a reason. Please provide a reason before issuing.',
      priority: 'high',
      assignedRoles: [context.payeeRole, 'admin'],
      createdAt: now,
    });
  }

  // 3. Proposal ready for review — when status is professional_approved
  if (context.status === 'professional_approved') {
    events.push({
      id: `inbox-${context.proposalId}-ready-for-review`,
      type: 'proposal_generated',
      actor: 'proposal_agent',
      projectId: context.projectId,
      proposalId: context.proposalId,
      message: 'Proposal has been approved and is ready for final review before issuing.',
      priority: 'high',
      assignedRoles: [context.payeeRole],
      createdAt: now,
    });
  }

  // 4. Proposal issued — notify client
  if (context.status === 'issued') {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (terms?.validityPeriodDays ?? 14));

    events.push({
      id: `inbox-${context.proposalId}-issued`,
      type: 'proposal_issued',
      actor: 'proposal_agent',
      projectId: context.projectId,
      proposalId: context.proposalId,
      message: 'A proposal has been issued for your review and acceptance.',
      priority: 'high',
      assignedRoles: ['client'],
      createdAt: now,
      expiresAt: expiryDate.toISOString(),
      metadata: { validityPeriodDays: terms?.validityPeriodDays ?? 14 },
    });
  }

  // 5. Proposal accepted
  if (context.status === 'accepted') {
    events.push({
      id: `inbox-${context.proposalId}-accepted`,
      type: 'proposal_accepted',
      actor: 'acceptance_agent',
      projectId: context.projectId,
      proposalId: context.proposalId,
      message: 'Proposal has been accepted by the client. Proceed to appointment setup.',
      priority: 'high',
      assignedRoles: [context.payeeRole, 'admin'],
      createdAt: now,
    });
  }

  // 6. Proposal expiring — when validity period is within 3 days
  if (context.status === 'issued' && terms?.validityPeriodDays) {
    events.push({
      id: `inbox-${context.proposalId}-expiring`,
      type: 'proposal_issued',
      actor: 'proposal_agent',
      projectId: context.projectId,
      proposalId: context.proposalId,
      message: `Proposal validity period (${terms.validityPeriodDays} days) is approaching. Action may be required soon.`,
      priority: 'medium',
      assignedRoles: ['client', context.payeeRole],
      createdAt: now,
      metadata: { validityPeriodDays: terms.validityPeriodDays },
    });
  }

  return events;
}

/**
 * Get events filtered by role.
 */
export function inboxEventsForRole(events: InboxEvent[], role: string): InboxEvent[] {
  return events.filter((e) => e.assignedRoles.includes(role));
}

/**
 * Get events sorted by priority (highest first).
 */
export function sortInboxEventsByPriority(events: InboxEvent[]): InboxEvent[] {
  const priorityRank: Record<InboxEvent['priority'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return [...events].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}
