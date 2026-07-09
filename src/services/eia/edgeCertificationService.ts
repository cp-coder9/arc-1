/**
 * EDGE Certification Service
 *
 * Calculates EDGE certification eligibility based on three resource category
 * thresholds: Energy, Water, and Embodied Energy in Materials.
 *
 * EDGE Levels:
 * - not_eligible: any category < 20% savings
 * - edge_certified: all categories ≥ 20% savings
 * - edge_advanced: all categories ≥ 40% savings
 * - edge_zero_carbon: all categories ≥ 40% AND energy savings = 100% (renewable offset)
 *
 * Requirements: 10.1–10.9
 */

import type {
  EDGECategoryValue,
  EDGECategory,
  EDGELevel,
  EDGEStage,
  EDGEResult,
} from './eiaTypes';

/**
 * Validates that a percentage savings value is within the valid 0–100 range.
 * Returns true if valid, false otherwise.
 */
export function validateEDGEInput(savings: number): boolean {
  return typeof savings === 'number' && !isNaN(savings) && savings >= 0 && savings <= 100;
}

/**
 * Determines the EDGE certification level based on category savings values.
 *
 * Logic:
 * 1. If any category has < 20% savings → not_eligible
 * 2. If all categories ≥ 40% AND energy = 100% → edge_zero_carbon
 * 3. If all categories ≥ 40% → edge_advanced
 * 4. If all categories ≥ 20% → edge_certified
 */
export function calculateEDGELevel(categories: EDGECategoryValue[]): EDGELevel {
  if (categories.length === 0) {
    return 'not_eligible';
  }

  const allMeetBasic = categories.every(c => c.percentageSavings >= 20);
  if (!allMeetBasic) {
    return 'not_eligible';
  }

  const allMeetAdvanced = categories.every(c => c.percentageSavings >= 40);
  if (!allMeetAdvanced) {
    return 'edge_certified';
  }

  // Check for zero carbon: energy category must have 100% savings (representing
  // 100% operational energy from renewables)
  const energyCategory = categories.find(c => c.category === 'energy');
  if (energyCategory && energyCategory.percentageSavings === 100) {
    return 'edge_zero_carbon';
  }

  return 'edge_advanced';
}

/**
 * Computes the full EDGE certification result including pass/fail per category,
 * overall level, and metadata.
 *
 * Each category's `meetsThreshold` is set based on whether it achieves ≥ 20% savings.
 * The overall `allCategoriesValid` indicates whether all categories pass the minimum threshold.
 */
export function computeEDGEResult(
  categories: EDGECategoryValue[],
  stage: EDGEStage
): EDGEResult {
  // Update meetsThreshold for each category
  const updatedCategories: EDGECategoryValue[] = categories.map(c => ({
    ...c,
    meetsThreshold: c.percentageSavings >= 20,
  }));

  const allCategoriesValid = updatedCategories.length > 0 && updatedCategories.every(c => c.meetsThreshold);
  const level = calculateEDGELevel(updatedCategories);

  return {
    categories: updatedCategories,
    level,
    stage,
    allCategoriesValid,
    lastUpdated: new Date().toISOString(),
  };
}
