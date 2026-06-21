import { createEscrowMilestonePlan } from '../cashflowWorkflowAgent';

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
    expect(plan).toHaveLength(1);
    const first = plan[0];
    expect(first.percentage).toBe(100);
    expect(first.grossChargeableBase).toBeCloseTo(proposal.feeAfterDiscountIncVat);
    expect(first.payerPlatformFee).toBeCloseTo(proposal.platformFee.payerPlatformFee);
    expect(first.payerFundingAmount).toBeCloseTo(proposal.clientAmountPayableIntoEscrow);
    expect(first.payeePlatformFee).toBeCloseTo(proposal.platformFee.payeePlatformFee);
    expect(first.payeeNetRelease).toBeCloseTo(proposal.payeeNetReleaseAmount);
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
    expect(totalChargeableBase).toBeCloseTo(proposal.feeAfterDiscountIncVat, 2);
  });

  it('sets all milestones to funding_requested status initially', () => {
    const proposal = mockProposal(100000);
    const plan = createEscrowMilestonePlan(proposal);
    expect(plan.every((m) => m.status === 'funding_requested')).toBe(true);
  });

  it('includes release conditions on each milestone', () => {
    const proposal = mockProposal(50000);
    const plan = createEscrowMilestonePlan(proposal);
    plan.forEach((m) => {
      expect(m.releaseConditions.length).toBeGreaterThan(0);
    });
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
});
