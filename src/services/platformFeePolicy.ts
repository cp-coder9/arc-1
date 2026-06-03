import { calculatePlatformTransactionFee } from './platformTransactionFeeService';
import type { PlatformTransactionFeeBreakdown } from '../types/proposalBuilder';

export const PRD_PLATFORM_FEE_PERCENTAGE = 0.01;
export const PRD_PLATFORM_FEE_PERCENT = PRD_PLATFORM_FEE_PERCENTAGE * 100;
export const PRD_PLATFORM_FEE_BPS = PRD_PLATFORM_FEE_PERCENTAGE * 10_000;

/** Legacy: returns the total platform fee as a single number (1% of amount). */
export function calculatePrdPlatformFee(amount: number): number {
  return Math.round(amount * PRD_PLATFORM_FEE_PERCENTAGE);
}

/**
 * Split‑fee variant: returns payer/payee breakdown.
 * Defaults to 1% total split 50/50 — payer pays 0.5% extra, payee receives net minus 0.5%.
 */
export function calculateSplitPlatformFee(chargeableBase: number): PlatformTransactionFeeBreakdown {
  return calculatePlatformTransactionFee(chargeableBase);
}
