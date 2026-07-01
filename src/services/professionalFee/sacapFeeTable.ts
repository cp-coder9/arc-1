// SACAP Gazetted Fee Table Lookup with Interpolation
// Per SACAP Board Notice 27 of 2021

import type { SACAPFeeTable, SACAPFeeTableBand } from './persistence/types';
import { roundMoney } from './ids';

export interface FeePercentageResult {
  percentage: number;
  warning?: string;
}

export interface ProjectFeeResult {
  projectFee: number;
  projectFeeRate: number;
  warning?: string;
}

export interface ScopeOfWorkFeeResult {
  scopeOfWorkFee: number;
  scopeOfWorkRate: number;
}

/**
 * Look up the applicable fee percentage from SACAP gazetted fee tables.
 * Uses linear interpolation within bands when baseFee and rateAboveMin are provided.
 * Clamps to nearest band boundary when value exceeds the published range.
 */
export function lookupFeePercentage(
  constructionValue: number,
  complexityLevel: 'low' | 'medium' | 'high',
  tables: SACAPFeeTable[],
): FeePercentageResult {
  const table = tables.find(t => t.complexityLevel === complexityLevel);
  if (!table || table.bands.length === 0) {
    throw new Error(`No fee table found for complexity level: ${complexityLevel}`);
  }

  const bands = table.bands;
  let warning: string | undefined;

  // Clamp to lowest band if below minimum
  const lowestBand = bands[0];
  if (constructionValue < lowestBand.minValue) {
    return {
      percentage: lowestBand.feePercentage,
      warning: undefined,
    };
  }

  // Clamp to highest band if above maximum
  const highestBand = bands[bands.length - 1];
  if (constructionValue > highestBand.maxValue) {
    warning = 'Value exceeds published range — using maximum band rate';
    const fee = computeFeeForBand(highestBand.maxValue, highestBand);
    const percentage = (fee / constructionValue) * 100;
    return { percentage, warning };
  }

  // Find the containing band
  const band = bands.find(b => constructionValue >= b.minValue && constructionValue <= b.maxValue);
  if (!band) {
    // Value falls between bands — use the next higher band's lower boundary
    // This shouldn't happen with properly contiguous bands, but handle gracefully
    const nextBand = bands.find(b => constructionValue < b.minValue);
    if (nextBand) {
      return { percentage: nextBand.feePercentage };
    }
    return { percentage: highestBand.feePercentage };
  }

  // Compute fee using interpolation or flat percentage
  const fee = computeFeeForBand(constructionValue, band);
  const percentage = (fee / constructionValue) * 100;

  return { percentage, warning };
}

/**
 * Compute the fee amount for a given construction value within a band.
 * If baseFee and rateAboveMin are present, uses linear interpolation.
 * Otherwise, uses flat feePercentage.
 */
function computeFeeForBand(value: number, band: SACAPFeeTableBand): number {
  if (band.baseFee !== undefined && band.rateAboveMin !== undefined) {
    return band.baseFee + (value - band.minValue) * band.rateAboveMin;
  }
  return value * (band.feePercentage / 100);
}

/**
 * Calculate the full Project Fee (100% scope) for a given construction value and complexity.
 * The Project Fee represents the complete architectural service at all stages.
 */
export function calculateProjectFee(
  constructionValue: number,
  complexityLevel: 'low' | 'medium' | 'high',
  tables: SACAPFeeTable[],
): ProjectFeeResult {
  const table = tables.find(t => t.complexityLevel === complexityLevel);
  if (!table || table.bands.length === 0) {
    throw new Error(`No fee table found for complexity level: ${complexityLevel}`);
  }

  const bands = table.bands;
  let warning: string | undefined;
  let fee: number;

  // Clamp to lowest band if below minimum
  const lowestBand = bands[0];
  if (constructionValue <= lowestBand.minValue) {
    fee = computeFeeForBand(lowestBand.minValue || constructionValue, lowestBand);
    if (constructionValue === 0) {
      return { projectFee: 0, projectFeeRate: 0, warning };
    }
    fee = computeFeeForBand(constructionValue, lowestBand);
    const projectFeeRate = constructionValue > 0 ? (fee / constructionValue) * 100 : 0;
    return { projectFee: roundMoney(fee), projectFeeRate: roundMoney(projectFeeRate * 100) / 100, warning };
  }

  // Clamp to highest band if above maximum
  const highestBand = bands[bands.length - 1];
  if (constructionValue > highestBand.maxValue) {
    warning = 'Value exceeds published range — using maximum band rate';
    fee = computeFeeForBand(highestBand.maxValue, highestBand);
    const projectFeeRate = (fee / constructionValue) * 100;
    return { projectFee: roundMoney(fee), projectFeeRate: roundMoney(projectFeeRate * 100) / 100, warning };
  }

  // Find the containing band
  const band = bands.find(b => constructionValue >= b.minValue && constructionValue <= b.maxValue);
  if (!band) {
    fee = constructionValue * (highestBand.feePercentage / 100);
    return { projectFee: roundMoney(fee), projectFeeRate: highestBand.feePercentage, warning };
  }

  fee = computeFeeForBand(constructionValue, band);
  const projectFeeRate = constructionValue > 0 ? (fee / constructionValue) * 100 : 0;

  return {
    projectFee: roundMoney(fee),
    projectFeeRate: roundMoney(projectFeeRate * 100) / 100,
    warning,
  };
}

/**
 * Calculate the Scope of Work Fee based on selected stage weights as a proportion of the Project Fee.
 * SACAP: "Scope of Work Fee" = Project Fee × sum of selected stage weight proportions.
 */
export function calculateScopeOfWorkFee(
  projectFee: number,
  selectedStageWeights: number,
): ScopeOfWorkFeeResult {
  const scopeOfWorkFee = roundMoney(projectFee * selectedStageWeights);
  const scopeOfWorkRate = roundMoney(selectedStageWeights * 100 * 100) / 100;

  return {
    scopeOfWorkFee,
    scopeOfWorkRate,
  };
}

/**
 * Create demonstration SACAP fee tables for all 3 complexity levels.
 * Based on realistic bands from SACAP Board Notice 27 of 2021.
 * Uses baseFee + rateAboveMin for interpolation within bands.
 */
export function createDemoFeeTables(): SACAPFeeTable[] {
  return [
    {
      complexityLevel: 'low',
      bands: [
        {
          minValue: 0,
          maxValue: 500_000,
          feePercentage: 7.5,
          baseFee: 0,
          rateAboveMin: 0.075,
        },
        {
          minValue: 500_001,
          maxValue: 2_500_000,
          feePercentage: 5.5,
          baseFee: 37_500,
          rateAboveMin: 0.055,
        },
        {
          minValue: 2_500_001,
          maxValue: 10_000_000,
          feePercentage: 4.0,
          baseFee: 147_500,
          rateAboveMin: 0.04,
        },
        {
          minValue: 10_000_001,
          maxValue: 50_000_000,
          feePercentage: 3.0,
          baseFee: 447_500,
          rateAboveMin: 0.03,
        },
        {
          minValue: 50_000_001,
          maxValue: 200_000_000,
          feePercentage: 2.5,
          baseFee: 1_647_500,
          rateAboveMin: 0.02,
        },
        {
          minValue: 200_000_001,
          maxValue: 500_000_000,
          feePercentage: 2.0,
          baseFee: 4_647_500,
          rateAboveMin: 0.015,
        },
      ],
    },
    {
      complexityLevel: 'medium',
      bands: [
        {
          minValue: 0,
          maxValue: 500_000,
          feePercentage: 9.5,
          baseFee: 0,
          rateAboveMin: 0.095,
        },
        {
          minValue: 500_001,
          maxValue: 2_500_000,
          feePercentage: 7.5,
          baseFee: 47_500,
          rateAboveMin: 0.075,
        },
        {
          minValue: 2_500_001,
          maxValue: 10_000_000,
          feePercentage: 5.5,
          baseFee: 197_500,
          rateAboveMin: 0.055,
        },
        {
          minValue: 10_000_001,
          maxValue: 50_000_000,
          feePercentage: 3.5,
          baseFee: 610_000,
          rateAboveMin: 0.035,
        },
        {
          minValue: 50_000_001,
          maxValue: 200_000_000,
          feePercentage: 3.0,
          baseFee: 2_010_000,
          rateAboveMin: 0.025,
        },
        {
          minValue: 200_000_001,
          maxValue: 500_000_000,
          feePercentage: 2.5,
          baseFee: 5_760_000,
          rateAboveMin: 0.018,
        },
      ],
    },
    {
      complexityLevel: 'high',
      bands: [
        {
          minValue: 0,
          maxValue: 500_000,
          feePercentage: 12.0,
          baseFee: 0,
          rateAboveMin: 0.12,
        },
        {
          minValue: 500_001,
          maxValue: 2_500_000,
          feePercentage: 9.5,
          baseFee: 60_000,
          rateAboveMin: 0.095,
        },
        {
          minValue: 2_500_001,
          maxValue: 10_000_000,
          feePercentage: 7.0,
          baseFee: 250_000,
          rateAboveMin: 0.07,
        },
        {
          minValue: 10_000_001,
          maxValue: 50_000_000,
          feePercentage: 4.5,
          baseFee: 775_000,
          rateAboveMin: 0.045,
        },
        {
          minValue: 50_000_001,
          maxValue: 200_000_000,
          feePercentage: 3.5,
          baseFee: 2_575_000,
          rateAboveMin: 0.03,
        },
        {
          minValue: 200_000_001,
          maxValue: 500_000_000,
          feePercentage: 3.0,
          baseFee: 7_075_000,
          rateAboveMin: 0.022,
        },
      ],
    },
  ];
}
