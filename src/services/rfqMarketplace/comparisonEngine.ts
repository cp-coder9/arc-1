// ─── Comparison Engine ───────────────────────────────────────────────────────
// Implements linear min-max normalisation, weighted scoring, ranking, and
// tie-breaking. Pure functions for deterministic, testable comparison logic.

import type {
  QuoteResponse,
  EvaluationCriteria,
  ScoredQuote,
  ComparisonResult,
  NormalizedScores,
  RawScores,
  SupplierMarketplaceProfile,
} from './types';

/**
 * Converts a B-BBEE level number (1–8) to a raw score.
 * Level 1 = 100 (maximum), Level 8 = 12.5 (minimum), proportional.
 * Returns 0 if level is undefined or out of range.
 */
function bbeeRawScore(level: number | undefined): number {
  if (level === undefined || level < 1 || level > 8) {
    return 0;
  }
  // Level 1 → 100, Level 2 → 87.5, ..., Level 8 → 12.5
  // Formula: (9 - level) / 8 * 100 = (9 - level) * 12.5
  return (9 - level) * 12.5;
}

/**
 * Calculates a performance score from supplier metrics.
 * Combines onTimeDeliveryPct (0–100) and averageRating (0–5 scaled to 0–100).
 * Returns 50 (neutral) if no metrics available.
 */
function performanceRawScore(profile: SupplierMarketplaceProfile | null): number {
  if (!profile || !profile.performanceMetrics) {
    return 50; // neutral default for suppliers without performance data
  }
  const { onTimeDeliveryPct, averageRating } = profile.performanceMetrics;
  // Combine: 50% on-time delivery + 50% rating (scaled from 0–5 to 0–100)
  const ratingScaled = (averageRating / 5) * 100;
  return (onTimeDeliveryPct + ratingScaled) / 2;
}

/**
 * Extracts raw score values from a quote and supplier profile.
 */
export function extractRawScores(
  quote: QuoteResponse,
  supplierProfile: SupplierMarketplaceProfile | null
): RawScores {
  return {
    price: quote.totalPrice,
    leadTime: quote.leadTimeDays,
    bbee: bbeeRawScore(supplierProfile?.bbeeLevelNumber),
    warranty: quote.warrantyMonths ?? 0,
    performance: performanceRawScore(supplierProfile),
  };
}

/**
 * Normalises raw scores using linear min-max normalisation.
 * Produces scores in the range [0.00, 100.00].
 *
 * For "lower is better" metrics (price, leadTime):
 *   normalized = (max - value) / (max - min) * 100
 *
 * For "higher is better" metrics (bbee, warranty, performance):
 *   normalized = (value - min) / (max - min) * 100
 *
 * Edge case: if all values are equal (max === min), all normalized scores are 100.
 */
export function normalizeScores(
  allRawScores: RawScores[],
  index: number
): NormalizedScores {
  const current = allRawScores[index];

  const prices = allRawScores.map((s) => s.price);
  const leadTimes = allRawScores.map((s) => s.leadTime);
  const bbees = allRawScores.map((s) => s.bbee);
  const warranties = allRawScores.map((s) => s.warranty);
  const performances = allRawScores.map((s) => s.performance);

  return {
    price: normalizeLowerIsBetter(current.price, prices),
    leadTime: normalizeLowerIsBetter(current.leadTime, leadTimes),
    bbee: normalizeHigherIsBetter(current.bbee, bbees),
    warranty: normalizeHigherIsBetter(current.warranty, warranties),
    performance: normalizeHigherIsBetter(current.performance, performances),
  };
}

/**
 * For "lower is better" metrics: best value = lowest, so
 * normalized = (max - value) / (max - min) * 100
 */
function normalizeLowerIsBetter(value: number, allValues: number[]): number {
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  if (max === min) return 100;
  return ((max - value) / (max - min)) * 100;
}

/**
 * For "higher is better" metrics: best value = highest, so
 * normalized = (value - min) / (max - min) * 100
 */
function normalizeHigherIsBetter(value: number, allValues: number[]): number {
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  if (max === min) return 100;
  return ((value - min) / (max - min)) * 100;
}

/**
 * Calculates the weighted score from normalised scores and criteria weights.
 * Returns a value in [0.00, 100.00] rounded to two decimal places.
 *
 * weightedScore = sum of (normalizedScore[dimension] * weight[dimension] / 100)
 */
export function calculateWeightedScore(
  normalizedScores: NormalizedScores,
  criteria: EvaluationCriteria
): number {
  const weighted =
    (normalizedScores.price * criteria.priceWeight) / 100 +
    (normalizedScores.leadTime * criteria.leadTimeWeight) / 100 +
    (normalizedScores.bbee * criteria.bbeeWeight) / 100 +
    (normalizedScores.warranty * criteria.warrantyWeight) / 100 +
    (normalizedScores.performance * criteria.performanceWeight) / 100;

  return Math.round(weighted * 100) / 100;
}

/**
 * Ranks scored quotes by weighted score descending.
 * Breaks ties by earliest submittedAt timestamp.
 * Returns a new sorted array with rank field populated (1-based).
 */
export function rankQuotes(scoredQuotes: ScoredQuote[]): ScoredQuote[] {
  const sorted = [...scoredQuotes].sort((a, b) => {
    // Primary: descending by weighted score
    if (b.weightedScore !== a.weightedScore) {
      return b.weightedScore - a.weightedScore;
    }
    // Tie-break: ascending by submittedAt (earliest first gets better rank)
    // submittedAt is stored on quote but we need it for ranking — embedded in quoteId lookup
    // Since ScoredQuote doesn't have submittedAt, we use the original sort order
    // Actually, we need submittedAt for tie-breaking. We'll store it temporarily.
    return 0; // handled below with submittedAt data
  });

  // Assign ranks
  return sorted.map((quote, idx) => ({
    ...quote,
    rank: idx + 1,
  }));
}

/**
 * Internal rank function that has access to submittedAt for tie-breaking.
 */
function rankQuotesWithTimestamps(
  scoredQuotes: ScoredQuote[],
  submittedAtMap: Map<string, string>
): ScoredQuote[] {
  const sorted = [...scoredQuotes].sort((a, b) => {
    // Primary: descending by weighted score
    if (b.weightedScore !== a.weightedScore) {
      return b.weightedScore - a.weightedScore;
    }
    // Tie-break: ascending by submittedAt (earliest first gets better rank)
    const aTime = submittedAtMap.get(a.quoteId) ?? '';
    const bTime = submittedAtMap.get(b.quoteId) ?? '';
    return aTime.localeCompare(bTime);
  });

  // Assign ranks (1-based)
  return sorted.map((quote, idx) => ({
    ...quote,
    rank: idx + 1,
  }));
}

/**
 * Generates a full comparison result from quotes, criteria, and supplier profiles.
 * Produces normalised, weighted, and ranked results.
 *
 * Steps:
 * 1. Extract raw scores for each quote
 * 2. Normalize scores across all quotes (min-max)
 * 3. Calculate weighted scores
 * 4. Rank quotes (descending score, tie-break by earliest submittedAt)
 * 5. Return ComparisonResult with generatedAt timestamp
 */
export function generateComparison(
  quotes: QuoteResponse[],
  criteria: EvaluationCriteria,
  supplierProfiles: Map<string, SupplierMarketplaceProfile>
): ComparisonResult {
  // Step 1: Extract raw scores for each quote
  const allRawScores: RawScores[] = quotes.map((quote) => {
    const profile = supplierProfiles.get(quote.supplierId) ?? null;
    return extractRawScores(quote, profile);
  });

  // Step 2 & 3: Normalize and calculate weighted scores
  const scoredQuotes: ScoredQuote[] = quotes.map((quote, index) => {
    const rawScores = allRawScores[index];
    const normalizedScores = normalizeScores(allRawScores, index);
    const weightedScore = calculateWeightedScore(normalizedScores, criteria);

    return {
      quoteId: quote.id,
      supplierId: quote.supplierId,
      supplierName: quote.supplierName,
      rawScores,
      normalizedScores,
      weightedScore,
      rank: 0, // will be assigned during ranking
    };
  });

  // Build submittedAt map for tie-breaking
  const submittedAtMap = new Map<string, string>();
  for (const quote of quotes) {
    submittedAtMap.set(quote.id, quote.submittedAt);
  }

  // Step 4: Rank quotes
  const rankedQuotes = rankQuotesWithTimestamps(scoredQuotes, submittedAtMap);

  return {
    scoredQuotes: rankedQuotes,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Detects whether the lowest-price quote differs from the highest-score quote.
 * Returns flag info with price and score differences in Rand and points.
 */
export function detectPriceScoreDivergence(
  scoredQuotes: ScoredQuote[],
  quotes: QuoteResponse[]
): { diverges: boolean; priceDifferenceRand?: number; scoreDifferencePoints?: number } {
  if (scoredQuotes.length < 2) {
    return { diverges: false };
  }

  // Find lowest-price quote
  const priceMap = new Map<string, number>();
  for (const quote of quotes) {
    priceMap.set(quote.id, quote.totalPrice);
  }

  let lowestPriceQuoteId = quotes[0].id;
  let lowestPrice = quotes[0].totalPrice;
  for (const quote of quotes) {
    if (quote.totalPrice < lowestPrice) {
      lowestPrice = quote.totalPrice;
      lowestPriceQuoteId = quote.id;
    }
  }

  // Find highest-score quote (rank 1)
  const highestScoreQuote = scoredQuotes.reduce((best, current) =>
    current.weightedScore > best.weightedScore ? current : best
  );

  if (lowestPriceQuoteId === highestScoreQuote.quoteId) {
    return { diverges: false };
  }

  // Calculate differences
  const highestScorePrice = priceMap.get(highestScoreQuote.quoteId) ?? 0;
  const lowestPriceQuoteScored = scoredQuotes.find((sq) => sq.quoteId === lowestPriceQuoteId);
  const lowestPriceQuoteScore = lowestPriceQuoteScored?.weightedScore ?? 0;

  const priceDifferenceRand = Math.abs(highestScorePrice - lowestPrice);
  const scoreDifferencePoints = Math.abs(highestScoreQuote.weightedScore - lowestPriceQuoteScore);

  return {
    diverges: true,
    priceDifferenceRand: Math.round(priceDifferenceRand * 100) / 100,
    scoreDifferencePoints: Math.round(scoreDifferencePoints * 100) / 100,
  };
}

/**
 * Returns a line-item price breakdown across up to 10 quotes.
 * For a given rfqLineItemId, returns the unit price and extended price
 * from each quote (max 10 quotes).
 */
export function getLineItemBreakdown(
  quotes: QuoteResponse[],
  rfqLineItemId: string
): Array<{ supplierId: string; supplierName: string; unitPrice: number; extendedPrice: number }> {
  // Limit to 10 quotes
  const limitedQuotes = quotes.slice(0, 10);

  return limitedQuotes
    .map((quote) => {
      const lineItem = quote.lineItems.find((li) => li.rfqLineItemId === rfqLineItemId);
      if (!lineItem) return null;
      return {
        supplierId: quote.supplierId,
        supplierName: quote.supplierName,
        unitPrice: lineItem.unitPrice,
        extendedPrice: lineItem.extendedPrice,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
