/**
 * Net Zero Pathway Service
 *
 * Pure function service for tracking net-zero pathway progress with linear
 * interpolation trajectory comparison. Calculates percentage reduction from
 * baseline, evaluates on-track status with configurable tolerance, and
 * computes full progress snapshots.
 *
 * Requirements: 11.1–11.7
 */

import type {
  NetZeroTarget,
  NetZeroTargetType,
  AnnualPerformance,
  NetZeroProgress,
} from './eiaTypes';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Default tolerance threshold in percentage points for on-track evaluation.
 * When actual performance deviates from trajectory by more than this,
 * an Action Centre attention event is surfaced.
 * Requirement 11.4
 */
export const NET_ZERO_TOLERANCE_POINTS = 10;

// ─── Trajectory Calculation ──────────────────────────────────────────────────

/**
 * Calculates the expected percentage reduction from baseline for a given year
 * using linear interpolation between baseline year (0% reduction) and
 * target year (100% reduction).
 *
 * trajectory(year) = ((year - baselineYear) / (targetYear - baselineYear)) * 100
 *
 * - At baseline year: returns 0 (no reduction expected)
 * - At target year: returns 100 (full reduction expected)
 * - Between: linearly interpolated value
 * - Before baseline year: returns 0 (clamped)
 * - After target year: returns 100 (clamped)
 *
 * Requirement 11.3
 */
export function calculateTrajectoryTarget(
  baselineYear: number,
  targetYear: number,
  currentYear: number
): number {
  if (targetYear === baselineYear) {
    return 0;
  }

  if (currentYear <= baselineYear) {
    return 0;
  }

  if (currentYear >= targetYear) {
    return 100;
  }

  return ((currentYear - baselineYear) / (targetYear - baselineYear)) * 100;
}

// ─── Percentage Reduction ────────────────────────────────────────────────────

/**
 * Calculates the percentage reduction from baseline consumption.
 *
 * Formula: ((baselineConsumption - actualConsumption) / baselineConsumption) * 100
 *
 * - If baseline is 0, returns 0 (avoid division by zero)
 * - Positive result means actual is below baseline (reduction achieved)
 * - Negative result means actual is above baseline (increase from baseline)
 *
 * Requirement 11.3
 */
export function calculatePercentageReduction(
  baselineConsumption: number,
  actualConsumption: number
): number {
  if (baselineConsumption === 0) {
    return 0;
  }

  return ((baselineConsumption - actualConsumption) / baselineConsumption) * 100;
}

// ─── On-Track Evaluation ─────────────────────────────────────────────────────

/**
 * Evaluates whether actual performance is on track relative to the trajectory target.
 *
 * On-track condition: actual >= trajectory - tolerancePoints
 * Off-track condition: actual < trajectory - tolerancePoints
 * Deviation: actual - trajectory (positive = ahead, negative = behind)
 *
 * Requirement 11.3, 11.4
 */
export function evaluateOnTrackStatus(
  actual: number,
  trajectory: number,
  tolerancePoints: number
): { onTrack: boolean; deviation: number } {
  const deviation = actual - trajectory;
  const onTrack = actual >= trajectory - tolerancePoints;

  return { onTrack, deviation };
}

// ─── Full Progress Calculation ───────────────────────────────────────────────

/**
 * Computes the complete net-zero progress snapshot for a target given
 * annual performance data and the current year.
 *
 * Steps:
 * 1. Calculate trajectory target for current year (linear interpolation)
 * 2. Find most recent annual performance data for the current year
 * 3. Calculate percentage reduction from baseline
 * 4. Evaluate on-track status with tolerance threshold
 * 5. Return full NetZeroProgress object
 *
 * If no annual data exists for the current year, uses the most recent
 * available year's data. If no data exists at all, uses baseline values
 * (0% reduction).
 *
 * Requirements: 11.1–11.7
 */
export function computeNetZeroProgress(
  target: NetZeroTarget,
  annualData: AnnualPerformance[],
  currentYear: number
): NetZeroProgress {
  const trajectoryTarget = calculateTrajectoryTarget(
    target.baselineYear,
    target.targetYear,
    currentYear
  );

  // Find data for the current year, or fall back to most recent year
  let relevantData: AnnualPerformance | undefined;

  // First try exact match for current year
  relevantData = annualData.find((d) => d.year === currentYear);

  // If not found, use most recent year's data
  if (!relevantData && annualData.length > 0) {
    const sorted = [...annualData].sort((a, b) => b.year - a.year);
    relevantData = sorted[0];
  }

  // Calculate percentage reduction
  let percentageReduction: number;
  if (relevantData) {
    percentageReduction = calculatePercentageReduction(
      relevantData.baselineConsumption,
      relevantData.actualConsumption
    );
  } else {
    // No data available — assume no reduction from baseline
    percentageReduction = 0;
  }

  // Evaluate on-track status
  const { onTrack, deviation } = evaluateOnTrackStatus(
    percentageReduction,
    trajectoryTarget,
    NET_ZERO_TOLERANCE_POINTS
  );

  return {
    target,
    annualData,
    percentageReduction,
    trajectoryTarget,
    onTrack,
    deviationPercentagePoints: deviation,
  };
}
