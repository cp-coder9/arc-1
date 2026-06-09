/**
 * Fee Proposal Bridge
 *
 * Bridges fee estimator outputs into proposal builder inputs.
 * Provides a consolidated workflow: estimate fee → build proposal.
 */
import type { FeeEstimatorInput, FeeEstimateResult } from './feeEstimatorService';
import type { ProposalBuilderInput, ProposalBuilderResult, ProposalDiscount } from '../types/proposalBuilder';
import { estimateArchitecturalFee } from './feeEstimatorService';
import { buildProposal } from './proposalBuilderService';

export interface FeeToProposalOptions {
  estimate: FeeEstimateResult;
  calculatorId?: string;
  calculatorVersion?: string;
  issuingUserId: string;
  payerUserId: string;
  payeeUserId: string;
  payeeRole?: ProposalBuilderInput['payeeRole'];
  projectId?: string;
  jobId?: string;
  discountPercentage?: number;
  discountReason?: string;
  discountAppliedBy?: string;
}

export function feeEstimateToProposalInput(opts: FeeToProposalOptions): ProposalBuilderInput {
  const discount: ProposalDiscount | undefined = opts.discountPercentage ? {
    percentage: opts.discountPercentage,
    amount: (opts.estimate.professionalFee * opts.discountPercentage) / 100,
    reason: opts.discountReason ?? 'Discount applied',
    appliedBy: opts.discountAppliedBy ?? opts.issuingUserId,
    appliedAt: new Date().toISOString(),
  } : undefined;

  return {
    calculatorId: opts.calculatorId ?? 'fee-estimator',
    calculatorVersion: opts.calculatorVersion ?? '1.0',
    issuingUserId: opts.issuingUserId,
    payerUserId: opts.payerUserId,
    payeeUserId: opts.payeeUserId,
    payeeRole: opts.payeeRole ?? 'architect',
    projectId: opts.projectId,
    jobId: opts.jobId,
    title: `Fee Proposal — ZAR ${opts.estimate.valueOfWorks}`,
    scopeSummary: `Professional architectural services (base fee: ZAR ${opts.estimate.baseProfessionalFee})`,
    lineItems: [
      {
        id: 'fee-1',
        description: 'Professional fee',
        category: 'professional_fee',
        quantity: 1,
        unitPrice: opts.estimate.professionalFee,
        total: opts.estimate.professionalFee,
        chargeableForPlatformFee: true,
      },
    ],
    discount,
    vatRatePercent: 15,
  };
}

export function estimateAndBuildProposal(
  input: FeeEstimatorInput,
): { estimate: FeeEstimateResult; proposal: ProposalBuilderResult } {
  const estimate = estimateArchitecturalFee(input);
  const proposalInput = feeEstimateToProposalInput({
    estimate,
    issuingUserId: 'system',
    payerUserId: 'client',
    payeeUserId: 'professional',
  });
  const proposal = buildProposal(proposalInput);
  return { estimate, proposal };
}