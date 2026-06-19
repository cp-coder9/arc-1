import { calculatePlatformTransactionFee, roundMoney, DEFAULT_PLATFORM_TRANSACTION_FEE_CONFIG } from '../platformTransactionFeeService';

describe('roundMoney', () => {
  it('should round to 2 decimal places', () => {
    expect(roundMoney(100.125)).toBe(100.13);
    expect(roundMoney(99.994)).toBe(99.99);
  });
});

describe('calculatePlatformTransactionFee', () => {
  it('calculates correct fees for base amount', () => {
    const result = calculatePlatformTransactionFee(100000);
    expect(result.payerPlatformFee).toBeCloseTo(500);
    expect(result.payeePlatformFee).toBeCloseTo(500);
    expect(result.totalPlatformFee).toBeCloseTo(1000);
    expect(result.payerTotalIntoEscrow).toBeCloseTo(100500);
    expect(result.payeeNetRelease).toBeCloseTo(99500);
  });
});
