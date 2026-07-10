/**
 * Practice Management — Profitability Dashboard Service
 *
 * Pure business logic for project and firm-wide profitability analysis:
 * - Per-project profitability: gross margin, margin %, effective hourly rate, budget burn rate
 * - Firm-wide summary: total revenue/costs, overall margin, profitable/loss-making counts
 * - Top/bottom 5 projects by margin percentage
 * - Configurable underperformance threshold (default 20%)
 * - Internal cost rate per staff member (separate from client charge-out rate)
 *
 * Key formulas (Property 21):
 *   grossMargin = revenue (invoiced) − cost (hours × costRate + disbursements)
 *   grossMarginPercentage = (revenue − cost) / revenue × 100 (0 if revenue is 0)
 *   effectiveHourlyRate = revenue / hours (0 if hours is 0)
 *   budgetBurnRate = cost / fee × 100 (0 if fee is 0)
 *   Underperforming: marginPercentage < threshold (default 20%)
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7
 */

import type { ProfitabilityMetrics } from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Firm Profitability Types ─────────────────────────────────────────────────

export interface FirmProfitabilityMetrics {
  totalRevenue: number;
  totalCosts: number;
  overallMarginPercentage: number;
  profitableProjects: number;
  lossMakingProjects: number;
  averageEffectiveHourlyRate: number;
}

export interface ProjectMarginEntry {
  projectId: string;
  marginPercentage: number;
}

export interface FirmProfitabilitySummary {
  firmMetrics: FirmProfitabilityMetrics;
  top5: ProjectMarginEntry[];
  bottom5: ProjectMarginEntry[];
  underperforming: string[];
}

export interface ProjectProfitabilityInput {
  projectId: string;
  fee: number;
  invoiced: number;
  hours: number;
  costRate: number;
  disbursements: number;
}

export interface FirmProfitabilityConfig {
  underperformanceThreshold?: number; // default 20%
}

// ─── Calculate Project Profitability ──────────────────────────────────────────

/**
 * Calculate profitability metrics for a single project.
 *
 * @param fee - Total agreed project fee (ZAR)
 * @param invoiced - Revenue recognised / invoiced amount (ZAR)
 * @param hours - Total recorded hours on the project
 * @param costRate - Internal cost rate per hour (ZAR)
 * @param disbursements - Total disbursements incurred (ZAR)
 * @returns ProfitabilityMetrics with margin, effective rate, and burn rate
 */
export function calculateProjectProfitability(
  fee: number,
  invoiced: number,
  hours: number,
  costRate: number,
  disbursements: number
): ServiceResult<ProfitabilityMetrics> {
  // Validate inputs are numbers and non-negative
  if (typeof fee !== 'number' || typeof invoiced !== 'number' ||
      typeof hours !== 'number' || typeof costRate !== 'number' ||
      typeof disbursements !== 'number') {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'All inputs must be valid numbers.',
      },
    };
  }

  if (fee < 0 || invoiced < 0 || hours < 0 || costRate < 0 || disbursements < 0) {
    return {
      success: false,
      error: {
        code: 'NEGATIVE_VALUE',
        message: 'All inputs must be non-negative values.',
      },
    };
  }

  // Calculate total cost: (hours × costRate) + disbursements
  const totalCost = (hours * costRate) + disbursements;

  // Gross margin = revenue (invoiced) − cost
  const grossMargin = invoiced - totalCost;

  // Gross margin percentage = (revenue − cost) / revenue × 100 (0 if revenue is 0)
  const grossMarginPercentage = invoiced === 0
    ? 0
    : ((invoiced - totalCost) / invoiced) * 100;

  // Effective hourly rate = revenue / hours (0 if hours is 0)
  const effectiveHourlyRate = hours === 0
    ? 0
    : invoiced / hours;

  // Budget burn rate = cost / fee × 100 (0 if fee is 0)
  const budgetBurnRate = fee === 0
    ? 0
    : (totalCost / fee) * 100;

  const metrics: ProfitabilityMetrics = {
    totalFee: round2(fee),
    revenueRecognised: round2(invoiced),
    totalCost: round2(totalCost),
    grossMargin: round2(grossMargin),
    grossMarginPercentage: round2(grossMarginPercentage),
    effectiveHourlyRate: round2(effectiveHourlyRate),
    budgetBurnRate: round2(budgetBurnRate),
  };

  return { success: true, data: metrics };
}

// ─── Calculate Firm Profitability ─────────────────────────────────────────────

/**
 * Calculate firm-wide profitability summary across all projects.
 *
 * Computes:
 * - Aggregate revenue, costs, and overall margin percentage
 * - Count of profitable (margin > 0%) vs loss-making (margin < 0%) projects
 * - Average effective hourly rate across all projects
 * - Top 5 most profitable and bottom 5 least profitable projects by margin %
 * - List of underperforming projects (margin % below threshold)
 *
 * @param projects - Array of project profitability input data
 * @param config - Optional configuration (underperformance threshold)
 * @returns FirmProfitabilitySummary
 */
export function calculateFirmProfitability(
  projects: ProjectProfitabilityInput[],
  config?: FirmProfitabilityConfig
): ServiceResult<FirmProfitabilitySummary> {
  if (!Array.isArray(projects)) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Projects must be a valid array.',
      },
    };
  }

  const threshold = config?.underperformanceThreshold ?? 20;

  if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
    return {
      success: false,
      error: {
        code: 'INVALID_THRESHOLD',
        message: 'Underperformance threshold must be a number between 0 and 100.',
      },
    };
  }

  // Calculate per-project metrics
  let totalRevenue = 0;
  let totalCosts = 0;
  let totalHours = 0;
  let profitableProjects = 0;
  let lossMakingProjects = 0;
  const projectMargins: ProjectMarginEntry[] = [];
  const underperforming: string[] = [];

  for (const project of projects) {
    const result = calculateProjectProfitability(
      project.fee,
      project.invoiced,
      project.hours,
      project.costRate,
      project.disbursements
    );

    if (!result.success) {
      return {
        success: false,
        error: {
          code: 'PROJECT_CALC_FAILED',
          message: `Profitability calculation failed for project ${project.projectId}: ${(result as Extract<typeof result, { success: false }>).error.message}`,
          details: { projectId: project.projectId },
        },
      };
    }

    const metrics = result.data;
    totalRevenue += metrics.revenueRecognised;
    totalCosts += metrics.totalCost;
    totalHours += project.hours;

    if (metrics.grossMargin > 0) {
      profitableProjects++;
    } else if (metrics.grossMargin < 0) {
      lossMakingProjects++;
    }

    projectMargins.push({
      projectId: project.projectId,
      marginPercentage: metrics.grossMarginPercentage,
    });

    // Flag underperforming: margin % below threshold
    if (metrics.grossMarginPercentage < threshold) {
      underperforming.push(project.projectId);
    }
  }

  // Overall margin percentage (0 if no revenue)
  const overallMarginPercentage = totalRevenue === 0
    ? 0
    : ((totalRevenue - totalCosts) / totalRevenue) * 100;

  // Average effective hourly rate (0 if no hours)
  const averageEffectiveHourlyRate = totalHours === 0
    ? 0
    : totalRevenue / totalHours;

  // Sort by margin percentage for top/bottom 5
  const sortedByMargin = [...projectMargins].sort(
    (a, b) => b.marginPercentage - a.marginPercentage
  );

  const top5 = sortedByMargin.slice(0, 5);
  const bottom5 = sortedByMargin.slice(-5).reverse();

  const firmMetrics: FirmProfitabilityMetrics = {
    totalRevenue: round2(totalRevenue),
    totalCosts: round2(totalCosts),
    overallMarginPercentage: round2(overallMarginPercentage),
    profitableProjects,
    lossMakingProjects,
    averageEffectiveHourlyRate: round2(averageEffectiveHourlyRate),
  };

  return {
    success: true,
    data: {
      firmMetrics,
      top5,
      bottom5,
      underperforming,
    },
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Round to 2 decimal places to avoid floating point drift */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
