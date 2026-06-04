import { calculatePlatformTransactionFee, roundMoney } from './platformTransactionFeeService';
import type { ProposalBuilderInput, ProposalBuilderResult, ProposalLineItem } from '../types/proposalBuilder';

function sumLineItems(items: ProposalLineItem[], predicate: (item: ProposalLineItem) => boolean): number {
  return roundMoney(items.filter(predicate).reduce((sum, item) => sum + item.total, 0));
}

function createLineItem(
  id: string,
  description: string,
  category: ProposalLineItem['category'],
  total: number,
  chargeableForPlatformFee = false,
): ProposalLineItem {
  return { id, description, category, quantity: 1, unitPrice: roundMoney(total), total: roundMoney(total), chargeableForPlatformFee };
}

export function buildProposal(input: ProposalBuilderInput): ProposalBuilderResult {
  if (!input.lineItems.length) throw new Error('Proposal requires at least one line item.');
  if (input.vatRatePercent < 0) throw new Error('VAT rate cannot be negative.');

  const professionalAndBillItems = input.lineItems.filter((item: ProposalLineItem) => item.chargeableForPlatformFee);
  const feeBeforeDiscountExVat = sumLineItems(input.lineItems, (item) => item.category !== 'platform_fee' && item.category !== 'discount');
  const chargeableBeforeDiscount = sumLineItems(professionalAndBillItems, () => true);
  const discountAmount = input.discount ? roundMoney(chargeableBeforeDiscount * (input.discount.percentage / 100)) : 0;
  if (discountAmount < 0 || discountAmount > chargeableBeforeDiscount) throw new Error('Discount must be between 0% and 100% of chargeable fees.');
  // If the caller supplies an explicit non‑zero amount, ensure it matches the percentage‑derived amount.
  if (input.discount && typeof input.discount.amount === 'number' && input.discount.amount !== 0) {
    if (Math.abs(input.discount.amount - discountAmount) > 0.01) {
      throw new Error('Provided discount amount does not match percentage calculation.');
    }
  }

  const chargeableAfterDiscount = roundMoney(chargeableBeforeDiscount - discountAmount);
  const nonChargeableExVat = sumLineItems(input.lineItems, (item) => !item.chargeableForPlatformFee && item.category !== 'discount' && item.category !== 'platform_fee');
  const feeAfterDiscountExVat = roundMoney(chargeableAfterDiscount + nonChargeableExVat);
  const vatAmount = roundMoney(feeAfterDiscountExVat * (input.vatRatePercent / 100));
  const feeAfterDiscountIncVat = roundMoney(feeAfterDiscountExVat + vatAmount);

  const platformFee = calculatePlatformTransactionFee(chargeableAfterDiscount, input.platformFeeConfig);

  const visibleLineItems = [...input.lineItems];
  if (discountAmount > 0) {
    visibleLineItems.push(createLineItem('discount_percentage', `Professional discount (${input.discount?.percentage.toFixed(2)}%): ${input.discount?.reason || 'Commercial discount'}`, 'discount', -discountAmount, false));
  }
  visibleLineItems.push(createLineItem('architex_client_platform_fee', `Architex client-side platform fee (${platformFee.payerSharePercent.toFixed(2)}%)`, 'platform_fee', platformFee.payerPlatformFee, false));
  visibleLineItems.push(createLineItem('architex_payee_platform_fee_disclosure', `Architex payee-side platform fee deducted on release (${platformFee.payeeSharePercent.toFixed(2)}%)`, 'platform_fee', platformFee.payeePlatformFee, false));

  return {
    idSeed: `${input.calculatorId}-${Date.now()}`,
    status: input.terms ? 'terms_attached' : 'calculator_completed',
    title: input.title,
    feeBeforeDiscountExVat,
    discountAmount,
    feeAfterDiscountExVat,
    vatAmount,
    feeAfterDiscountIncVat,
    platformFee,
  clientAmountPayableIntoEscrow: roundMoney(feeAfterDiscountIncVat + platformFee.payerPlatformFee),
  // Payee receives the full invoice amount (including VAT and non‑chargeable items)
  // minus the payee‑side platform fee share.
  payeeNetReleaseAmount: roundMoney(feeAfterDiscountIncVat - platformFee.payeePlatformFee),
    architexPlatformRevenue: platformFee.totalPlatformFee,
    visibleLineItems,
    terms: input.terms,
    auditSnapshot: {
      calculatorId: input.calculatorId,
      calculatorVersion: input.calculatorVersion,
      issuingUserId: input.issuingUserId,
      payerUserId: input.payerUserId,
      payeeUserId: input.payeeUserId,
      payeeRole: input.payeeRole,
      platformFeeConfigVersion: platformFee.configVersion,
      discount: input.discount || null,
      termsTemplateId: input.terms?.termsTemplateId || null,
      termsTemplateVersion: input.terms?.termsTemplateVersion || null,
      createdAt: new Date().toISOString(),
    },
  };
}
