/**
 * Command Centre KPI & Analytics Computation Service
 *
 * Pure functions for computing project KPIs specific to the Command Centre:
 * - Schedule Variance (planned vs actual milestone dates)
 * - Cost Variance (forecast vs contract sum)
 * - Quality Score (snag resolution rate)
 * - RFI Response Time (average days to respond)
 * - Trend Derivation (improving / stable / deteriorating)
 *
 * Integrates with the existing analyticsReportingEngine for report generation.
 * All functions are deterministic — identical inputs produce identical outputs.
 *
 * @module commandCentre/kpiService
 */

import type { CommandCentreMilestone } from './types';
import type { QualitySnagItem } from './qualityTrackerService';
import type { RFIEntity } from './deadlineDetectionService';
import type { BaseContext } from '../../types/analyticsReporting';
import { computeProjectKpis, generateReport } from '../analyticsReportingEngine';

// ── Types ────────────────────────────────────────────────────────────────────────

/** Trend direction for KPI indicators. */
export type TrendDirection = 'improving' | 'stable' | 'deteriorating';

/** KPI stat card data for the Command Centre analytics view. */
export interface CommandCentreKPI {
  name: string;
  label: string;
  value: number;
  unit: string;
  target?: number;
  trend: TrendDirection;
  status: 'on_target' | 'at_risk' | 'over';
}

/** Schedule variance computation result. */
export interface ScheduleVarianceResult {
  completedOnTime: number;
  delayed: number;
  totalWithDates: number;
  variancePercent: number;
}

/** Cost variance computation result. */
export interface CostVarianceResult {
  forecast: number;
  contractSum: number;
  variancePercent: number;
}

/** Quality score computation result. */
export interface QualityScoreResult {
  resolved: number;
  total: number;
  scorePercent: number;
}

/** RFI response time computation result. */
export interface RFIResponseTimeResult {
  totalResponseDays: number;
  respondedCount: number;
  averageDays: number;
}

// ── Constants ────────────────────────────────────────────────────────────────────

/** Default tolerance for trend comparison (absolute value). */
const TREND_TOLERANCE = 0.5;

// ── KPI Computations ─────────────────────────────────────────────────────────────

/**
 * Compute schedule variance from milestones.
 *
 * Formula: (completedOnTime - delayed) / totalWithDates * 100
 *
 * A milestone is "completed on time" if its status is 'complete' and its
 * actualDate is on or before the plannedDate.
 * A milestone is "delayed" if its status is 'overdue'.
 * Only milestones with a plannedDate are counted in the denominator.
 */
export function computeScheduleVariance(
  milestones: CommandCentreMilestone[],
): ScheduleVarianceResult {
  if (!milestones || milestones.length === 0) {
    return {
      completedOnTime: 0,
      delayed: 0,
      totalWithDates: 0,
      variancePercent: 0,
    };
  }

  const withDates = milestones.filter((m) => m.plannedDate);
  const totalWithDates = withDates.length;

  if (totalWithDates === 0) {
    return {
      completedOnTime: 0,
      delayed: 0,
      totalWithDates: 0,
      variancePercent: 0,
    };
  }

  const completedOnTime = withDates.filter(
    (m) =>
      m.status === 'complete' &&
      m.actualDate &&
      new Date(m.actualDate) <= new Date(m.plannedDate),
  ).length;

  const delayed = withDates.filter((m) => m.status === 'overdue').length;

  const variancePercent = (completedOnTime - delayed) / totalWithDates * 100;

  return {
    completedOnTime,
    delayed,
    totalWithDates,
    variancePercent,
  };
}

/**
 * Compute cost variance percentage.
 *
 * Formula: (forecast - contractSum) / contractSum * 100
 *
 * Positive result = over budget. Negative = under budget.
 * Returns 0 if contractSum is zero (avoids division by zero).
 */
export function computeCostVariance(
  forecast: number,
  contractSum: number,
): CostVarianceResult {
  if (contractSum === 0) {
    return {
      forecast,
      contractSum,
      variancePercent: 0,
    };
  }

  const variancePercent = ((forecast - contractSum) / contractSum) * 100;

  return {
    forecast,
    contractSum,
    variancePercent,
  };
}

/**
 * Compute quality score as snag resolution rate.
 *
 * Formula: resolved / total * 100
 *
 * A snag counts as "resolved" if its status is 'resolved' or 'closed'.
 * Returns 100 if there are no snags (no quality issues = perfect score).
 */
export function computeQualityScore(
  snags: Pick<QualitySnagItem, 'status'>[],
): QualityScoreResult {
  if (!snags || snags.length === 0) {
    return {
      resolved: 0,
      total: 0,
      scorePercent: 100,
    };
  }

  const total = snags.length;
  const resolved = snags.filter(
    (s) => s.status === 'resolved' || s.status === 'closed',
  ).length;

  const scorePercent = (resolved / total) * 100;

  return {
    resolved,
    total,
    scorePercent,
  };
}

/**
 * Compute average RFI response time in days.
 *
 * Only closed RFIs (those with both dateRaised and a closed status implying
 * a response was given) are included. For closed RFIs, response time is
 * calculated as the difference between responseDueDate (used as proxy for
 * actual response date when not separately tracked) and dateRaised.
 *
 * In practice, we use dateRaised and responseDueDate to compute the expected
 * response window. Only closed RFIs are counted (they have been responded to).
 * Returns 0 if no RFIs have been closed.
 */
export function computeRFIResponseTime(
  rfis: Pick<RFIEntity, 'dateRaised' | 'responseDueDate' | 'status'>[],
): RFIResponseTimeResult {
  if (!rfis || rfis.length === 0) {
    return {
      totalResponseDays: 0,
      respondedCount: 0,
      averageDays: 0,
    };
  }

  // Only closed RFIs have been responded to
  const closedRFIs = rfis.filter((rfi) => rfi.status === 'closed');

  if (closedRFIs.length === 0) {
    return {
      totalResponseDays: 0,
      respondedCount: 0,
      averageDays: 0,
    };
  }

  let totalResponseDays = 0;

  for (const rfi of closedRFIs) {
    const raised = new Date(rfi.dateRaised);
    const responded = new Date(rfi.responseDueDate);
    const diffMs = responded.getTime() - raised.getTime();
    const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    totalResponseDays += diffDays;
  }

  const averageDays = totalResponseDays / closedRFIs.length;

  return {
    totalResponseDays,
    respondedCount: closedRFIs.length,
    averageDays,
  };
}

/**
 * Derive trend direction from current and previous KPI values.
 *
 * - "improving": currentValue is better than previousValue
 * - "deteriorating": currentValue is worse than previousValue
 * - "stable": values are within tolerance of each other
 *
 * For metrics where higher is better (quality score, schedule variance):
 *   improving = current > previous
 *   deteriorating = current < previous
 *
 * For metrics where lower is better (cost variance, RFI response time):
 *   improving = current < previous
 *   deteriorating = current > previous
 *
 * @param currentValue - The latest KPI value
 * @param previousValue - The prior KPI value
 * @param higherIsBetter - Whether a higher value indicates improvement (default: true)
 * @param tolerance - Absolute tolerance for "stable" classification (default: 0.5)
 */
export function deriveTrend(
  currentValue: number,
  previousValue: number,
  higherIsBetter: boolean = true,
  tolerance: number = TREND_TOLERANCE,
): TrendDirection {
  const diff = currentValue - previousValue;

  if (Math.abs(diff) <= tolerance) {
    return 'stable';
  }

  if (higherIsBetter) {
    return diff > 0 ? 'improving' : 'deteriorating';
  } else {
    return diff < 0 ? 'improving' : 'deteriorating';
  }
}

// ── KPI Status Classification ────────────────────────────────────────────────────

/**
 * Classify KPI status based on value relative to target.
 *
 * @param value - Current KPI value
 * @param target - Target value
 * @param higherIsBetter - Whether higher values are better
 * @param atRiskThreshold - Percentage tolerance for "at_risk" (default 10%)
 */
export function classifyKPIStatus(
  value: number,
  target: number,
  higherIsBetter: boolean = true,
  atRiskThreshold: number = 10,
): 'on_target' | 'at_risk' | 'over' {
  if (higherIsBetter) {
    if (value >= target) return 'on_target';
    const deviation = ((target - value) / Math.abs(target || 1)) * 100;
    return deviation <= atRiskThreshold ? 'at_risk' : 'over';
  } else {
    if (value <= target) return 'on_target';
    const deviation = ((value - target) / Math.abs(target || 1)) * 100;
    return deviation <= atRiskThreshold ? 'at_risk' : 'over';
  }
}

// ── Integration with Analytics Reporting Engine ──────────────────────────────────

/**
 * Compute Command Centre KPIs and feed them into the Analytics Reporting Engine.
 *
 * This bridges the Command Centre's project-specific KPI data with the
 * platform-wide analytics reporting infrastructure.
 */
export function computeAndReportKPIs(
  projectId: string,
  ctx: BaseContext,
): ReturnType<typeof generateReport> {
  return generateReport([projectId], ctx);
}

/**
 * Retrieve project KPIs via the analytics reporting engine.
 *
 * Delegates to the platform analyticsReportingEngine for cross-project
 * KPI computation, using existing infrastructure.
 */
export function getProjectKPIsFromEngine(
  projectIds: string[],
  ctx: BaseContext,
): ReturnType<typeof computeProjectKpis> {
  return computeProjectKpis(projectIds, ctx);
}

// ── Aggregate KPI Dashboard Builder ──────────────────────────────────────────────

/**
 * Build the full set of Command Centre KPI stat cards from raw project data.
 *
 * Combines all KPI computations into a unified set of stat cards for
 * the Analytics view.
 */
export function buildCommandCentreKPIs(params: {
  milestones: CommandCentreMilestone[];
  forecast: number;
  contractSum: number;
  snags: Pick<QualitySnagItem, 'status'>[];
  rfis: Pick<RFIEntity, 'dateRaised' | 'responseDueDate' | 'status'>[];
  previousValues?: {
    scheduleVariance?: number;
    costVariance?: number;
    qualityScore?: number;
    rfiResponseTime?: number;
  };
}): CommandCentreKPI[] {
  const { milestones, forecast, contractSum, snags, rfis, previousValues } = params;

  const scheduleResult = computeScheduleVariance(milestones);
  const costResult = computeCostVariance(forecast, contractSum);
  const qualityResult = computeQualityScore(snags);
  const rfiResult = computeRFIResponseTime(rfis);

  const scheduleKPI: CommandCentreKPI = {
    name: 'schedule_variance',
    label: 'Schedule Variance',
    value: scheduleResult.variancePercent,
    unit: '%',
    trend: deriveTrend(
      scheduleResult.variancePercent,
      previousValues?.scheduleVariance ?? scheduleResult.variancePercent,
      true,
    ),
    status: classifyKPIStatus(scheduleResult.variancePercent, 0, true),
  };

  const costKPI: CommandCentreKPI = {
    name: 'cost_variance',
    label: 'Cost Variance',
    value: costResult.variancePercent,
    unit: '%',
    trend: deriveTrend(
      costResult.variancePercent,
      previousValues?.costVariance ?? costResult.variancePercent,
      false,
    ),
    status: classifyKPIStatus(costResult.variancePercent, 0, false),
  };

  const qualityKPI: CommandCentreKPI = {
    name: 'quality_score',
    label: 'Quality Score',
    value: qualityResult.scorePercent,
    unit: '%',
    target: 100,
    trend: deriveTrend(
      qualityResult.scorePercent,
      previousValues?.qualityScore ?? qualityResult.scorePercent,
      true,
    ),
    status: classifyKPIStatus(qualityResult.scorePercent, 90, true),
  };

  const rfiKPI: CommandCentreKPI = {
    name: 'rfi_response_time',
    label: 'RFI Response Time',
    value: rfiResult.averageDays,
    unit: 'days',
    trend: deriveTrend(
      rfiResult.averageDays,
      previousValues?.rfiResponseTime ?? rfiResult.averageDays,
      false,
    ),
    status: classifyKPIStatus(rfiResult.averageDays, 7, false),
  };

  return [scheduleKPI, costKPI, qualityKPI, rfiKPI];
}
