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
  it('produces a single milestone with 100% allocation', () => {
    const proposal = mockProposal(100000);
    const plan = createEscrowMilestonePlan(proposal);
    expect(plan).toHaveLength(1);
    expect(plan[0].percentage).toBe(100);
  });

  it('calculates gross chargeable base from full fee', () => {
    const proposal = mockProposal(100000);
    const plan = createEscrowMilestonePlan(proposal);
    expect(plan[0].grossChargeableBase).toBeCloseTo(proposal.feeAfterDiscountIncVat);
  });

  it('calculates platform fees correctly', () => {
    const proposal = mockProposal(100000);
    const plan = createEscrowMilestonePlan(proposal);
    expect(plan[0].payerPlatformFee).toBeCloseTo(500);
    expect(plan[0].payeePlatformFee).toBeCloseTo(500);
    expect(plan[0].payerFundingAmount).toBeGreaterThan(plan[0].grossChargeableBase);
    expect(plan[0].payeeNetRelease).toBeLessThan(plan[0].grossChargeableBase);
  });

  it('sets status to funding_requested', () => {
    const proposal = mockProposal(100000);
    const plan = createEscrowMilestonePlan(proposal);
    expect(plan[0].status).toBe('funding_requested');
  });

  it('includes release conditions', () => {
    const proposal = mockProposal(50000);
    const plan = createEscrowMilestonePlan(proposal);
    expect(plan[0].releaseConditions.length).toBeGreaterThan(0);
  });
});
