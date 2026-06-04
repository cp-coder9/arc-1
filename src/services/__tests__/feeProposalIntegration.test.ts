import { estimateArchitecturalFee, DEFAULT_FEE_ESTIMATOR_INPUT } from '../feeEstimatorService';
import { buildProposal } from '../proposalBuilderService';
import { calculatePlatformTransactionFee, roundMoney } from '../platformTransactionFeeService';
import type { ProposalBuilderInput, ProposalLineItem } from '../../types/proposalBuilder';

/**
 * Integration bridge: converts a FeeEstimateResult into a ProposalBuilderInput
 * so the fee calculator output flows directly into proposal generation.
 * This is the connection point between the two packs.
 */
function feeEstimateToProposalInput(params: {
  estimate: ReturnType<typeof estimateArchitecturalFee>;
  calculatorId: string;
  calculatorVersion: string;
  issuingUserId: string;
  payerUserId: string;
  payeeUserId: string;
  payeeRole: 'architect' | 'engineer' | 'quantity_surveyor' | 'town_planner';
  projectId?: string;
  discountPercentage?: number;
  discountReason?: string;
  discountAppliedBy?: string;
}): ProposalBuilderInput {
  const { estimate, discountPercentage, discountReason, discountAppliedBy, ...rest } = params;

  const lineItems: ProposalLineItem[] = [];

  // Professional fee line item
  lineItems.push({
    id: 'professional_fee',
    description: 'Professional architectural fee',
    category: 'professional_fee',
    quantity: 1,
    unitPrice: estimate.professionalFee,
    total: estimate.professionalFee,
    chargeableForPlatformFee: true,
  });

  // Deliverables if any
  if (estimate.deliverableTotal > 0) {
    lineItems.push({
      id: 'deliverables',
      description: 'Optional deliverables and allowances',
      category: 'additional_service',
      quantity: 1,
      unitPrice: estimate.deliverableTotal,
      total: estimate.deliverableTotal,
      chargeableForPlatformFee: true,
    });
  }

  // Council admin fee if included
  if (estimate.councilAdminFee > 0) {
    lineItems.push({
      id: 'council_admin',
      description: 'Council submission / admin allowance',
      category: 'disbursement',
      quantity: 1,
      unitPrice: estimate.councilAdminFee,
      total: estimate.councilAdminFee,
      chargeableForPlatformFee: false,
    });
  }

  return {
    ...rest,
    title: 'Architectural professional services proposal',
    scopeSummary: 'Fee estimate derived from Architex fee calculator. Stages and deliverables selected per calculator input.',
    lineItems,
    vatRatePercent: estimate.vat > 0 ? 15 : 0,
    discount: discountPercentage
      ? {
          percentage: discountPercentage,
          amount: 0, // Will be validated and recalculated by buildProposal
          reason: discountReason || 'Commercial discount',
          appliedBy: discountAppliedBy || rest.issuingUserId,
          appliedAt: new Date().toISOString(),
        }
      : undefined,
  };
}

describe('FeeEstimator → ProposalBuilder integration', () => {
  it('converts a simple fee estimate into a valid proposal', () => {
    const input = { ...DEFAULT_FEE_ESTIMATOR_INPUT };
    const estimate = estimateArchitecturalFee(input);
    const proposalInput = feeEstimateToProposalInput({
      estimate,
      calculatorId: 'architect_sacap_fee',
      calculatorVersion: '0.1-draft',
      issuingUserId: 'architect-1',
      payerUserId: 'client-1',
      payeeUserId: 'architect-1',
      payeeRole: 'architect',
    });

    const proposal = buildProposal(proposalInput);

    // Fee line items should match
    const feeItems = proposalInput.lineItems.filter((i) => i.chargeableForPlatformFee);
    const chargeableSum = feeItems.reduce((sum, i) => sum + i.total, 0);

    expect(proposal.feeBeforeDiscountExVat).toBeCloseTo(chargeableSum + estimate.councilAdminFee, 2);
    expect(proposal.platformFee.payerPlatformFee).toBeGreaterThan(0);
    expect(proposal.platformFee.payeePlatformFee).toBeGreaterThan(0);
    expect(proposal.architexPlatformRevenue).toBeCloseTo(
      proposal.platformFee.totalPlatformFee,
      2,
    );
    expect(proposal.clientAmountPayableIntoEscrow).toBeGreaterThan(
      proposal.payeeNetReleaseAmount,
    );
  });

  it('applies a 10% professional discount through the integration bridge', () => {
    const input = { ...DEFAULT_FEE_ESTIMATOR_INPUT, constructionValue: 2000000 };
    const estimate = estimateArchitecturalFee(input);
    const proposalInput = feeEstimateToProposalInput({
      estimate,
      calculatorId: 'architect_sacap_fee',
      calculatorVersion: '0.1-draft',
      issuingUserId: 'architect-1',
      payerUserId: 'client-1',
      payeeUserId: 'architect-1',
      payeeRole: 'architect',
      discountPercentage: 10,
      discountReason: 'Introductory discount',
      discountAppliedBy: 'architect-1',
    });

    const proposal = buildProposal(proposalInput);

    expect(proposal.discountAmount).toBeGreaterThan(0);
    expect(proposal.feeAfterDiscountExVat).toBeLessThan(proposal.feeBeforeDiscountExVat);
    // Discount should reduce the platform fee chargeable base
    const platformFee = proposal.platformFee;
    expect(platformFee.chargeableBase).toBeLessThan(proposal.feeBeforeDiscountExVat);
  });

  it('produces consistent platform fee split across fee estimate and proposal', () => {
    const input = { ...DEFAULT_FEE_ESTIMATOR_INPUT, constructionValue: 1500000 };
    const estimate = estimateArchitecturalFee(input);

    // Verify the estimate already includes split platform fee
    expect(estimate.platformFeeBreakdown).toBeDefined();
    expect(estimate.platformFeeBreakdown!.payerSharePercent).toBe(0.5);
    expect(estimate.platformFeeBreakdown!.payeeSharePercent).toBe(0.5);

    // The fee estimator's chargeable base includes professionalFee + deliverableTotal + councilAdminFee
    const prePlatformSubtotal = estimate.professionalFee + estimate.deliverableTotal + estimate.councilAdminFee;
    const directCalc = calculatePlatformTransactionFee(prePlatformSubtotal);

    expect(estimate.platformFeeBreakdown!.totalPlatformFee).toBeCloseTo(
      directCalc.totalPlatformFee,
      2,
    );
  });

  it('preserves VAT treatment across the integration', () => {
    const input = { ...DEFAULT_FEE_ESTIMATOR_INPUT, vatApplicable: true };
    const estimate = estimateArchitecturalFee(input);

    expect(estimate.vat).toBeGreaterThan(0);

    const proposalInput = feeEstimateToProposalInput({
      estimate,
      calculatorId: 'architect_sacap_fee',
      calculatorVersion: '0.1-draft',
      issuingUserId: 'architect-1',
      payerUserId: 'client-1',
      payeeUserId: 'architect-1',
      payeeRole: 'architect',
    });

    const proposal = buildProposal(proposalInput);
    expect(proposal.vatAmount).toBeGreaterThan(0);
  });

  it('converts a fee estimate without deliverables or council admin', () => {
    const input: typeof DEFAULT_FEE_ESTIMATOR_INPUT = {
      ...DEFAULT_FEE_ESTIMATOR_INPUT,
      deliverables: [],
      includeCouncilAdmin: false,
      includePlatformFee: true,
    };
    const estimate = estimateArchitecturalFee(input);

    expect(estimate.deliverableTotal).toBe(0);
    expect(estimate.councilAdminFee).toBe(0);

    const proposalInput = feeEstimateToProposalInput({
      estimate,
      calculatorId: 'architect_sacap_fee',
      calculatorVersion: '0.1-draft',
      issuingUserId: 'architect-1',
      payerUserId: 'client-1',
      payeeUserId: 'architect-1',
      payeeRole: 'architect',
    });

    const proposal = buildProposal(proposalInput);
    // No council admin line item
    const lineItemCategories = proposal.visibleLineItems.map((i) => i.category);
    expect(lineItemCategories.filter((c) => c === 'disbursement').length).toBe(0);
  });

  it('rounds all monetary values to 2 decimal places', () => {
    const estimate = estimateArchitecturalFee(DEFAULT_FEE_ESTIMATOR_INPUT);
    const proposalInput = feeEstimateToProposalInput({
      estimate,
      calculatorId: 'architect_sacap_fee',
      calculatorVersion: '0.1-draft',
      issuingUserId: 'architect-1',
      payerUserId: 'client-1',
      payeeUserId: 'architect-1',
      payeeRole: 'architect',
    });
    const proposal = buildProposal(proposalInput);

    const monetaryFields = [
      proposal.feeBeforeDiscountExVat,
      proposal.discountAmount,
      proposal.feeAfterDiscountExVat,
      proposal.vatAmount,
      proposal.feeAfterDiscountIncVat,
      proposal.clientAmountPayableIntoEscrow,
      proposal.payeeNetReleaseAmount,
      proposal.architexPlatformRevenue,
    ];

    monetaryFields.forEach((value) => {
      expect(roundMoney(value)).toBe(value);
    });
  });
});
