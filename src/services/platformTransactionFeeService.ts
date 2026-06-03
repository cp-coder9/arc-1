import type { PlatformTransactionFeeBreakdown, PlatformTransactionFeeConfig } from '../types/proposalBuilder';

export const DEFAULT_PLATFORM_TRANSACTION_FEE_CONFIG: PlatformTransactionFeeConfig = {
  version: 'architex-platform-fee-2026.1',
  totalPlatformFeePercent: 1.0,
  payerSharePercent: 0.5,
  payeeSharePercent: 0.5,
  discountAppliesBeforePlatformFee: true,
  includeVatInChargeableBase: false,
  includeDisbursementsInChargeableBase: false,
  includeStatutoryFeesInChargeableBase: false,
};

export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function mergePlatformTransactionFeeConfig(
  overrides?: Partial<PlatformTransactionFeeConfig> | null,
): PlatformTransactionFeeConfig {
  const merged = { ...DEFAULT_PLATFORM_TRANSACTION_FEE_CONFIG, ...(overrides || {}) };
  if (merged.totalPlatformFeePercent < 0 || merged.payerSharePercent < 0 || merged.payeeSharePercent < 0) {
    throw new Error('Platform transaction fee percentages cannot be negative.');
  }
  const splitTotal = roundMoney(merged.payerSharePercent + merged.payeeSharePercent);
  const configuredTotal = roundMoney(merged.totalPlatformFeePercent);
  if (splitTotal !== configuredTotal) {
    throw new Error(`Payer/payee platform fee split (${splitTotal}%) must equal total platform fee (${configuredTotal}%).`);
  }
  return merged;
}

export function calculatePlatformTransactionFee(
  chargeableBase: number,
  configOverrides?: Partial<PlatformTransactionFeeConfig> | null,
): PlatformTransactionFeeBreakdown {
  const config = mergePlatformTransactionFeeConfig(configOverrides);
  if (!Number.isFinite(chargeableBase) || chargeableBase < 0) {
    throw new Error('Chargeable base must be a non-negative number.');
  }

  const payerPlatformFee = roundMoney(chargeableBase * (config.payerSharePercent / 100));
  const payeePlatformFee = roundMoney(chargeableBase * (config.payeeSharePercent / 100));
  const totalPlatformFee = roundMoney(payerPlatformFee + payeePlatformFee);
  const payerTotalIntoEscrow = roundMoney(chargeableBase + payerPlatformFee);
  const payeeGrossRelease = roundMoney(chargeableBase);
  const payeeNetRelease = roundMoney(chargeableBase - payeePlatformFee);

  return {
    configVersion: config.version,
    chargeableBase: roundMoney(chargeableBase),
    payerSharePercent: config.payerSharePercent,
    payeeSharePercent: config.payeeSharePercent,
    payerPlatformFee,
    payeePlatformFee,
    totalPlatformFee,
    payerTotalIntoEscrow,
    payeeGrossRelease,
    payeeNetRelease,
    disclosure: `Architex platform transaction/service fee: ${config.totalPlatformFeePercent.toFixed(2)}% total, shared equally between payer and payee. Client contribution: ${config.payerSharePercent.toFixed(2)}% added to this payment. Payee contribution: ${config.payeeSharePercent.toFixed(2)}% deducted from the release amount.`,
  };
}
