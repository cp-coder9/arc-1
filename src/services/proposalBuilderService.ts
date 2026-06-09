import { calculatePlatformTransactionFee, roundMoney } from './platformTransactionFeeService';
import { snapshotTerms } from './termsService';
import { calculateExpiryDate } from './termsService';
import type { ProposalBuilderInput, ProposalBuilderResult, ProposalLineItem, ProposalStatus } from '../types';

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

/**
 * Determine the initial proposal status based on what sections are completed.
 * - calculator_completed: fee has been estimated
 * - terms_attached: terms template selected
 * - professional_approved: explicit professional confirmation
 */
function determineInitialStatus(input: ProposalBuilderInput): ProposalStatus {
  if (input.professionalConfirmed) return 'professional_approved';
  if (input.terms?.termsTemplateId) return 'terms_attached';
  return 'calculator_completed';
}

/**
 * Build a proposal from the given input.
 *
 * Sections covered:
 *   1-10: Fee calculation, discount, platform fee, line items (existing)
 *   11:  Terms & Conditions (extended — template selection, clause snapshot)
 *   12:  Validity period (expiry date tracking)
 *   13:  Acceptance block (method selection, status tracking)
 *   14:  Professional responsibility confirmation
 */
export function buildProposal(input: ProposalBuilderInput): ProposalBuilderResult {
  if (!input.lineItems.length) throw new Error('Proposal requires at least one line item.');
  if (input.vatRatePercent < 0) throw new Error('VAT rate cannot be negative.');

  // Section 14: Professional responsibility check
  // If professionalConfirmed is true, the professional has explicitly taken responsibility
  // for fee assumptions, scope, and terms. This is recorded in the audit snapshot.

  const professionalAndBillItems = input.lineItems.filter((item: ProposalLineItem) => item.chargeableForPlatformFee);
  const feeBeforeDiscountExVat = sumLineItems(input.lineItems, (item) => item.category !== 'platform_fee' && item.category !== 'discount');
  const chargeableBeforeDiscount = sumLineItems(professionalAndBillItems, () => true);
  const discountAmount = input.discount ? roundMoney(chargeableBeforeDiscount * (input.discount.percentage / 100)) : 0;
  if (discountAmount < 0 || discountAmount > chargeableBeforeDiscount) throw new Error('Discount must be between 0% and 100% of chargeable fees.');
  // If the caller supplies an explicit non-zero amount, ensure it matches the percentage-derived amount.
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

  // Section 11: Terms & Conditions — snapshot terms with all template data
  const termsSnapshot = input.terms ?? undefined;

  // Section 12: Validity period — calculate expiry date
  const validityPeriodDays = input.terms?.validityPeriodDays ?? 14;
  const validityExpiryDate = calculateExpiryDate(validityPeriodDays);

  // Section 13: Acceptance block — record the acceptance method
  const acceptanceMethod = input.terms?.acceptanceMethod ?? 'digital_acceptance';

  const visibleLineItems = [...input.lineItems];
  if (discountAmount > 0) {
    visibleLineItems.push(createLineItem('discount_percentage', `Professional discount (${input.discount?.percentage.toFixed(2)}%): ${input.discount?.reason || 'Commercial discount'}`, 'discount', -discountAmount, false));
  }
  visibleLineItems.push(createLineItem('architex_client_platform_fee', `Architex client-side platform fee (${platformFee.payerSharePercent.toFixed(2)}%)`, 'platform_fee', platformFee.payerPlatformFee, false));
  visibleLineItems.push(createLineItem('architex_payee_platform_fee_disclosure', `Architex payee-side platform fee deducted on release (${platformFee.payeeSharePercent.toFixed(2)}%)`, 'platform_fee', platformFee.payeePlatformFee, false));

  return {
    idSeed: `${input.calculatorId}-${Date.now()}`,
    status: determineInitialStatus(input),
    title: input.title,
    feeBeforeDiscountExVat,
    discountAmount,
    feeAfterDiscountExVat,
    vatAmount,
    feeAfterDiscountIncVat,
    platformFee,
    clientAmountPayableIntoEscrow: roundMoney(feeAfterDiscountIncVat + platformFee.payerPlatformFee),
    // Payee receives the full invoice amount (including VAT and non-chargeable items)
    // minus the payee-side platform fee share.
    payeeNetReleaseAmount: roundMoney(feeAfterDiscountIncVat - platformFee.payeePlatformFee),
    architexPlatformRevenue: platformFee.totalPlatformFee,
    visibleLineItems,
    terms: termsSnapshot,
    // Section 12: Validity period fields
    validityPeriodDays,
    validityExpiryDate,
    // Section 13: Acceptance fields
    acceptanceMethod,
    acceptanceStatus: 'pending',
    // Section 14: Professional responsibility
    professionalConfirmed: input.professionalConfirmed ?? false,
    professionalConfirmedBy: input.professionalConfirmedBy,
    professionalConfirmedAt: input.professionalConfirmed
      ? new Date().toISOString()
      : undefined,
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
      // Section 12-14 audit fields
      validityPeriodDays,
      validityExpiryDate,
      acceptanceMethod,
      acceptanceStatus: 'pending' as const,
      professionalConfirmed: input.professionalConfirmed ?? false,
      professionalConfirmedBy: input.professionalConfirmedBy ?? null,
      scopeSummary: input.scopeSummary || null,
      createdAt: new Date().toISOString(),
    },
  };
}
