/**
 * Audit Trail Service for Finance / Commercial Control
 *
 * Generates immutable audit records for every financial action.
 * POPIA and financial audit trails are required — every state change
 * must produce a timestamped, attributable audit entry.
 *
 * Enhanced for Sprint 6 — Commercial Control & RBAC Hardening:
 * - ImmutableAuditRecord with 5-year retention
 * - Admin SDK Firestore writes to audit_logs collection
 * - Tamper-attempt detection and rejection
 *
 * @module finance/auditTrailService
 */
import type {
  CommercialBaseline,
  FinanceAuditRecord,
  FinancePartyRole,
  MoneyAmount,
  PaymentCertificate,
  ReleaseRequest,
  VariationRequest,
} from './types';

// ─── Immutable Audit Record Types (Sprint 6) ─────────────────────────────────

/**
 * All auditable financial action types.
 * Covers payment lifecycle, escrow FSM, contract gates, provider events, and tamper detection.
 */
export type AuditAction =
  | 'claim_submitted'
  | 'claim_rejected'
  | 'claim_certified'
  | 'claim_linked'
  | 'payment_released'
  | 'payment_failed'
  | 'refund_initiated'
  | 'escrow_funded'
  | 'escrow_released'
  | 'escrow_disputed'
  | 'escrow_timeout'
  | 'contract_generated'
  | 'contract_signed'
  | 'contract_locked'
  | 'contract_varied'
  | 'provider_webhook_received'
  | 'tamper_attempt';

/**
 * Evidence reference types linking audit records to source artifacts.
 */
export type EvidenceReferenceType =
  | 'provider_transaction'
  | 'document_version'
  | 'approval_chain'
  | 'webhook_event'
  | 'certificate';

/**
 * A single evidence reference tying an audit record to a verifiable artifact.
 */
export interface EvidenceReference {
  type: EvidenceReferenceType;
  referenceId: string;
}

/**
 * Human confirmation references for payment release audit records.
 * Records both the certifier and the approver with their roles.
 */
export interface HumanConfirmation {
  certifierUid?: string;
  certifierRole?: string;
  approverUid?: string;
  approverRole?: string;
}

/**
 * Immutable audit record — the canonical financial audit document.
 *
 * Written to Firestore `audit_logs/{auditId}` via Admin SDK.
 * Enforced append-only by Firestore security rules (create allowed, update/delete denied).
 * Retained for 5 years from creation date.
 */
export interface ImmutableAuditRecord {
  auditId: string;
  actorUid: string;
  actorRole: string;
  action: AuditAction;
  timestampIso: string; // ISO 8601
  monetaryAmount?: MoneyAmount;
  targetResourceId: string;
  evidenceReferences: EvidenceReference[];
  previousState?: string;
  newState?: string;
  humanConfirmation?: HumanConfirmation;
  immutable: true; // always true — enforced by Firestore rules
  retentionExpiresAtIso: string; // createdAt + 5 years
}

/**
 * Input type for writeImmutableAuditRecord — omits auto-generated fields.
 */
export type ImmutableAuditRecordInput = Omit<
  ImmutableAuditRecord,
  'auditId' | 'immutable' | 'retentionExpiresAtIso'
>;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Firestore collection path for immutable audit records */
const AUDIT_LOGS_COLLECTION = 'audit_logs';

/** Retention period in years for financial audit records */
const RETENTION_YEARS = 5;

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates a unique audit record ID using crypto.randomUUID with fallback.
 */
function generateAuditId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Retention Calculation ────────────────────────────────────────────────────

/**
 * Calculates the retention expiry date — exactly 5 years from creation.
 */
export function calculateRetentionExpiry(createdAtIso: string): string {
  const createdAt = new Date(createdAtIso);
  const expiryDate = new Date(createdAt);
  expiryDate.setFullYear(expiryDate.getFullYear() + RETENTION_YEARS);
  return expiryDate.toISOString();
}

// ─── Immutable Audit Writer (Admin SDK) ───────────────────────────────────────

/**
 * Writes an immutable audit record to Firestore via Admin SDK.
 *
 * - Generates a unique auditId
 * - Sets `immutable: true`
 * - Calculates 5-year retention expiry from the record's timestamp
 * - Writes to `audit_logs/{auditId}` collection
 *
 * Returns the generated auditId.
 *
 * @throws If Firestore write fails (caller should handle retries)
 */
export async function writeImmutableAuditRecord(
  record: ImmutableAuditRecordInput,
): Promise<string> {
  // Lazy-import Admin SDK to avoid circular dependencies and allow
  // this module to be imported in client-side code for types only
  const { adminDb } = await import('@/lib/firebase-admin');

  const auditId = generateAuditId();
  const retentionExpiresAtIso = calculateRetentionExpiry(record.timestampIso);

  const immutableRecord: ImmutableAuditRecord = {
    ...record,
    auditId,
    immutable: true,
    retentionExpiresAtIso,
  };

  await adminDb
    .collection(AUDIT_LOGS_COLLECTION)
    .doc(auditId)
    .create(immutableRecord);

  return auditId;
}

// ─── Tamper Rejection ─────────────────────────────────────────────────────────

/**
 * Result of a rejected audit mutation attempt.
 */
export interface AuditMutationRejection {
  status: 403;
  error: string;
  tamperAuditId: string;
}

/**
 * Rejects an attempted modification or deletion of an existing audit record.
 *
 * - Writes a separate `tamper_attempt` audit entry recording the actor, target, and operation
 * - Returns a 403 rejection object for the caller to propagate
 *
 * Per Requirement 8.4: any attempt to modify or delete an audit record SHALL be
 * rejected with 403 and a tamper-attempt audit entry SHALL be created.
 */
export async function rejectAuditMutation(
  actorUid: string,
  targetRecordId: string,
  operation: string,
): Promise<AuditMutationRejection> {
  const timestampIso = new Date().toISOString();

  const tamperAuditId = await writeImmutableAuditRecord({
    actorUid,
    actorRole: 'unknown', // role may not be trustworthy if actor is attempting tampering
    action: 'tamper_attempt',
    timestampIso,
    targetResourceId: targetRecordId,
    evidenceReferences: [
      {
        type: 'document_version',
        referenceId: targetRecordId,
      },
    ],
    previousState: 'immutable',
    newState: `attempted_${operation}`,
  });

  return {
    status: 403,
    error: `Audit record mutation denied. Operation '${operation}' on record '${targetRecordId}' is not permitted. Tamper attempt logged.`,
    tamperAuditId,
  };
}

// ─── Convenience Audit Writers (Sprint 6 — Task 11.1) ─────────────────────────

/**
 * Input for writing a payment release audit record.
 * Ensures human confirmation and provider references are always included.
 */
export interface PaymentReleaseAuditInput {
  actorUid: string;
  actorRole: string;
  targetResourceId: string;
  monetaryAmount: MoneyAmount;
  providerTransactionRef: string;
  certificateId: string;
  certifierUid: string;
  certifierRole: string;
  approverUid: string;
  approverRole: string;
}

/**
 * Writes a payment release audit record ensuring human confirmation references
 * (certifier UID/role, approver UID/role) and provider references are always included.
 *
 * Per Requirement 8.6: every payment release record SHALL include both provider references
 * and human confirmation references.
 */
export async function writePaymentReleaseAudit(
  input: PaymentReleaseAuditInput,
): Promise<string> {
  return writeImmutableAuditRecord({
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    action: 'payment_released',
    timestampIso: new Date().toISOString(),
    monetaryAmount: input.monetaryAmount,
    targetResourceId: input.targetResourceId,
    evidenceReferences: [
      { type: 'provider_transaction', referenceId: input.providerTransactionRef },
      { type: 'certificate', referenceId: input.certificateId },
    ],
    humanConfirmation: {
      certifierUid: input.certifierUid,
      certifierRole: input.certifierRole,
      approverUid: input.approverUid,
      approverRole: input.approverRole,
    },
  });
}

/**
 * Input for writing a provider webhook audit record.
 * Ensures provider ID, reference, transaction ID, status, amount, and confirmation timestamp
 * are all captured.
 */
export interface ProviderWebhookAuditInput {
  providerId: string;
  providerReference: string;
  transactionId: string;
  status: string;
  monetaryAmount: MoneyAmount;
  confirmationTimestampIso: string;
}

/**
 * Writes a provider webhook audit record with all required provider event fields.
 *
 * Per Requirement 8.5: THE Audit_Service SHALL record the provider ID, provider reference,
 * transaction ID, reported status, monetary amount, and confirmation timestamp.
 */
export async function writeProviderWebhookAudit(
  input: ProviderWebhookAuditInput,
): Promise<string> {
  return writeImmutableAuditRecord({
    actorUid: input.providerId,
    actorRole: 'financial_provider',
    action: 'provider_webhook_received',
    timestampIso: input.confirmationTimestampIso,
    monetaryAmount: input.monetaryAmount,
    targetResourceId: input.transactionId,
    evidenceReferences: [
      { type: 'webhook_event', referenceId: input.providerReference },
      { type: 'provider_transaction', referenceId: input.transactionId },
    ],
    previousState: input.status,
    newState: input.status,
  });
}

/**
 * Input for writing an escrow state transition audit record.
 * Ensures previous/new state and trigger event are always captured.
 */
export interface EscrowTransitionAuditInput {
  actorUid: string;
  actorRole: string;
  walletId: string;
  previousState: string;
  newState: string;
  triggerEventId: string;
  triggerEventType: EvidenceReferenceType;
  monetaryAmount?: MoneyAmount;
  providerReference?: string;
}

/**
 * Writes an escrow state transition audit record ensuring previous/new state
 * and trigger event evidence are always included.
 *
 * Per Requirement 8.2: THE Audit_Service SHALL write an immutable record including
 * previous state, new state, trigger event identifier, timestamp, and provider reference.
 */
export async function writeEscrowTransitionAudit(
  input: EscrowTransitionAuditInput,
): Promise<string> {
  const evidenceReferences: EvidenceReference[] = [
    { type: input.triggerEventType, referenceId: input.triggerEventId },
  ];

  if (input.providerReference) {
    evidenceReferences.push({
      type: 'provider_transaction',
      referenceId: input.providerReference,
    });
  }

  return writeImmutableAuditRecord({
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    action: mapEscrowTransitionAction(input.newState),
    timestampIso: new Date().toISOString(),
    monetaryAmount: input.monetaryAmount,
    targetResourceId: input.walletId,
    evidenceReferences,
    previousState: input.previousState,
    newState: input.newState,
  });
}

/**
 * Maps an escrow target state to the corresponding audit action.
 */
function mapEscrowTransitionAction(newState: string): AuditAction {
  switch (newState) {
    case 'FundedHeld':
      return 'escrow_funded';
    case 'Released':
      return 'escrow_released';
    case 'Disputed':
      return 'escrow_disputed';
    case 'Unfunded':
      return 'escrow_timeout';
    default:
      return 'escrow_funded';
  }
}

// ─── Legacy Helpers (Pack 5 compatibility) ────────────────────────────────────

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
