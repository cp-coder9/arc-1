/**
 * HIRA Engine — Hazard Identification and Risk Assessment Service
 *
 * Manages hazard registers, risk ratings (5×5 likelihood-severity matrix),
 * and control measure tracking per the OHS Act.
 */

import type { HazardEntry, RiskLevel } from './hsTypes';
import { RISK_MATRIX_THRESHOLDS } from './hsConstants';
import { HazardEntrySchema } from './hsSchemas';

/**
 * Calculates a risk rating and classification level from likelihood and severity values.
 *
 * Rating = likelihood × severity (range 1–25).
 * Level classification uses RISK_MATRIX_THRESHOLDS:
 *   Low: 1–4, Medium: 5–9, High: 10–15, Critical: 16–25
 */
export function calculateRiskRating(
  likelihood: number,
  severity: number
): { rating: number; level: RiskLevel } {
  const rating = likelihood * severity;

  let level: RiskLevel;
  if (rating >= RISK_MATRIX_THRESHOLDS.critical.min) {
    level = 'critical';
  } else if (rating >= RISK_MATRIX_THRESHOLDS.high.min) {
    level = 'high';
  } else if (rating >= RISK_MATRIX_THRESHOLDS.medium.min) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { rating, level };
}

/**
 * Creates a new HazardEntry from validated input.
 *
 * - Generates a unique ID using `hs-hazard-${Date.now()}` pattern
 * - Calculates riskRating from input likelihood × severity
 * - Derives residualRisk from the same calculation (initial residual = inherent risk)
 * - Sets createdAt/updatedAt to current ISO timestamp
 * - Validates input with HazardEntrySchema
 */
export function createHazard(
  input: Omit<HazardEntry, 'id' | 'riskRating' | 'residualRisk' | 'createdAt' | 'updatedAt'>
): HazardEntry {
  // Validate input using Zod schema
  HazardEntrySchema.parse(input);

  const { rating, level } = calculateRiskRating(input.likelihood, input.severity);
  const now = new Date().toISOString();

  return {
    ...input,
    id: `hs-hazard-${Date.now()}`,
    riskRating: rating,
    residualRisk: level,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates the additional controls on a hazard and recalculates residual risk.
 *
 * Additional controls reduce effective severity by 1 level (minimum stays at 1).
 * The residualRisk is recalculated based on the original likelihood and the reduced severity.
 */
export function updateControls(hazard: HazardEntry, controls: string[]): HazardEntry {
  // Reduce severity by 1 for having additional controls, min 1
  const reducedSeverity = Math.max(1, hazard.severity - 1) as 1 | 2 | 3 | 4 | 5;
  const { level } = calculateRiskRating(hazard.likelihood, reducedSeverity);

  return {
    ...hazard,
    additionalControls: controls,
    residualRisk: level,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Filters hazards returning only those with residualRisk of 'high' or 'critical'.
 */
export function getHighRiskHazards(hazards: HazardEntry[]): HazardEntry[] {
  return hazards.filter(
    (hazard) => hazard.residualRisk === 'high' || hazard.residualRisk === 'critical'
  );
}
