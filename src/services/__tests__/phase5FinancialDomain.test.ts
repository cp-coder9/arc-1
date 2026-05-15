import {
  assertEscrowTransitionAllowed,
  buildDisputeEscrowHold,
  buildLedgerEntryDraft,
  buildPaymentCallbackIdempotencyKey,
  ESCROW_TRANSITIONS,
} from '../phase5FinancialDomain';

describe('phase5FinancialDomain', () => {
  it('documents supported escrow state machine events', () => {
    expect(ESCROW_TRANSITIONS.pending_funding).toEqual(['fund', 'cancel']);
    expect(ESCROW_TRANSITIONS.disputed).toEqual(['resolve_dispute_hold', 'resolve_dispute_release', 'refund']);
    expect(ESCROW_TRANSITIONS.released).toEqual([]);
  });

  it('allows valid funding, partial release, full release, and dispute transitions', () => {
    expect(assertEscrowTransitionAllowed('pending_funding', 'fund', { heldAmount: 0, releasedAmount: 0 })).toBe('funded');
    expect(assertEscrowTransitionAllowed('funded', 'release_partial', { heldAmount: 1000, releasedAmount: 0, releaseAmount: 250 })).toBe('partially_released');
    expect(assertEscrowTransitionAllowed('partially_released', 'release_full', { heldAmount: 750, releasedAmount: 250, releaseAmount: 750 })).toBe('released');
    expect(assertEscrowTransitionAllowed('funded', 'request_dispute', { heldAmount: 1000, releasedAmount: 0 })).toBe('disputed');
  });

  it('rejects unsafe escrow transitions and release amounts', () => {
    expect(() => assertEscrowTransitionAllowed('released', 'refund', { heldAmount: 0, releasedAmount: 1000 })).toThrow('not allowed');
    expect(() => assertEscrowTransitionAllowed('funded', 'release_partial', { heldAmount: 1000, releasedAmount: 0, releaseAmount: 1000 })).toThrow('Partial release must leave funds');
    expect(() => assertEscrowTransitionAllowed('funded', 'release_full', { heldAmount: 1000, releasedAmount: 0, releaseAmount: 900 })).toThrow('Full release must release');
    expect(() => assertEscrowTransitionAllowed('funded', 'release_full', { heldAmount: 1000, releasedAmount: 0, releaseAmount: 1200 })).toThrow('cannot exceed');
  });

  it('normalizes callback idempotency keys without pretending to verify providers', () => {
    expect(buildPaymentCallbackIdempotencyKey(' PayFast ', ' PF-123 ', ' payment-1 ')).toBe('payfast:pf-123:payment-1');
    expect(() => buildPaymentCallbackIdempotencyKey('PayFast', '', 'payment-1')).toThrow('required for idempotency');
  });

  it('builds immutable append-only ledger drafts with required idempotency metadata', () => {
    const entry = buildLedgerEntryDraft({
      projectId: 'project-1',
      jobId: 'job-1',
      type: 'escrow_deposit',
      amount: 1000,
      direction: 'credit',
      description: 'Escrow funded',
      payerId: 'client-1',
      payeeId: 'architect-1',
      idempotencyKey: ' PayFast:PF-123:payment-1 ',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(entry).toEqual(expect.objectContaining({ idempotencyKey: 'payfast:pf-123:payment-1', createdAt: '2026-01-01T00:00:00.000Z' }));
    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => buildLedgerEntryDraft({ ...entry, amount: 0 })).toThrow('greater than zero');
    expect(() => buildLedgerEntryDraft({ ...entry, description: ' ' })).toThrow('requires a description');
  });

  it('creates dispute hold descriptors that link disputes to escrow holds', () => {
    const hold = buildDisputeEscrowHold('dispute-1', 'project-1', 'job-1', 'client-1', 'delivery');
    expect(hold).toEqual({
      disputeId: 'dispute-1',
      projectId: 'project-1',
      jobId: 'job-1',
      filedBy: 'client-1',
      stage: 'delivery',
      escrowEvent: 'request_dispute',
      escrowStatus: 'disputed',
      reason: 'Dispute opened, escrow release must be held pending resolution',
    });
    expect(Object.isFrozen(hold)).toBe(true);
  });
});
