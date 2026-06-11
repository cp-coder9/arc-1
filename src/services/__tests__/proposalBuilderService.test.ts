import { buildProposal } from '../proposalBuilderService';

const baseInput = {
  calculatorId: 'calc1',
  calculatorVersion: 'v1',
  issuingUserId: 'u1',
  payerUserId: 'client1',
  payeeUserId: 'prof1',
  payeeRole: 'architect' as const,
  title: 'Test Proposal',
  scopeSummary: 'Scope',
  lineItems: [
    { id: 'fee1', description: 'Professional fee', category: 'professional_fee' as const, quantity: 1, unitPrice: 100000, total: 100000, chargeableForPlatformFee: true },
    { id: 'stat1', description: 'Statutory fee', category: 'statutory_fee' as const, quantity: 1, unitPrice: 5000, total: 5000, chargeableForPlatformFee: false },
  ],
  vatRatePercent: 15,
};

describe('buildProposal', () => {
  it('calculates fee, VAT, and platform fee correctly without discount', () => {
    const result = buildProposal(baseInput);
    expect(result.feeBeforeDiscountExVat).toBeCloseTo(105000);
    expect(result.discountAmount).toBe(0);
    expect(result.vatAmount).toBeCloseTo(15750);
    expect(result.platformFee.payerPlatformFee).toBeCloseTo(500);
    expect(result.platformFee.payeePlatformFee).toBeCloseTo(500);
    expect(result.clientAmountPayableIntoEscrow).toBeCloseTo(105000 + 15750 + 500);
    expect(result.payeeNetReleaseAmount).toBeCloseTo(120750 - 500);
    expect(result.architexPlatformRevenue).toBeCloseTo(1000);
  });

  it('applies discount before platform fee when config specifies', () => {
    const input = { ...baseInput, discount: { percentage: 10, amount: 0, reason: 'promo', appliedBy: 'u1', appliedAt: new Date().toISOString() } };
    const result = buildProposal(input);
    const discountAmount = 100000 * 0.10;
    expect(result.discountAmount).toBeCloseTo(discountAmount);
    expect(result.platformFee.payerPlatformFee).toBeCloseTo(450);
    expect(result.platformFee.payeePlatformFee).toBeCloseTo(450);
    expect(result.architexPlatformRevenue).toBeCloseTo(900);
  });

  it('throws on negative VAT rate', () => {
    const bad = { ...baseInput, vatRatePercent: -5 };
    expect(() => buildProposal(bad)).toThrow();
  });

  it('throws on empty line items', () => {
    const bad = { ...baseInput, lineItems: [] };
    expect(() => buildProposal(bad)).toThrow();
  });

  it('throws when discount amount does not match percentage', () => {
    const bad = {
      ...baseInput,
      discount: { percentage: 10, amount: 5000, reason: 'mismatch', appliedBy: 'u1', appliedAt: new Date().toISOString() },
    };
    expect(() => buildProposal(bad)).toThrow('Provided discount amount does not match percentage calculation.');
  });
});
