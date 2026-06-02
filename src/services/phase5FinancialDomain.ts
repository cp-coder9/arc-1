import type { Invoice, InvoiceItem, PaymentType, ProjectStage } from '@/types';

export type Phase5EscrowStatus =
  | 'pending_funding'
  | 'funded'
  | 'held'
  | 'partially_released'
  | 'released'
  | 'disputed'
  | 'refunded'
  | 'cancelled';

export type EscrowEvent =
  | 'fund'
  | 'hold'
  | 'request_dispute'
  | 'release_partial'
  | 'release_full'
  | 'refund'
  | 'cancel'
  | 'resolve_dispute_hold'
  | 'resolve_dispute_release';

export interface Phase5LedgerEntryDraft {
  projectId: string;
  jobId: string;
  type: PaymentType | 'invoice_payment' | 'claim_payment' | 'escrow_hold' | 'dispute_resolution';
  amount: number;
  direction: 'credit' | 'debit';
  description: string;
  payerId: string;
  payeeId: string;
  paymentId?: string;
  escrowMilestoneId?: string;
  contractId?: string;
  invoiceId?: string;
  claimId?: string;
  disputeId?: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface EscrowTransitionContext {
  heldAmount: number;
  releasedAmount: number;
  releaseAmount?: number;
}

export interface Phase5ClaimDraft {
  projectId: string;
  jobId: string;
  contractId?: string;
  invoiceId?: string;
  milestoneId?: string;
  claimantId: string;
  respondentId: string;
  amount: number;
  currency: string;
  reason: string;
  evidenceIds: string[];
  status: 'submitted';
  createdAt: string;
}

export interface Phase5FeeScheduleDraft {
  id: string;
  name: string;
  version: string;
  jurisdiction: 'ZA' | 'platform';
  platformFeePercentage: number;
  vatPercentage: number;
  effectiveFrom: string;
  createdBy: string;
  status: 'draft' | 'active' | 'retired';
}

export interface Phase5DisputeEvidenceDraft {
  disputeId: string;
  projectId: string;
  jobId: string;
  submittedBy: string;
  sourceType: 'document' | 'message' | 'ledger_entry' | 'invoice' | 'claim' | 'audit_event' | 'photo' | 'other';
  sourceId: string;
  description: string;
  capturedAt: string;
  immutableReference: string;
}

export interface Phase5FeeBreakdown {
  grossAmount: number;
  platformFeeAmount: number;
  vatAmount: number;
  netPayableAmount: number;
  feeScheduleId: string;
  calculatedAt: string;
}

export interface AppendOnlyLedgerMutation {
  before?: Partial<Phase5LedgerEntryDraft> | null;
  after: Partial<Phase5LedgerEntryDraft>;
  actorId: string;
  reason: string;
}

export interface Phase5InvoiceDraftInput {
  invoiceNumber: string;
  jobId: string;
  clientId: string;
  architectId: string;
  items: Array<Omit<InvoiceItem, 'total'> & { total?: number }>;
  taxRate: number;
  currency?: string;
  dueDate: string;
  createdAt?: string;
  notes?: string;
}

export const ESCROW_TRANSITIONS: Readonly<Record<Phase5EscrowStatus, readonly EscrowEvent[]>> = Object.freeze({
  pending_funding: ['fund', 'cancel'],
  funded: ['hold', 'request_dispute', 'release_partial', 'release_full', 'refund'],
  held: ['request_dispute', 'release_partial', 'release_full', 'refund'],
  partially_released: ['hold', 'request_dispute', 'release_partial', 'release_full', 'refund'],
  released: [],
  disputed: ['resolve_dispute_hold', 'resolve_dispute_release', 'refund'],
  refunded: [],
  cancelled: [],
});

export function assertEscrowTransitionAllowed(
  currentStatus: Phase5EscrowStatus,
  event: EscrowEvent,
  context: EscrowTransitionContext
): Phase5EscrowStatus {
  if (!ESCROW_TRANSITIONS[currentStatus].includes(event)) {
    throw new Error(`Escrow transition ${currentStatus} -> ${event} is not allowed`);
  }

  const releaseAmount = context.releaseAmount ?? 0;
  if ((event === 'release_partial' || event === 'release_full') && releaseAmount <= 0) {
    throw new Error('Release amount must be greater than zero');
  }
  if ((event === 'release_partial' || event === 'release_full') && releaseAmount > context.heldAmount) {
    throw new Error('Release amount cannot exceed held escrow amount');
  }
  if (event === 'release_full' && releaseAmount !== context.heldAmount) {
    throw new Error('Full release must release the complete held amount');
  }
  if (event === 'release_partial' && releaseAmount >= context.heldAmount) {
    throw new Error('Partial release must leave funds in escrow');
  }

  switch (event) {
    case 'fund':
      return 'funded';
    case 'hold':
    case 'resolve_dispute_hold':
      return 'held';
    case 'request_dispute':
      return 'disputed';
    case 'release_partial':
      return 'partially_released';
    case 'release_full':
    case 'resolve_dispute_release':
      return 'released';
    case 'refund':
      return 'refunded';
    case 'cancel':
      return 'cancelled';
  }
}

export function buildPaymentCallbackIdempotencyKey(provider: string, providerReference: string, paymentId: string): string {
  const parts = [provider, providerReference, paymentId].map((value) => value.trim());
  if (parts.some((value) => value.length === 0)) throw new Error('Provider, provider reference, and payment id are required for idempotency');
  return parts.join(':').toLowerCase();
}

export function buildLedgerEntryDraft(entry: Omit<Phase5LedgerEntryDraft, 'createdAt'> & { createdAt?: string }): Readonly<Phase5LedgerEntryDraft> {
  if (!Number.isFinite(entry.amount) || entry.amount <= 0) throw new Error('Ledger amount must be greater than zero');
  if (!entry.idempotencyKey.trim()) throw new Error('Ledger entry requires an idempotency key');
  if (!entry.description.trim()) throw new Error('Ledger entry requires a description');
  requireNonBlank(entry.projectId, 'Project id');
  requireNonBlank(entry.jobId, 'Job id');
  requireNonBlank(entry.payerId, 'Ledger payer id');
  requireNonBlank(entry.payeeId, 'Ledger payee id');

  return Object.freeze({
    ...entry,
    projectId: entry.projectId.trim(),
    jobId: entry.jobId.trim(),
    payerId: entry.payerId.trim(),
    payeeId: entry.payeeId.trim(),
    idempotencyKey: entry.idempotencyKey.trim().toLowerCase(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
  });
}

export function assertAppendOnlyLedgerMutationAllowed(mutation: AppendOnlyLedgerMutation): void {
  requireNonBlank(mutation.actorId, 'Ledger mutation actor id');
  requireNonBlank(mutation.reason, 'Ledger mutation reason');
  if (mutation.before) {
    throw new Error('Ledger entries are append-only; create a reversal or adjustment entry instead of updating an existing entry');
  }
  if (!mutation.after.idempotencyKey?.trim()) throw new Error('Append-only ledger creation requires idempotency metadata');
}

export function buildDisputeEscrowHold(disputeId: string, projectId: string, jobId: string, filedBy: string, stage?: ProjectStage) {
  if (!disputeId || !projectId || !jobId || !filedBy) throw new Error('Dispute hold requires dispute, project, job, and actor ids');
  return Object.freeze({
    disputeId,
    projectId,
    jobId,
    filedBy,
    stage,
    escrowEvent: 'request_dispute' as const,
    escrowStatus: 'disputed' as const,
    reason: 'Dispute opened, escrow release must be held pending resolution',
  });
}

function requireNonBlank(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function requirePositiveAmount(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero`);
  return value;
}

export function buildInvoiceDraft(input: Phase5InvoiceDraftInput): Readonly<Omit<Invoice, 'id'>> {
  const taxRate = input.taxRate;
  if (!Number.isFinite(taxRate) || taxRate < 0) throw new Error('Invoice tax rate cannot be negative');
  if (input.items.length === 0) throw new Error('Invoice requires at least one line item');

  const items: InvoiceItem[] = input.items.map((item) => {
    requireNonBlank(item.description, 'Invoice item description');
    requirePositiveAmount(item.quantity, 'Invoice item quantity');
    requirePositiveAmount(item.unitPrice, 'Invoice item unit price');
    const total = item.total ?? Math.round(item.quantity * item.unitPrice);
    requirePositiveAmount(total, 'Invoice item total');
    return Object.freeze({ ...item, total });
  });
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100));

  return Object.freeze({
    invoiceNumber: requireNonBlank(input.invoiceNumber, 'Invoice number'),
    jobId: requireNonBlank(input.jobId, 'Job id'),
    clientId: requireNonBlank(input.clientId, 'Client id'),
    architectId: requireNonBlank(input.architectId, 'Architect id'),
    items,
    subtotal,
    taxAmount,
    taxRate,
    totalAmount: subtotal + taxAmount,
    currency: input.currency ?? 'R',
    status: 'draft' as const,
    dueDate: requireNonBlank(input.dueDate, 'Invoice due date'),
    createdAt: input.createdAt ?? new Date().toISOString(),
    notes: input.notes,
  });
}

export function buildClaimDraft(input: Omit<Phase5ClaimDraft, 'status' | 'createdAt'> & { createdAt?: string }): Readonly<Phase5ClaimDraft> {
  if (input.evidenceIds.length === 0) throw new Error('Claim requires at least one evidence reference');
  return Object.freeze({
    ...input,
    projectId: requireNonBlank(input.projectId, 'Project id'),
    jobId: requireNonBlank(input.jobId, 'Job id'),
    claimantId: requireNonBlank(input.claimantId, 'Claimant id'),
    respondentId: requireNonBlank(input.respondentId, 'Respondent id'),
    amount: requirePositiveAmount(input.amount, 'Claim amount'),
    currency: requireNonBlank(input.currency, 'Claim currency'),
    reason: requireNonBlank(input.reason, 'Claim reason'),
    evidenceIds: input.evidenceIds.map((id) => requireNonBlank(id, 'Evidence id')),
    status: 'submitted',
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function calculateFeeBreakdown(input: { grossAmount: number; feeSchedule: Phase5FeeScheduleDraft; calculatedAt?: string }): Readonly<Phase5FeeBreakdown> {
  const grossAmount = requirePositiveAmount(input.grossAmount, 'Gross amount');
  const feeSchedule = buildFeeScheduleDraft(input.feeSchedule);
  const platformFeeAmount = Math.round(grossAmount * feeSchedule.platformFeePercentage);
  const vatAmount = Math.round(platformFeeAmount * feeSchedule.vatPercentage);
  const netPayableAmount = grossAmount - platformFeeAmount - vatAmount;
  if (netPayableAmount < 0) throw new Error('Fee breakdown cannot produce a negative net payable amount');
  return Object.freeze({ grossAmount, platformFeeAmount, vatAmount, netPayableAmount, feeScheduleId: feeSchedule.id, calculatedAt: input.calculatedAt ?? new Date().toISOString() });
}

export function buildInvoicePaymentLedgerEntry(input: {
  invoice: Pick<Invoice, 'id' | 'jobId' | 'clientId' | 'architectId' | 'totalAmount' | 'invoiceNumber'>;
  projectId: string;
  paymentId: string;
  provider: string;
  providerReference: string;
  paidAt?: string;
}): Readonly<Phase5LedgerEntryDraft> {
  return buildLedgerEntryDraft({
    projectId: requireNonBlank(input.projectId, 'Project id'),
    jobId: requireNonBlank(input.invoice.jobId, 'Job id'),
    type: 'invoice_payment',
    amount: requirePositiveAmount(input.invoice.totalAmount, 'Invoice payment amount'),
    direction: 'credit',
    description: `Invoice ${requireNonBlank(input.invoice.invoiceNumber, 'Invoice number')} payment`,
    payerId: requireNonBlank(input.invoice.clientId, 'Invoice client id'),
    payeeId: requireNonBlank(input.invoice.architectId, 'Invoice architect id'),
    paymentId: requireNonBlank(input.paymentId, 'Payment id'),
    invoiceId: requireNonBlank(input.invoice.id, 'Invoice id'),
    idempotencyKey: buildPaymentCallbackIdempotencyKey(input.provider, input.providerReference, input.paymentId),
    createdAt: input.paidAt,
  });
}

export function buildClaimPaymentLedgerEntry(input: {
  claim: Phase5ClaimDraft & { id: string };
  paymentId: string;
  provider: string;
  providerReference: string;
  paidAt?: string;
}): Readonly<Phase5LedgerEntryDraft> {
  return buildLedgerEntryDraft({
    projectId: input.claim.projectId,
    jobId: input.claim.jobId,
    type: 'claim_payment',
    amount: input.claim.amount,
    direction: 'credit',
    description: `Claim ${requireNonBlank(input.claim.id, 'Claim id')} payment`,
    payerId: input.claim.respondentId,
    payeeId: input.claim.claimantId,
    paymentId: requireNonBlank(input.paymentId, 'Payment id'),
    claimId: input.claim.id,
    idempotencyKey: buildPaymentCallbackIdempotencyKey(input.provider, input.providerReference, input.paymentId),
    createdAt: input.paidAt,
  });
}

export function buildFeeScheduleDraft(input: Phase5FeeScheduleDraft): Readonly<Phase5FeeScheduleDraft> {
  if (input.platformFeePercentage < 0 || input.platformFeePercentage > 1) throw new Error('Platform fee percentage must be between 0 and 1');
  if (input.vatPercentage < 0 || input.vatPercentage > 1) throw new Error('VAT percentage must be between 0 and 1');
  return Object.freeze({
    ...input,
    id: requireNonBlank(input.id, 'Fee schedule id'),
    name: requireNonBlank(input.name, 'Fee schedule name'),
    version: requireNonBlank(input.version, 'Fee schedule version'),
    effectiveFrom: requireNonBlank(input.effectiveFrom, 'Fee schedule effective date'),
    createdBy: requireNonBlank(input.createdBy, 'Fee schedule creator'),
  });
}

export function buildDisputeEvidenceDraft(input: Omit<Phase5DisputeEvidenceDraft, 'immutableReference'> & { immutableReference?: string }): Readonly<Phase5DisputeEvidenceDraft> {
  const disputeId = requireNonBlank(input.disputeId, 'Dispute id');
  const sourceId = requireNonBlank(input.sourceId, 'Evidence source id');
  const immutableReference = input.immutableReference ?? `${disputeId}:${input.sourceType}:${sourceId}`.toLowerCase();
  return Object.freeze({
    ...input,
    disputeId,
    projectId: requireNonBlank(input.projectId, 'Project id'),
    jobId: requireNonBlank(input.jobId, 'Job id'),
    submittedBy: requireNonBlank(input.submittedBy, 'Evidence submitter'),
    sourceId,
    description: requireNonBlank(input.description, 'Evidence description'),
    capturedAt: requireNonBlank(input.capturedAt, 'Evidence capture timestamp'),
    immutableReference,
  });
}
