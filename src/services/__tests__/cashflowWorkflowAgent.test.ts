import { createEscrowMilestonePlan } from '../cashflowWorkflowAgent';

function mockProposal(chargeableBase: number) {
  return {
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
      disclosure: '',
    },
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
});
