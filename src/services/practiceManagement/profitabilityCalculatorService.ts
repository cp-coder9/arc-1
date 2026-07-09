/**
 * Profitability Calculator Service
 *
 * Pure business logic for project profitability analysis. Supports:
 * - Project margin calculation: (fee_earned − time_cost − disbursements − write_offs) / fee_earned × 100
 * - Status classification: profitable (≥20%), at_risk (0–20%), loss_making (<0%)
 * - Per-stage profitability within a project
 * - Firm-wide profitability reporting with averages
 * - Notification triggers for margin thresholds
 *
 * This service operates on typed data objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 * @module practiceManagement/profitabilityCalculatorService
 */

import type {
  ProfitabilityResult,
  FirmProfitabilityReport,
  SacapWorkStage,
} from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Input data for calculating a single project's (or stage's) profitability. */
export interface ProfitabilityInput {
  projectId: string;
  stage?: SacapWorkStage;
  feeEarnedCents: number;
  timeCostCents: number;
  disbursementsCents: number;
  writeOffsCents: number;
}

/** Notification triggered when a margin threshold is breached. */
export interface ProfitabilityNotification {
  projectId: string;
  stage?: SacapWorkStage;
  type: 'at_risk' | 'loss_making';
  marginPercent: number;
  /** 'project_lead' for at_risk, 'directors' for loss_making */
  notifyRole: 'project_lead' | 'directors';
  message: string;
}

// ─── Margin Calculation ──────────────────────────────────────────────────────

/**
 * Classifies a margin percentage into a status bucket.
 *
 * - profitable: margin ≥ 20%
 * - at_risk: 0% ≤ margin < 20%
 * - loss_making: margin < 0%
 *
 * Validates: Requirements 6.3, 6.4
 */
export function classifyMarginStatus(
  marginPercent: number,
): 'profitable' | 'at_risk' | 'loss_making' {
  if (marginPercent < 0) return 'loss_making';
  if (marginPercent < 20) return 'at_risk';
  return 'profitable';
}

/**
 * Computes margin percentage from fee and total costs.
 *
 * Formula: (feeEarned − timeCost − disbursements − writeOffs) / feeEarned × 100
 *
 * If feeEarned is zero, returns -100 to indicate loss (cannot divide by zero).
 *
 * Validates: Requirement 6.1
 */
export function computeMarginPercent(
  feeEarnedCents: number,
  timeCostCents: number,
  disbursementsCents: number,
  writeOffsCents: number,
): number {
  if (feeEarnedCents === 0) {
    // If no fee earned but costs exist, it's a complete loss
    const totalCosts = timeCostCents + disbursementsCents + writeOffsCents;
    if (totalCosts > 0) return -100;
    // No fee and no costs — return 0 (undefined margin, but not a loss)
    return 0;
  }

  const netProfit = feeEarnedCents - timeCostCents - disbursementsCents - writeOffsCents;
  return (netProfit / feeEarnedCents) * 100;
}

// ─── Project Margin ──────────────────────────────────────────────────────────

/**
 * Calculates project-level profitability margin and status.
 *
 * Validates: Requirements 6.1, 6.2
 * THE Profitability_Calculator SHALL compute project margin as:
 * (fee earned − staff time cost − disbursements − write-offs) / fee earned × 100
 *
 * @param input - Project profitability data
 * @returns ProfitabilityResult with margin and status classification
 */
export function calculateProjectMargin(input: ProfitabilityInput): ProfitabilityResult {
  const { projectId, feeEarnedCents, timeCostCents, disbursementsCents, writeOffsCents } = input;

  const netProfitCents = feeEarnedCents - timeCostCents - disbursementsCents - writeOffsCents;
  const marginPercent = computeMarginPercent(
    feeEarnedCents,
    timeCostCents,
    disbursementsCents,
    writeOffsCents,
  );
  const status = classifyMarginStatus(marginPercent);

  return {
    projectId,
    feeEarnedCents,
    timeCostCents,
    disbursementsCents,
    writeOffsCents,
    netProfitCents,
    marginPercent,
    status,
  };
}

// ─── Stage Margin ────────────────────────────────────────────────────────────

/**
 * Calculates per-stage profitability margin within a project.
 *
 * Validates: Requirement 6.5
 * THE Profitability_Calculator SHALL support viewing profitability by SACAP_Work_Stage
 * within a project to identify which stages are profitable and which are eroding margin.
 *
 * @param input - Stage-level profitability data (must include stage field)
 * @returns ProfitabilityResult with stage and margin/status classification
 */
export function calculateStageMargin(input: ProfitabilityInput): ProfitabilityResult {
  const {
    projectId,
    stage,
    feeEarnedCents,
    timeCostCents,
    disbursementsCents,
    writeOffsCents,
  } = input;

  const netProfitCents = feeEarnedCents - timeCostCents - disbursementsCents - writeOffsCents;
  const marginPercent = computeMarginPercent(
    feeEarnedCents,
    timeCostCents,
    disbursementsCents,
    writeOffsCents,
  );
  const status = classifyMarginStatus(marginPercent);

  return {
    projectId,
    stage,
    feeEarnedCents,
    timeCostCents,
    disbursementsCents,
    writeOffsCents,
    netProfitCents,
    marginPercent,
    status,
  };
}

// ─── Firm-Wide Profitability ─────────────────────────────────────────────────

/**
 * Calculates firm-wide profitability across all projects.
 *
 * Validates: Requirements 6.1, 6.2
 * Aggregates margin, revenue, costs, and profit across an array of project inputs.
 * Average margin is computed from firm-wide totals (weighted by revenue), not a
 * simple arithmetic mean of individual project margins.
 *
 * @param firmId - The firm identifier
 * @param projectInputs - Array of profitability input data for each project
 * @returns FirmProfitabilityReport with project results and firm totals
 */
export function getFirmProfitability(
  firmId: string,
  projectInputs: ProfitabilityInput[],
): FirmProfitabilityReport {
  const projects: ProfitabilityResult[] = projectInputs.map((input) =>
    calculateProjectMargin(input),
  );

  const totalRevenueCents = projects.reduce((sum, p) => sum + p.feeEarnedCents, 0);
  const totalCostsCents = projects.reduce(
    (sum, p) => sum + p.timeCostCents + p.disbursementsCents + p.writeOffsCents,
    0,
  );
  const totalProfitCents = totalRevenueCents - totalCostsCents;

  // Weighted average margin based on total revenue
  const averageMarginPercent =
    totalRevenueCents === 0 ? 0 : (totalProfitCents / totalRevenueCents) * 100;

  return {
    firmId,
    projects,
    averageMarginPercent,
    totalRevenueCents,
    totalCostsCents,
    totalProfitCents,
  };
}

// ─── Notifications ───────────────────────────────────────────────────────────

/**
 * Generates profitability notifications when margin thresholds are breached.
 *
 * Validates: Requirement 6.3
 * WHEN project margin drops below 20%, THE Profitability_Calculator SHALL flag the
 * project as at-risk and notify the project lead.
 *
 * Validates: Requirement 6.4
 * WHEN project margin drops below 0%, THE Profitability_Calculator SHALL flag the
 * project as loss-making and notify firm directors.
 *
 * @param result - A computed ProfitabilityResult
 * @returns Array of notifications (empty if margin is healthy)
 */
export function generateProfitabilityNotifications(
  result: ProfitabilityResult,
): ProfitabilityNotification[] {
  const notifications: ProfitabilityNotification[] = [];
  const stageLabel = result.stage ? ` (${result.stage})` : '';

  if (result.status === 'loss_making') {
    // Notify directors for loss-making projects
    notifications.push({
      projectId: result.projectId,
      stage: result.stage,
      type: 'loss_making',
      marginPercent: result.marginPercent,
      notifyRole: 'directors',
      message: `Project ${result.projectId}${stageLabel} is loss-making with margin ${result.marginPercent.toFixed(1)}%`,
    });
  }

  if (result.status === 'at_risk' || result.status === 'loss_making') {
    // Notify project lead for at-risk and loss-making projects
    notifications.push({
      projectId: result.projectId,
      stage: result.stage,
      type: 'at_risk',
      marginPercent: result.marginPercent,
      notifyRole: 'project_lead',
      message: `Project ${result.projectId}${stageLabel} margin is below 20% at ${result.marginPercent.toFixed(1)}%`,
    });
  }

  return notifications;
}
