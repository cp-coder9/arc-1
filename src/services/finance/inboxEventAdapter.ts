/**
 * Inbox Event Adapter for Finance / Commercial Control
 *
 * Generates inbox notification events for all participants in the
 * commercial control workflow. Each financial state change produces
 * targeted events for the relevant role.
 */
import type {
  FinanceInboxEvent,
  FinancePartyRole,
  PaymentCertificate,
  ReleaseRequest,
  VariationRequest,
} from './types';

/**
 * Create all inbox events for the current financial state.
 */
export function createInboxEvents(
  certificate: PaymentCertificate,
  release: ReleaseRequest,
  variation?: VariationRequest,
): FinanceInboxEvent[] {
  const events: FinanceInboxEvent[] = [
    // Certificate review events
    {
      eventId: `evt-${certificate.certificateId}-review`,
      recipient: 'quantity_surveyor',
      title: 'Payment claim requires QS/valuation review',
      severity: 'action_required',
      description: `Claim for R${certificate.claimedAmount.amount} against milestone requires QS review and certification.`,
    },
    {
      eventId: `evt-${certificate.certificateId}-certify`,
      recipient: 'lead_professional',
      title: 'Payment certificate requires professional approval',
      severity: 'action_required',
      description: `Certified amount: R${certificate.certifiedAmount.amount}. Retention: R${certificate.retentionHeld.amount}.`,
    },
    // Release events
    {
      eventId: `evt-${release.releaseRequestId}-client`,
      recipient: 'client',
      title: 'Client approval required before provider release request',
      severity: 'action_required',
      description: `Request to release R${release.amount.amount} to provider '${release.providerId}'.`,
    },
  ];

  // Variation events
  if (variation) {
    events.push({
      eventId: `evt-${variation.variationId}-review`,
      recipient: 'quantity_surveyor',
      title: 'Variation requires cost review',
      severity: 'action_required',
      description: `Variation "${variation.description}" — estimated impact R${variation.estimatedImpact.amount}, programme impact ${variation.programmeImpactDays} days.`,
    });
  }

  // Provider configuration blocker
  if (release.status === 'provider_configuration_required') {
    events.push({
      eventId: `evt-${release.releaseRequestId}-provider`,
      recipient: 'platform_finance_admin',
      title: 'Configure registered third-party financial provider before live release',
      severity: 'blocked',
      description:
        'Release request cannot proceed without a live-configured third-party financial provider. Architex does not hold client funds — all releases must go through a registered provider.',
    });
  }

  // Dispute blocker
  if (release.status === 'disputed_locked') {
    events.push({
      eventId: `evt-${release.releaseRequestId}-dispute`,
      recipient: 'lead_professional',
      title: 'Dispute lock prevents payment release',
      severity: 'blocked',
      description: `Disputed amount: R${certificate.disputedAmount.amount}. Resolve the dispute before release can proceed.`,
    });
  }

  // Certificate issued notification
  if (certificate.status !== 'draft') {
    events.push({
      eventId: `evt-${certificate.certificateId}-issued`,
      recipient: 'contractor',
      title: 'Payment certificate issued',
      severity: 'info',
      description: `Certificate issued: claimed R${certificate.claimedAmount.amount}, certified R${certificate.certifiedAmount.amount}, retention R${certificate.retentionHeld.amount}, net payable R${certificate.approvedForRelease.amount}.`,
    });
  }

  return events;
}

/**
 * Create a targeted inbox event for a specific trigger.
 */
export function createTargetedInboxEvent(input: {
  recipient: FinancePartyRole;
  title: string;
  severity: FinanceInboxEvent['severity'];
  description?: string;
}): FinanceInboxEvent {
  return {
    eventId: `evt-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
    recipient: input.recipient,
    title: input.title,
    severity: input.severity,
    description: input.description,
  };
}

/**
 * Generate events for variation state changes.
 */
export function createVariationInboxEvents(
  variation: VariationRequest,
): FinanceInboxEvent[] {
  const events: FinanceInboxEvent[] = [];

  if (variation.status === 'submitted') {
    events.push({
      eventId: `evt-${variation.variationId}-submitted`,
      recipient: 'lead_professional',
      title: 'New variation request submitted',
      severity: 'action_required',
      description: `Variation "${variation.description}" submitted by ${variation.requestedBy} — R${variation.estimatedImpact.amount}.`,
    });
  }

  if (variation.status === 'approved') {
    events.push({
      eventId: `evt-${variation.variationId}-approved`,
      recipient: variation.requestedBy,
      title: 'Variation request approved',
      severity: 'info',
      description: `Variation "${variation.description}" has been approved.`,
    });
  }

  if (variation.status === 'rejected') {
    events.push({
      eventId: `evt-${variation.variationId}-rejected`,
      recipient: variation.requestedBy,
      title: 'Variation request rejected',
      severity: 'action_required',
      description: `Variation "${variation.description}" was not approved. Review feedback and resubmit if needed.`,
    });
  }

  return events;
}

/**
 * Generate retention-related inbox events.
 */
export function createRetentionInboxEvents(input: {
  projectId: string;
  retentionAmount: number;
  releaseDate?: string;
  recipient: FinancePartyRole;
}): FinanceInboxEvent[] {
  const events: FinanceInboxEvent[] = [
    {
      eventId: `evt-retention-${input.projectId}-${Date.now()}`,
      recipient: input.recipient,
      title: 'Retention held against payment certificate',
      severity: 'info',
      description: `R${input.retentionAmount} held as retention.${input.releaseDate ? ` Scheduled release: ${input.releaseDate}.` : ''}`,
    },
  ];

  if (input.releaseDate) {
    events.push({
      eventId: `evt-retention-due-${input.projectId}`,
      recipient: 'client',
      title: 'Retention release due',
      severity: 'action_required',
      description: `Retention of R${input.retentionAmount} is scheduled for release on ${input.releaseDate}.`,
    });
  }

  return events;
}
