/**
 * Audit Trail Service for Finance / Commercial Control
 *
 * Generates immutable audit records for every financial action.
 * POPIA and financial audit trails are required — every state change
 * must produce a timestamped, attributable audit entry.
 */
import type {
  CommercialBaseline,
  FinanceAuditRecord,
  FinancePartyRole,
  PaymentCertificate,
  ReleaseRequest,
  VariationRequest,
} from './types';

/**
 * Create a complete audit trail for the core commercial control workflow.
 */
export function createAuditTrail(
  baseline: CommercialBaseline,
  variation: VariationRequest,
  certificate: PaymentCertificate,
  release: ReleaseRequest,
  actorRole?: FinancePartyRole,
): FinanceAuditRecord[] {
  const ts = new Date().toISOString();

  return [
    createAuditEntry(
      `audit-${baseline.baselineId}`,
      'commercial_baseline_created',
      `Baseline contract sum R${baseline.currentContractSum.amount} (award R${baseline.award.contractSum.amount} + variations R${baseline.approvedVariationsTotal.amount}).`,
      actorRole,
      ts,
    ),
    createAuditEntry(
      `audit-${variation.variationId}`,
      'variation_approved',
      `Variation impact R${variation.estimatedImpact.amount}; programme impact ${variation.programmeImpactDays} days; approved: ${variation.approved}.`,
      actorRole,
      ts,
    ),
    createAuditEntry(
      `audit-${certificate.certificateId}`,
      'payment_certificate_created',
      `Claimed R${certificate.claimedAmount.amount}; certified R${certificate.certifiedAmount.amount}; retention R${certificate.retentionHeld.amount}; disputed R${certificate.disputedAmount.amount}; release R${certificate.approvedForRelease.amount}.`,
      actorRole,
      ts,
    ),
    createAuditEntry(
      `audit-${release.releaseRequestId}`,
      'third_party_provider_release_request_created',
      `Status: ${release.status}; provider: ${release.providerId}. Architex does not hold funds.`,
      actorRole,
      ts,
    ),
  ];
}

/** Create a single audit entry */
export function createAuditEntry(
  auditId: string,
  action: string,
  notes: string,
  actorRole?: FinancePartyRole,
  timestampIso?: string,
): FinanceAuditRecord {
  return {
    auditId,
    action,
    notes,
    actorRole,
    timestampIso: timestampIso ?? new Date().toISOString(),
  };
}

/**
 * Record a provider webhook event in the audit trail.
 */
export function auditProviderWebhook(
  providerId: string,
  providerReference: string,
  status: string,
  notes: string,
): FinanceAuditRecord {
  return createAuditEntry(
    `audit-webhook-${providerReference}-${Date.now()}`,
    `provider_webhook_${status}`,
    `Provider '${providerId}' reported status '${status}' for reference '${providerReference}'. ${notes}`,
    'financial_provider',
  );
}

/**
 * Record a dispute event in the audit trail.
 */
export function auditDispute(
  claimId: string,
  disputedAmount: number,
  reason?: string,
  actorRole?: FinancePartyRole,
): FinanceAuditRecord {
  return createAuditEntry(
    `audit-dispute-${claimId}-${Date.now()}`,
    'claim_disputed',
    `Claim '${claimId}' disputed for R${disputedAmount}.${reason ? ` Reason: ${reason}` : ''}`,
    actorRole,
  );
}

/**
 * Record a variation state change.
 */
export function auditVariationStateChange(
  variation: VariationRequest,
  fromStatus: string,
  toStatus: string,
  actorRole?: FinancePartyRole,
): FinanceAuditRecord {
  return createAuditEntry(
    `audit-var-${variation.variationId}-${Date.now()}`,
    `variation_${toStatus}`,
    `Variation '${variation.variationId}' transitioned: ${fromStatus} → ${toStatus}. Impact: R${variation.estimatedImpact.amount}.`,
    actorRole,
  );
}

/**
 * Create a retention audit entry.
 */
export function auditRetention(
  retentionId: string,
  action: string,
  amount: number,
  actorRole?: FinancePartyRole,
): FinanceAuditRecord {
  return createAuditEntry(
    `audit-ret-${retentionId}-${Date.now()}`,
    `retention_${action}`,
    `Retention '${retentionId}': ${action} — R${amount}.`,
    actorRole,
  );
}
