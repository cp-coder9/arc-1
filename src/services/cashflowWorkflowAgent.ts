import type { EscrowMilestonePlan, ProposalBuilderResult } from '../types/proposalBuilder';
import { roundMoney } from './platformTransactionFeeService';

export function createEscrowMilestonePlan(proposal: ProposalBuilderResult): EscrowMilestonePlan[] {
  const grossChargeableBase = proposal.feeAfterDiscountIncVat;
  const payerPlatformFee = proposal.platformFee.payerPlatformFee;
  const payeePlatformFee = proposal.platformFee.payeePlatformFee;
  const payerFundingAmount = proposal.clientAmountPayableIntoEscrow;
  const payeeNetRelease = proposal.payeeNetReleaseAmount;

  return [
    {
      id: `${proposal.idSeed}-milestone-1`,
      name: 'Professional service escrow release',
      percentage: 100,
      grossChargeableBase: roundMoney(grossChargeableBase),
      payerPlatformFee: roundMoney(payerPlatformFee),
      payerFundingAmount: roundMoney(payerFundingAmount),
      payeePlatformFee: roundMoney(payeePlatformFee),
      payeeNetRelease: roundMoney(payeeNetRelease),
      releaseConditions: [
        'Client acceptance recorded',
        'Professional deliverables submitted',
        'No active dispute or hold',
      ],
      status: 'funding_requested',
    },
  ];
}
