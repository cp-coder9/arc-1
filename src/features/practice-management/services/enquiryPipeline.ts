/**
 * Practice Management — Enquiry Pipeline Service
 *
 * Pure business logic for managing the practice enquiry pipeline:
 * - Stage transitions with forward-only rules and terminal state handling
 * - Pipeline metrics calculation (totals, conversion, win/loss)
 * - Stale enquiry detection
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */

import type { EnquiryRecord, EnquiryStage, LossReason, PipelineMetrics } from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Transition Map ───────────────────────────────────────────────────────────

/** Permitted transitions: source stage → allowed target stages */
const PERMITTED_TRANSITIONS: Record<EnquiryStage, EnquiryStage[]> = {
  lead: ['quote_sent'],
  quote_sent: ['quote_accepted', 'lost'],
  quote_accepted: ['appointed', 'lost'],
  appointed: ['active'],
  active: ['complete', 'on_hold'],
  on_hold: ['active', 'lost'],
  lost: [],      // terminal
  complete: [],  // terminal
};

/** Terminal stages — no outbound transitions allowed */
const TERMINAL_STAGES: EnquiryStage[] = ['lost', 'complete'];

// ─── Enquiry Transition ───────────────────────────────────────────────────────

/**
 * Transition an enquiry to a new stage.
 *
 * Rules:
 * - Only permitted transitions are allowed (see PERMITTED_TRANSITIONS)
 * - Terminal stages (lost, complete) cannot transition further
 * - Transitioning to "lost" requires a lossReason
 */
export function transitionEnquiry(
  enquiry: EnquiryRecord,
  targetStage: EnquiryStage,
  params?: { lossReason?: LossReason; notes?: string }
): ServiceResult<{ next: EnquiryRecord; valid: boolean; error?: string }> {
  // Reject if already in a terminal state
  if (TERMINAL_STAGES.includes(enquiry.currentStage)) {
    return {
      success: false,
      error: {
        code: 'TERMINAL_STAGE',
        message: `Enquiry is in terminal stage "${enquiry.currentStage}" and cannot be transitioned.`,
      },
    };
  }

  // Check if the transition is permitted
  const allowed = PERMITTED_TRANSITIONS[enquiry.currentStage];
  if (!allowed.includes(targetStage)) {
    return {
      success: false,
      error: {
        code: 'INVALID_TRANSITION',
        message: `Transition from "${enquiry.currentStage}" to "${targetStage}" is not permitted. Allowed targets: ${allowed.join(', ') || 'none'}.`,
      },
    };
  }

  // If transitioning to "lost", lossReason is required
  if (targetStage === 'lost') {
    if (!params?.lossReason) {
      return {
        success: false,
        error: {
          code: 'LOSS_REASON_REQUIRED',
          message: 'A loss reason is required when transitioning to the "lost" stage.',
        },
      };
    }
  }

  // Build the transitioned record
  const now = new Date().toISOString();
  const next: EnquiryRecord = {
    ...enquiry,
    currentStage: targetStage,
    lastActivityDate: now,
    updatedAt: now,
    stageHistory: [
      ...enquiry.stageHistory,
      { stage: targetStage, date: now, actor: enquiry.createdBy },
    ],
    ...(targetStage === 'lost' && params?.lossReason
      ? { lossReason: params.lossReason, lossNotes: params.notes }
      : {}),
  };

  return {
    success: true,
    data: { next, valid: true },
  };
}

// ─── Pipeline Metrics ─────────────────────────────────────────────────────────

/**
 * Calculate pipeline metrics from a set of enquiries.
 *
 * Metrics:
 * - totalByStage: count of enquiries per stage
 * - feeValueByStage: sum of estimatedFeeValueZAR per stage
 * - conversionRate: (enquiries reaching 'appointed' / total) * 100
 * - averageTimePerStage: average days spent at each stage (from stageHistory)
 * - winLossRatioMonth: appointed in current month / lost in current month
 * - winLossRatio12Month: appointed in trailing 12 months / lost in trailing 12 months
 */
export function calculatePipelineMetrics(
  enquiries: EnquiryRecord[],
  now: Date
): ServiceResult<PipelineMetrics> {
  if (!enquiries || !Array.isArray(enquiries)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Enquiries must be a valid array.',
      },
    };
  }

  const allStages: EnquiryStage[] = [
    'lead', 'quote_sent', 'quote_accepted', 'appointed', 'active', 'complete', 'on_hold', 'lost',
  ];

  // Total by stage
  const totalByStage = Object.fromEntries(
    allStages.map(stage => [stage, 0])
  ) as Record<EnquiryStage, number>;

  // Fee value by stage
  const feeValueByStage = Object.fromEntries(
    allStages.map(stage => [stage, 0])
  ) as Record<EnquiryStage, number>;

  for (const enquiry of enquiries) {
    totalByStage[enquiry.currentStage]++;
    feeValueByStage[enquiry.currentStage] += enquiry.estimatedFeeValueZAR || 0;
  }

  // Conversion rate: enquiries that have reached 'appointed' (or beyond) / total
  const appointedOrBeyond: EnquiryStage[] = ['appointed', 'active', 'complete'];
  const reachedAppointed = enquiries.filter(e =>
    appointedOrBeyond.includes(e.currentStage) ||
    e.stageHistory.some(h => appointedOrBeyond.includes(h.stage))
  ).length;
  const conversionRate = enquiries.length > 0
    ? (reachedAppointed / enquiries.length) * 100
    : 0;

  // Average time per stage (from stageHistory)
  const averageTimePerStage = calculateAverageTimePerStage(enquiries, allStages);

  // Win/loss ratios
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const trailing12MonthStart = new Date(now.getFullYear(), now.getMonth() - 12, 1);

  const winLossRatioMonth = calculateWinLossRatio(enquiries, currentMonthStart, now);
  const winLossRatio12Month = calculateWinLossRatio(enquiries, trailing12MonthStart, now);

  return {
    success: true,
    data: {
      totalByStage,
      feeValueByStage,
      conversionRate,
      averageTimePerStage,
      winLossRatioMonth,
      winLossRatio12Month,
    },
  };
}

// ─── Stale Enquiry Detection ──────────────────────────────────────────────────

/**
 * Evaluate which enquiries are stale.
 *
 * An enquiry is stale if:
 * - lastActivityDate is more than thresholdDays ago
 * - The enquiry is NOT in a terminal state (lost, complete)
 */
export function evaluateStaleEnquiries(
  enquiries: EnquiryRecord[],
  now: Date,
  thresholdDays: number = 30
): ServiceResult<EnquiryRecord[]> {
  if (!enquiries || !Array.isArray(enquiries)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Enquiries must be a valid array.',
      },
    };
  }

  if (thresholdDays <= 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_THRESHOLD',
        message: 'Threshold days must be a positive number.',
      },
    };
  }

  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

  const staleEnquiries = enquiries.filter(enquiry => {
    // Skip terminal states
    if (TERMINAL_STAGES.includes(enquiry.currentStage)) {
      return false;
    }

    const lastActivity = new Date(enquiry.lastActivityDate).getTime();
    const elapsed = now.getTime() - lastActivity;

    return elapsed > thresholdMs;
  });

  return {
    success: true,
    data: staleEnquiries,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate average days spent at each stage across all enquiries.
 * Uses stageHistory entries to determine time between consecutive stage transitions.
 */
function calculateAverageTimePerStage(
  enquiries: EnquiryRecord[],
  allStages: EnquiryStage[]
): Record<EnquiryStage, number> {
  const stageDurations: Record<EnquiryStage, number[]> = Object.fromEntries(
    allStages.map(stage => [stage, []])
  ) as Record<EnquiryStage, number[]>;

  for (const enquiry of enquiries) {
    const history = enquiry.stageHistory;
    if (history.length < 2) continue;

    for (let i = 0; i < history.length - 1; i++) {
      const current = history[i];
      const next = history[i + 1];
      const durationMs = new Date(next.date).getTime() - new Date(current.date).getTime();
      const durationDays = durationMs / (1000 * 60 * 60 * 24);

      if (durationDays >= 0) {
        stageDurations[current.stage].push(durationDays);
      }
    }
  }

  const averageTimePerStage = Object.fromEntries(
    allStages.map(stage => {
      const durations = stageDurations[stage];
      const avg = durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;
      return [stage, Math.round(avg * 100) / 100]; // round to 2 decimal places
    })
  ) as Record<EnquiryStage, number>;

  return averageTimePerStage;
}

/**
 * Calculate win/loss ratio for a given date range.
 * Win = enquiries that reached 'appointed' stage within the range.
 * Loss = enquiries that reached 'lost' stage within the range.
 * Returns ratio as wins / losses. If no losses, returns wins count (or 0 if no wins either).
 */
function calculateWinLossRatio(
  enquiries: EnquiryRecord[],
  rangeStart: Date,
  rangeEnd: Date
): number {
  let wins = 0;
  let losses = 0;

  for (const enquiry of enquiries) {
    for (const entry of enquiry.stageHistory) {
      const entryDate = new Date(entry.date);
      if (entryDate >= rangeStart && entryDate <= rangeEnd) {
        if (entry.stage === 'appointed') {
          wins++;
          break; // count each enquiry only once
        }
        if (entry.stage === 'lost') {
          losses++;
          break; // count each enquiry only once
        }
      }
    }
  }

  if (losses === 0) {
    return wins; // no losses → ratio is just the win count (or 0)
  }

  return Math.round((wins / losses) * 100) / 100;
}
