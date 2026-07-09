/**
 * Practice Management → Project Passport Adapter
 *
 * Computes practice financial health metrics from WIP, profitability,
 * fee health, and write-off data for inclusion in the Project Passport.
 *
 * Requirements: 4.5, 15.3
 *
 * @module practiceManagement/adapters/passportAdapter
 */

import type {
  FeeHealthMetrics,
  ProfitabilityResult,
  SacapWorkStage,
  WipPosition,
  WriteOffSummary,
} from '@/services/practiceManagement/types';

// ── Exported Interfaces ─────────────────────────────────────────────────────

/**
 * Practice financial health record suitable for inclusion in the Project Passport.
 * Contains WIP position, margin status, write-off percentage, and fee health.
 */
export interface PracticePassportData {
  /** WIP position summary for the project */
  wip: {
    agreedFeeCents: number;
    costsIncurredCents: number;
    amountInvoicedCents: number;
    amountCollectedCents: number;
    wipBalanceCents: number;
    isLoss: boolean;
  };
  /** Margin and profitability status */
  margin: {
    marginPercent: number;
    netProfitCents: number;
    status: 'profitable' | 'at_risk' | 'loss_making';
  };
  /** Write-off exposure as percentage of agreed fee */
  writeOff: {
    cumulativeWriteOffCents: number;
    writeOffPercentage: number;
  };
  /** Fee health metrics: total fee, costs, net position, over-run stages */
  feeHealth: {
    totalFeeCents: number;
    totalCostsIncurredCents: number;
    netPositionCents: number;
    overRunStages: SacapWorkStage[];
    warningStages: SacapWorkStage[];
  };
}

/**
 * Input required to build the practice passport data.
 * All fields are optional — when a metric is unavailable the adapter
 * produces safe default values (zeroes, empty arrays, 'profitable' status).
 */
export interface PracticePassportInput {
  wipPosition?: WipPosition | null;
  profitability?: ProfitabilityResult | null;
  feeHealth?: FeeHealthMetrics | null;
  writeOffSummary?: WriteOffSummary | null;
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Build passport-ready practice financial health data from service outputs.
 *
 * Accepts optional WIP, profitability, fee health, and write-off data.
 * Returns a normalised record with safe defaults when inputs are unavailable.
 *
 * Requirement 4.5: Write fee health metrics into the Project Passport
 * Requirement 15.3: Write practice financial health metrics (WIP position,
 *   margin status, write-off percentage) into the Project Passport
 */
export function buildPracticePassportData(
  input: PracticePassportInput,
): PracticePassportData {
  const { wipPosition, profitability, feeHealth, writeOffSummary } = input;

  return {
    wip: buildWipSection(wipPosition ?? null),
    margin: buildMarginSection(profitability ?? null),
    writeOff: buildWriteOffSection(writeOffSummary ?? null),
    feeHealth: buildFeeHealthSection(feeHealth ?? null),
  };
}

// ── Internal Helpers ────────────────────────────────────────────────────────

function buildWipSection(wip: WipPosition | null): PracticePassportData['wip'] {
  if (!wip) {
    return {
      agreedFeeCents: 0,
      costsIncurredCents: 0,
      amountInvoicedCents: 0,
      amountCollectedCents: 0,
      wipBalanceCents: 0,
      isLoss: false,
    };
  }

  return {
    agreedFeeCents: wip.agreedFeeCents,
    costsIncurredCents: wip.costsIncurredCents,
    amountInvoicedCents: wip.amountInvoicedCents,
    amountCollectedCents: wip.amountCollectedCents,
    wipBalanceCents: wip.wipBalanceCents,
    isLoss: wip.isLoss,
  };
}

function buildMarginSection(
  profitability: ProfitabilityResult | null,
): PracticePassportData['margin'] {
  if (!profitability) {
    return {
      marginPercent: 0,
      netProfitCents: 0,
      status: 'profitable',
    };
  }

  return {
    marginPercent: profitability.marginPercent,
    netProfitCents: profitability.netProfitCents,
    status: profitability.status,
  };
}

function buildWriteOffSection(
  writeOff: WriteOffSummary | null,
): PracticePassportData['writeOff'] {
  if (!writeOff) {
    return {
      cumulativeWriteOffCents: 0,
      writeOffPercentage: 0,
    };
  }

  return {
    cumulativeWriteOffCents: writeOff.cumulativeWriteOffCents,
    writeOffPercentage: writeOff.writeOffPercentage,
  };
}

function buildFeeHealthSection(
  feeHealth: FeeHealthMetrics | null,
): PracticePassportData['feeHealth'] {
  if (!feeHealth) {
    return {
      totalFeeCents: 0,
      totalCostsIncurredCents: 0,
      netPositionCents: 0,
      overRunStages: [],
      warningStages: [],
    };
  }

  return {
    totalFeeCents: feeHealth.totalFeeCents,
    totalCostsIncurredCents: feeHealth.totalCostsIncurredCents,
    netPositionCents: feeHealth.netPositionCents,
    overRunStages: [...feeHealth.overRunStages],
    warningStages: [...feeHealth.warningStages],
  };
}
