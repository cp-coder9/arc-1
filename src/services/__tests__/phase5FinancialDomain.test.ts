import {
  assertAppendOnlyLedgerMutationAllowed,
  assertEscrowTransitionAllowed,
  buildClaimDraft,
  buildClaimPaymentLedgerEntry,
  buildDisputeEvidenceDraft,
  buildDisputeEscrowHold,
  buildFeeScheduleDraft,
  buildInvoicePaymentLedgerEntry,
  buildInvoiceDraft,
  buildLedgerEntryDraft,
  buildPaymentCallbackIdempotencyKey,
  calculateFeeBreakdown,
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
    expect(() => buildLedgerEntryDraft({ ...entry, payerId: ' ' })).toThrow('Ledger payer id is required');
  });

  it('rejects updates to append-only ledger entries and requires idempotency for creates', () => {
    expect(() => assertAppendOnlyLedgerMutationAllowed({ before: null, after: { idempotencyKey: 'provider:ref:payment' }, actorId: 'admin-1', reason: 'new payment callback' })).not.toThrow();
    expect(() => assertAppendOnlyLedgerMutationAllowed({ before: { amount: 1000 }, after: { amount: 900, idempotencyKey: 'provider:ref:payment' }, actorId: 'admin-1', reason: 'edit typo' })).toThrow('append-only');
    expect(() => assertAppendOnlyLedgerMutationAllowed({ before: null, after: {}, actorId: 'admin-1', reason: 'new payment callback' })).toThrow('idempotency metadata');
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

  it('builds invoice drafts with calculated totals and immutable line items', () => {
    const invoice = buildInvoiceDraft({
      invoiceNumber: 'INV-001',
      jobId: 'job-1',
      clientId: 'client-1',
      architectId: 'architect-1',
      items: [
        { description: 'Concept design milestone', quantity: 2, unitPrice: 500 },
        { description: 'Submission pack', quantity: 1, unitPrice: 1000, total: 1000 },
      ],
      taxRate: 15,
      dueDate: '2026-02-01',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(invoice).toEqual(expect.objectContaining({ subtotal: 2000, taxAmount: 300, totalAmount: 2300, status: 'draft', currency: 'R' }));
    expect(invoice.items[0]).toEqual(expect.objectContaining({ total: 1000 }));
    expect(Object.isFrozen(invoice)).toBe(true);
    expect(Object.isFrozen(invoice.items[0])).toBe(true);
    expect(() => buildInvoiceDraft({ ...invoice, items: [], dueDate: '2026-02-01' })).toThrow('at least one line item');
    expect(() => buildInvoiceDraft({ ...invoice, taxRate: -1, dueDate: '2026-02-01' })).toThrow('cannot be negative');
  });

  it('builds claim drafts that require evidence and positive amounts', () => {
    const claim = buildClaimDraft({
      projectId: 'project-1',
      jobId: 'job-1',
      contractId: 'contract-1',
      claimantId: 'contractor-1',
      respondentId: 'client-1',
      amount: 1500,
      currency: 'ZAR',
      reason: 'Variation work completed',
      evidenceIds: ['evidence-1'],
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(claim).toEqual(expect.objectContaining({ status: 'submitted', evidenceIds: ['evidence-1'] }));
    expect(Object.isFrozen(claim)).toBe(true);
    expect(() => buildClaimDraft({ ...claim, amount: 0 })).toThrow('Claim amount must be greater than zero');
    expect(() => buildClaimDraft({ ...claim, evidenceIds: [] })).toThrow('at least one evidence reference');
  });

  it('builds governed fee schedule drafts without hard-coding provider behavior', () => {
    const schedule = buildFeeScheduleDraft({
      id: 'fees-2026-v1',
      name: 'Platform standard fees',
      version: '2026.1',
      jurisdiction: 'ZA',
      platformFeePercentage: 0.01,
      vatPercentage: 0.15,
      effectiveFrom: '2026-01-01',
      createdBy: 'admin-1',
      status: 'active',
    });

    expect(schedule).toEqual(expect.objectContaining({ platformFeePercentage: 0.01, vatPercentage: 0.15 }));
    expect(Object.isFrozen(schedule)).toBe(true);
    expect(() => buildFeeScheduleDraft({ ...schedule, platformFeePercentage: 1.5 })).toThrow('between 0 and 1');
    expect(() => buildFeeScheduleDraft({ ...schedule, vatPercentage: -0.1 })).toThrow('between 0 and 1');
  });

  it('calculates fee breakdowns from governed fee schedules', () => {
    const breakdown = calculateFeeBreakdown({
      grossAmount: 10000,
      calculatedAt: '2026-01-01T00:00:00.000Z',
      feeSchedule: {
        id: 'fees-2026-v1',
        name: 'Platform standard fees',
        version: '2026.1',
        jurisdiction: 'ZA',
        platformFeePercentage: 0.02,
        vatPercentage: 0.15,
        effectiveFrom: '2026-01-01',
        createdBy: 'admin-1',
        status: 'active',
      },
    });

    expect(breakdown).toEqual({ grossAmount: 10000, platformFeeAmount: 200, vatAmount: 30, netPayableAmount: 9770, feeScheduleId: 'fees-2026-v1', calculatedAt: '2026-01-01T00:00:00.000Z' });
    expect(Object.isFrozen(breakdown)).toBe(true);
    expect(() => calculateFeeBreakdown({ grossAmount: 100, feeSchedule: { id: 'fees', name: 'Bad fees', version: '1', jurisdiction: 'ZA', platformFeePercentage: 1, vatPercentage: 1, effectiveFrom: '2026-01-01', createdBy: 'admin-1', status: 'active' } })).toThrow(/negative net payable/);
  });

  it('builds invoice and claim payment ledger entries with deterministic idempotency keys', () => {
    const invoiceEntry = buildInvoicePaymentLedgerEntry({
      projectId: 'project-1',
      paymentId: 'payment-1',
      provider: 'PayFast',
      providerReference: 'PF-123',
      paidAt: '2026-01-01T00:00:00.000Z',
      invoice: { id: 'invoice-1', jobId: 'job-1', clientId: 'client-1', architectId: 'architect-1', totalAmount: 2300, invoiceNumber: 'INV-001' },
    });
    const claim = buildClaimDraft({ projectId: 'project-1', jobId: 'job-1', claimantId: 'contractor-1', respondentId: 'client-1', amount: 1500, currency: 'ZAR', reason: 'Variation work completed', evidenceIds: ['evidence-1'], createdAt: '2026-01-01T00:00:00.000Z' });
    const claimEntry = buildClaimPaymentLedgerEntry({ claim: { ...claim, id: 'claim-1' }, paymentId: 'payment-2', provider: 'PayFast', providerReference: 'PF-456', paidAt: '2026-01-02T00:00:00.000Z' });

    expect(invoiceEntry).toEqual(expect.objectContaining({ type: 'invoice_payment', invoiceId: 'invoice-1', amount: 2300, idempotencyKey: 'payfast:pf-123:payment-1' }));
    expect(claimEntry).toEqual(expect.objectContaining({ type: 'claim_payment', claimId: 'claim-1', amount: 1500, payerId: 'client-1', payeeId: 'contractor-1', idempotencyKey: 'payfast:pf-456:payment-2' }));
    expect(Object.isFrozen(invoiceEntry)).toBe(true);
    expect(Object.isFrozen(claimEntry)).toBe(true);
  });

  it('builds dispute evidence drafts with stable immutable references', () => {
    const evidence = buildDisputeEvidenceDraft({
      disputeId: 'dispute-1',
      projectId: 'project-1',
      jobId: 'job-1',
      submittedBy: 'client-1',
      sourceType: 'ledger_entry',
      sourceId: 'ledger-1',
      description: 'Escrow release entry under dispute',
      capturedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(evidence).toEqual(expect.objectContaining({ immutableReference: 'dispute-1:ledger_entry:ledger-1' }));
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(() => buildDisputeEvidenceDraft({ ...evidence, sourceId: ' ' })).toThrow('Evidence source id is required');
  });

  it('rejects blank claim evidence ids before persistence', () => {
    expect(() => buildClaimDraft({ projectId: 'project-1', jobId: 'job-1', claimantId: 'contractor-1', respondentId: 'client-1', amount: 1500, currency: 'ZAR', reason: 'Variation work completed', evidenceIds: ['evidence-1', ' '] })).toThrow('Evidence id is required');
  });
});
