import type { PaymentType, ProjectStage } from '@/types';

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

  return Object.freeze({
    ...entry,
    idempotencyKey: entry.idempotencyKey.trim().toLowerCase(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
  });
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
