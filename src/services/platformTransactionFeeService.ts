import type { PlatformTransactionFeeBreakdown, PlatformTransactionFeeConfig } from '../types/proposalBuilder';

export const DEFAULT_PLATFORM_TRANSACTION_FEE_CONFIG: PlatformTransactionFeeConfig = {
  version: 'platform-fee-v1',
  totalPlatformFeePercent: 1,
  payerSharePercent: 0.5,
  payeeSharePercent: 0.5,
  discountAppliesBeforePlatformFee: true,
  includeVatInChargeableBase: false,
  includeDisbursementsInChargeableBase: false,
  includeStatutoryFeesInChargeableBase: false,
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePlatformTransactionFee(
  chargeableBase: number,
  config: Partial<PlatformTransactionFeeConfig> = {},
): PlatformTransactionFeeBreakdown {
  const resolved = { ...DEFAULT_PLATFORM_TRANSACTION_FEE_CONFIG, ...config };
  const safeBase = Math.max(0, chargeableBase);
  const totalPlatformFee = roundMoney(safeBase * (resolved.totalPlatformFeePercent / 100));
  const payerPlatformFee = roundMoney(safeBase * (resolved.payerSharePercent / 100));
  const payeePlatformFee = roundMoney(safeBase * (resolved.payeeSharePercent / 100));

  return {
    configVersion: resolved.version,
    chargeableBase: safeBase,
    payerSharePercent: resolved.payerSharePercent,
    payeeSharePercent: resolved.payeeSharePercent,
    payerPlatformFee,
    payeePlatformFee,
    totalPlatformFee,
    payerTotalIntoEscrow: roundMoney(safeBase + payerPlatformFee),
    payeeGrossRelease: safeBase,
    payeeNetRelease: roundMoney(safeBase - payeePlatformFee),
    disclosure: `Architex platform fee ${resolved.totalPlatformFeePercent.toFixed(2)}% split payer ${resolved.payerSharePercent.toFixed(2)}% / payee ${resolved.payeeSharePercent.toFixed(2)}%.`,
  };
}
