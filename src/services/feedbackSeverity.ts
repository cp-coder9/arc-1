/**
 * Feedback Loop — Severity Score Computation
 *
 * Pure function to compute severity score (1–10) for a feedback cluster
 * based on occurrence count, sentiment breakdown, and distinct user count.
 *
 * @module feedbackSeverity
 */

import type { SentimentBreakdown } from '@/services/feedbackTypes';

/**
 * Computes severity score (1-10) for a cluster based on:
 * - occurrenceCount: number of submissions (≥1)
 * - sentimentBreakdown: counts for each sentiment
 * - distinctUserCount: unique reporters (≥1)
 *
 * Formula: combines frequency weight + negativity ratio + user spread
 *   - Frequency: log₂ scale capped at 5 points
 *   - Negativity: (negative + frustrated) / total → up to 3 points
 *   - User spread: diversity of reporters → up to 2 points
 *
 * Result is clamped to integer 1–10.
 */
export function computeSeverityScore(
  occurrenceCount: number,
  sentimentBreakdown: SentimentBreakdown,
  distinctUserCount: number
): number {
  // Frequency: log scale, caps at 5
  const freqWeight = Math.min(Math.log2(occurrenceCount + 1) / Math.log2(50), 1) * 5;

  // Negativity ratio: (negative + frustrated) / total
  const total =
    sentimentBreakdown.positive +
    sentimentBreakdown.neutral +
    sentimentBreakdown.negative +
    sentimentBreakdown.frustrated;
  const negRatio =
    total > 0 ? (sentimentBreakdown.negative + sentimentBreakdown.frustrated) / total : 0;
  const negWeight = negRatio * 3;

  // User spread: diversity of reporters
  const spreadWeight = Math.min(distinctUserCount / 10, 1) * 2;

  const raw = freqWeight + negWeight + spreadWeight;
  return Math.max(1, Math.min(10, Math.round(raw)));
}
