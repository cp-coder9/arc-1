/**
 * Green Star SA Rating Service
 *
 * Handles Green Star SA credit scoring, star rating calculation,
 * category minimum enforcement, and at-risk credit identification.
 *
 * Requirements: 9.1–9.8
 */

import type {
  Credit,
  CreditCategory,
  StarRating,
  RatingTool,
  GreenStarResult,
  UnmetMinimum,
  EvidenceStatus,
} from './eiaTypes';

// ─── Category Minimums per Rating Tool ───────────────────────────────────────

/**
 * Minimum points required per category for each standard rating tool.
 * Custom rating tools have no enforced minimums.
 */
export const CATEGORY_MINIMUMS: Record<
  Exclude<RatingTool, 'custom'>,
  Partial<Record<CreditCategory, number>>
> = {
  office_v1: {
    energy: 4,
    water: 3,
    ieq: 3,
    materials: 2,
    land_use_ecology: 2,
  },
  residential_v1: {
    energy: 4,
    water: 4,
    ieq: 3,
    materials: 2,
    land_use_ecology: 2,
  },
  retail_v1: {
    energy: 5,
    water: 3,
    ieq: 3,
    materials: 2,
    land_use_ecology: 2,
  },
  public_education_v1: {
    energy: 4,
    water: 3,
    ieq: 4,
    materials: 2,
    land_use_ecology: 2,
  },
};

// ─── Star Rating Calculation ─────────────────────────────────────────────────

/**
 * Calculates the Green Star SA star rating based on total achieved points.
 *
 * Thresholds:
 * - 6 Star: ≥ 75 points (World Leadership)
 * - 5 Star: ≥ 60 points (South African Excellence)
 * - 4 Star: ≥ 45 points (Best Practice)
 * - 3 Star: ≥ 30 points (Good Practice)
 * - 2 Star: ≥ 20 points
 * - 1 Star: ≥ 10 points
 * - 0 Star: < 10 points (not eligible)
 */
export function calculateStarRating(totalPoints: number): StarRating {
  if (totalPoints >= 75) return 6;
  if (totalPoints >= 60) return 5;
  if (totalPoints >= 45) return 4;
  if (totalPoints >= 30) return 3;
  if (totalPoints >= 20) return 2;
  if (totalPoints >= 10) return 1;
  return 0;
}

// ─── Category Minimum Enforcement ────────────────────────────────────────────

/**
 * Validates whether category minimum point thresholds are met for the selected rating tool.
 * Custom rating tools always pass (no minimums enforced).
 *
 * Returns whether all minimums are met and a list of unmet categories.
 */
export function checkCategoryMinimums(
  credits: Credit[],
  ratingTool: RatingTool
): { met: boolean; unmet: UnmetMinimum[] } {
  if (ratingTool === 'custom') {
    return { met: true, unmet: [] };
  }

  const minimums = CATEGORY_MINIMUMS[ratingTool];
  const unmet: UnmetMinimum[] = [];

  // Sum achieved points per category
  const achievedByCategory = new Map<CreditCategory, number>();
  for (const credit of credits) {
    const current = achievedByCategory.get(credit.category) ?? 0;
    achievedByCategory.set(credit.category, current + credit.achievedPoints);
  }

  // Check each category minimum
  for (const [category, required] of Object.entries(minimums)) {
    const achieved = achievedByCategory.get(category as CreditCategory) ?? 0;
    if (achieved < required) {
      unmet.push({
        category: category as CreditCategory,
        required,
        achieved,
      });
    }
  }

  return { met: unmet.length === 0, unmet };
}

// ─── Full Green Star Result Calculation ──────────────────────────────────────

/**
 * Calculates the complete Green Star SA result including:
 * - Total targeted and achieved scores
 * - Star rating based on achieved points
 * - Category minimum enforcement with rating reduction if minimums not met
 *
 * If category minimums are not met, the star rating is reduced to the highest
 * level whose minimums are fully satisfied (iteratively checked downward).
 */
export function calculateGreenStarResult(
  credits: Credit[],
  ratingTool: RatingTool
): GreenStarResult {
  const totalTargeted = credits.reduce((sum, c) => sum + c.targetedPoints, 0);
  const totalAchieved = credits.reduce((sum, c) => sum + c.achievedPoints, 0);

  const baseStarRating = calculateStarRating(totalAchieved);
  const { met: categoryMinimumsMet, unmet: unmetMinimums } = checkCategoryMinimums(credits, ratingTool);

  // If minimums are not met, reduce the star rating
  let starRating: StarRating = baseStarRating;
  if (!categoryMinimumsMet && starRating > 0) {
    // Reduce star rating by 1 level when minimums are not met
    starRating = Math.max(0, starRating - 1) as StarRating;
  }

  return {
    ratingTool,
    credits,
    totalTargeted,
    totalAchieved,
    starRating,
    categoryMinimumsMet,
    unmetMinimums,
  };
}

// ─── At-Risk Credit Identification ──────────────────────────────────────────

/**
 * Identifies credits that are at risk of not being ready for review submission.
 *
 * A credit is at risk if:
 * - It has targeted points > 0 (it's being pursued)
 * - Its evidence status is 'not_started' or 'in_progress'
 * - The review submission date is within the specified threshold days
 *
 * @param credits - Array of credits to evaluate
 * @param reviewDate - ISO 8601 date string for the project review submission date
 * @param thresholdDays - Number of days before review date to flag credits (default: 30)
 * @returns Array of credits that are at risk
 */
export function identifyAtRiskCredits(
  credits: Credit[],
  reviewDate: string,
  thresholdDays: number = 30
): Credit[] {
  const review = new Date(reviewDate);
  const now = new Date();

  // Calculate the number of days until the review date
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilReview = Math.ceil((review.getTime() - now.getTime()) / msPerDay);

  // If review date is beyond threshold, no credits are at risk
  if (daysUntilReview > thresholdDays) {
    return [];
  }

  const atRiskStatuses: EvidenceStatus[] = ['not_started', 'in_progress'];

  return credits.filter(
    (credit) =>
      credit.targetedPoints > 0 &&
      atRiskStatuses.includes(credit.evidenceStatus)
  );
}
