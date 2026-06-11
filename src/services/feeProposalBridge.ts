import type { FeeEstimateResult } from './feeEstimatorService';
import { buildProposal } from './proposalBuilderService';
import type { ProposalBuilderInput, ProposalBuilderResult, ProposalLineItem, ProposalPartyRole } from '../types/proposalBuilder';

interface FeeProposalBridgeInput {
  estimate: FeeEstimateResult;
  calculatorId: string;
  calculatorVersion: string;
  issuingUserId: string;
  payerUserId: string;
  payeeUserId: string;
  payeeRole: ProposalPartyRole;
  projectId?: string;
  jobId?: string;
  discountPercentage?: number;
  discountReason?: string;
  discountAppliedBy?: string;
}

function lineItemFromBreakdown(item: FeeEstimateResult['breakdown'][number], index: number): ProposalLineItem {
  const lower = item.label.toLowerCase();
  const category: ProposalLineItem['category'] = lower.includes('council') || lower.includes('statutory')
    ? 'statutory_fee'
    : lower.includes('platform')
      ? 'platform_fee'
      : lower.includes('deliverable')
        ? 'additional_service'
        : 'professional_fee';

  return {
    id: `fee_line_${index + 1}`,
    description: item.label,
    category,
    quantity: 1,
    unitPrice: item.amount,
    total: item.amount,
    chargeableForPlatformFee: category === 'professional_fee' || category === 'additional_service',
  };
}

export function feeEstimateToProposalInput(input: FeeProposalBridgeInput): ProposalBuilderInput {
  const lineItems = input.estimate.breakdown
    .filter((item) => item.amount !== 0)
    .map(lineItemFromBreakdown)
    .filter((item) => item.category !== 'platform_fee');

  if (lineItems.length === 0) {
    lineItems.push({
      id: 'professional_fee',
      description: 'Professional fee',
      category: 'professional_fee',
      quantity: 1,
      unitPrice: input.estimate.professionalFee,
      total: input.estimate.professionalFee,
      chargeableForPlatformFee: true,
    });
  }

  return {
    projectId: input.projectId,
    jobId: input.jobId,
    calculatorId: input.calculatorId,
    calculatorVersion: input.calculatorVersion,
    issuingUserId: input.issuingUserId,
    payerUserId: input.payerUserId,
    payeeUserId: input.payeeUserId,
    payeeRole: input.payeeRole,
    title: 'Professional fee proposal',
    scopeSummary: input.estimate.assumptions.join('\n'),
    lineItems,
    discount: input.discountPercentage
      ? {
          percentage: input.discountPercentage,
          amount: 0,
          reason: input.discountReason ?? 'Commercial discount',
          appliedBy: input.discountAppliedBy ?? input.issuingUserId,
          appliedAt: new Date().toISOString(),
        }
      : undefined,
    vatRatePercent: input.estimate.subtotalExVat > 0 ? (input.estimate.vat / input.estimate.subtotalExVat) * 100 : 15,
  };
}

export function estimateAndBuildProposal(input: FeeProposalBridgeInput): ProposalBuilderResult {
  return buildProposal(feeEstimateToProposalInput(input));
}
