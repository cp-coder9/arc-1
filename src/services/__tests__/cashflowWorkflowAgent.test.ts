import { createEscrowMilestonePlan, DEFAULT_PROFESSIONAL_MILESTONES, nextCashflowAgentEvents } from '../cashflowWorkflowAgent';

function mockProposal(chargeableBase: number) {
  return {
    idSeed: 'test-prop-1',
    status: 'calculator_completed' as const,
    title: 'Test Proposal',
    feeBeforeDiscountExVat: chargeableBase + 3500,
    discountAmount: 0,
    feeAfterDiscountExVat: chargeableBase + 3500,
    vatAmount: Number(((chargeableBase + 3500) * 0.15).toFixed(2)),
    feeAfterDiscountIncVat: Number(((chargeableBase + 3500) * 1.15).toFixed(2)),
    platformFee: {
      configVersion: 'test',
      chargeableBase,
      payerSharePercent: 0.5,
      payeeSharePercent: 0.5,
      payerPlatformFee: Number((chargeableBase * 0.005).toFixed(2)),
      payeePlatformFee: Number((chargeableBase * 0.005).toFixed(2)),
      totalPlatformFee: Number((chargeableBase * 0.01).toFixed(2)),
      payerTotalIntoEscrow: Number((chargeableBase * 1.005).toFixed(2)),
      payeeGrossRelease: chargeableBase,
      payeeNetRelease: Number((chargeableBase * 0.995).toFixed(2)),
      disclosure: 'Test disclosure',
    },
    clientAmountPayableIntoEscrow: Number(((chargeableBase + 3500) * 1.15).toFixed(2)) + Number((chargeableBase * 0.005).toFixed(2)),
    payeeNetReleaseAmount: Number(((chargeableBase + 3500) * 1.15).toFixed(2)) - Number((chargeableBase * 0.005).toFixed(2)),
    architexPlatformRevenue: Number((chargeableBase * 0.01).toFixed(2)),
    visibleLineItems: [],
    auditSnapshot: {},
  };
}

describe('createEscrowMilestonePlan', () => {
  it('splits chargeable base across milestones and calculates fees', () => {
    const proposal = mockProposal(100000);
    const plan = createEscrowMilestonePlan(proposal);
    expect(plan).toHaveLength(5);
    const totalPct = plan.reduce((sum: number, m: { percentage: number }) => sum + m.percentage, 0);
    expect(totalPct).toBe(100);
    const first = plan[0];
    expect(first.grossChargeableBase).toBeCloseTo(20000);
    expect(first.payerPlatformFee).toBeCloseTo(100);
    expect(first.payerFundingAmount).toBeCloseTo(20100);
    expect(first.payeePlatformFee).toBeCloseTo(100);
    expect(first.payeeNetRelease).toBeCloseTo(19900);
  });

  it('assigns all milestone percentages that sum to 100', () => {
    const proposal = mockProposal(75000);
    const plan = createEscrowMilestonePlan(proposal);
    const totalPct = plan.reduce((sum, m) => sum + m.percentage, 0);
    expect(totalPct).toBe(100);
  });

  it('produces gross chargeable bases that sum to the original chargeable base', () => {
    const proposal = mockProposal(150000);
    const plan = createEscrowMilestonePlan(proposal);
    const totalChargeableBase = plan.reduce((sum, m) => sum + m.grossChargeableBase, 0);
    expect(totalChargeableBase).toBeCloseTo(proposal.platformFee.chargeableBase, 2);
  });

  it('sets all milestones to draft status initially', () => {
    const proposal = mockProposal(100000);
    const plan = createEscrowMilestonePlan(proposal);
    expect(plan.every((m) => m.status === 'draft')).toBe(true);
  });

  it('includes release conditions on each milestone', () => {
    const proposal = mockProposal(50000);
    const plan = createEscrowMilestonePlan(proposal);
    plan.forEach((m) => {
      expect(m.releaseConditions.length).toBeGreaterThan(0);
    });
  });

  it('throws when milestone percentages do not total 100', () => {
    const proposal = mockProposal(100000);
    const badMilestones = [
      { id: 'a', name: 'A', percentage: 30, releaseConditions: [] },
      { id: 'b', name: 'B', percentage: 30, releaseConditions: [] },
    ];
    expect(() => createEscrowMilestonePlan(proposal, badMilestones)).toThrow(
      'Escrow milestone percentages must total 100%.',
    );
  });

  it('accepts custom milestone definitions', () => {
    const proposal = mockProposal(100000);
    const customMilestones = [
      { id: 'deposit', name: 'Deposit', percentage: 40, releaseConditions: ['Signed'] },
      { id: 'final', name: 'Final', percentage: 60, releaseConditions: ['All done'] },
    ];
    const plan = createEscrowMilestonePlan(proposal, customMilestones);
    expect(plan).toHaveLength(2);
    expect(plan[0].name).toBe('Deposit');
    expect(plan[1].name).toBe('Final');
  });

  it('returns non‑zero payer and payee platform fees for each milestone', () => {
    const proposal = mockProposal(200000);
    const plan = createEscrowMilestonePlan(proposal);
    plan.forEach((m) => {
      expect(m.payerPlatformFee).toBeGreaterThan(0);
      expect(m.payeePlatformFee).toBeGreaterThan(0);
      expect(m.payerFundingAmount).toBeGreaterThan(m.grossChargeableBase);
      expect(m.payeeNetRelease).toBeLessThan(m.grossChargeableBase);
    });
  });

  it('uses DEFAULT_PROFESSIONAL_MILESTONES with 5 predefined stages', () => {
    expect(DEFAULT_PROFESSIONAL_MILESTONES).toHaveLength(5);
    const totalPct = DEFAULT_PROFESSIONAL_MILESTONES.reduce((sum, m) => sum + m.percentage, 0);
    expect(totalPct).toBe(100);
  });
});

describe('nextCashflowAgentEvents', () => {
  it('returns proposal-generated events with correct actors', () => {
    const events = nextCashflowAgentEvents('proposal_generated', 'prop-1', 'proj-1');
    expect(events).toHaveLength(2);
    expect(events[0].actor).toBe('proposal_agent');
    expect(events[1].actor).toBe('terms_agent');
  });

  it('returns proposal-accepted events with escrow and invoice agents', () => {
    const events = nextCashflowAgentEvents('proposal_accepted', 'prop-1', 'proj-1');
    expect(events).toHaveLength(2);
    expect(events[0].actor).toBe('escrow_agent');
    expect(events[1].actor).toBe('invoice_agent');
  });

  it('returns release-approved events with payment and reconciliation agents', () => {
    const events = nextCashflowAgentEvents('release_approved', 'prop-1', 'proj-1');
    expect(events).toHaveLength(2);
    const actors = events.map((e) => e.actor);
    expect(actors).toContain('payment_agent');
    expect(actors).toContain('reconciliation_agent');
  });

  it('returns release-requested events with reconciliation and dispute agents', () => {
    const events = nextCashflowAgentEvents('release_requested', 'prop-1', 'proj-1');
    expect(events).toHaveLength(2);
    const actors = events.map((e) => e.actor);
    expect(actors).toContain('reconciliation_agent');
    expect(actors).toContain('dispute_agent');
  });

  it('sets projectId and proposalId on all events', () => {
    const events = nextCashflowAgentEvents('proposal_issued', 'prop-1', 'proj-1');
    events.forEach((e) => {
      expect(e.proposalId).toBe('prop-1');
      expect(e.projectId).toBe('proj-1');
    });
  });

  it('sets createdAt timestamps on all events', () => {
    const events = nextCashflowAgentEvents('payment_confirmed', 'prop-1');
    events.forEach((e) => {
      expect(e.createdAt).toBeTruthy();
      expect(() => new Date(e.createdAt)).not.toThrow();
    });
  });

  it('covers all known workflow states without throwing', () => {
    const states: Array<Parameters<typeof nextCashflowAgentEvents>[0]> = [
      'proposal_generated',
      'proposal_issued',
      'proposal_accepted',
      'escrow_schedule_generated',
      'invoice_generated',
      'payment_confirmed',
      'release_requested',
      'release_approved',
      'release_disputed',
      'release_completed',
      'ledger_reconciled',
    ];
    states.forEach((state) => {
      expect(() => nextCashflowAgentEvents(state, 'prop-1', 'proj-1')).not.toThrow();
    });
  });

  it('defaults to proposal_agent for unknown action types', () => {
    const events = nextCashflowAgentEvents('ledger_reconciled', 'prop-1');
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe('proposal_agent');
    expect(events[0].message).toContain('ledger_reconciled');
  });

  it('allows projectId to be undefined', () => {
    const events = nextCashflowAgentEvents('escrow_schedule_generated', 'prop-1');
    expect(events).toHaveLength(1);
    expect(events[0].projectId).toBeUndefined();
  });
});
