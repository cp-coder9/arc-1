/**
 * Commercial Baseline Service
 *
 * Converts an approved award/appointment into the commercial baseline that
 * governs all subsequent financial activity: contract sum, variations total,
 * and retention percentage.
 *
 * The baseline is the single source of truth for the current contract sum.
 * Variations are tracked separately and incorporated upon approval.
 */
import type { AwardSnapshot, CommercialBaseline, MoneyAmount } from './types';

/**
 * Create a commercial baseline from an accepted award/appointment snapshot.
 * The baseline starts with zero approved variations and the award's contract sum.
 */
export function createCommercialBaseline(award: AwardSnapshot): CommercialBaseline {
  return {
    baselineId: `base-${award.awardId}`,
    award,
    approvedVariationsTotal: { currency: 'ZAR', amount: 0 },
    currentContractSum: { ...award.contractSum },
    retentionPercent: 5,
    status: 'active',
  };
}

/**
 * Update the baseline's contract sum after a variation is approved.
 * The approved variation's estimated impact is added to both the
 * approvedVariationsTotal and currentContractSum.
 */
export function incorporateVariationIntoBaseline(
  baseline: CommercialBaseline,
  variationImpact: MoneyAmount,
): CommercialBaseline {
  return {
    ...baseline,
    approvedVariationsTotal: {
      currency: 'ZAR',
      amount: baseline.approvedVariationsTotal.amount + variationImpact.amount,
    },
    currentContractSum: {
      currency: 'ZAR',
      amount: baseline.currentContractSum.amount + variationImpact.amount,
    },
  };
}

/**
 * Recalculate baseline when a previously-approved variation is reversed/removed.
 */
export function removeVariationFromBaseline(
  baseline: CommercialBaseline,
  variationImpact: MoneyAmount,
): CommercialBaseline {
  const newVariations = Math.max(0, baseline.approvedVariationsTotal.amount - variationImpact.amount);
  const newContractSum = Math.max(
    baseline.award.contractSum.amount,
    baseline.currentContractSum.amount - variationImpact.amount,
  );
  return {
    ...baseline,
    approvedVariationsTotal: { currency: 'ZAR', amount: newVariations },
    currentContractSum: { currency: 'ZAR', amount: newContractSum },
  };
}

/**
 * Get the total contingency as the difference between original award
 * and the current contract sum.
 */
export function calculateContingency(baseline: CommercialBaseline): MoneyAmount {
  return {
    currency: 'ZAR',
    amount: baseline.currentContractSum.amount - baseline.award.contractSum.amount,
  };
}
