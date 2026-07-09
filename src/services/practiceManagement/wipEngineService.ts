/**
 * WIP Engine Service
 *
 * Pure business logic for Work in Progress calculations. Provides:
 * - Per-project WIP calculation
 * - Per-stage WIP calculation
 * - Firm-wide WIP report aggregation
 * - Loss indicator flagging
 *
 * WIP Formula: agreed_fee − costs_incurred − amount_invoiced
 * Loss Indicator: true when costs >= fee
 *
 * This service operates on typed data objects (dependency injection pattern)
 * with no Firestore dependencies. Recalculation is triggered externally
 * on timesheet approval, expense approval, and invoice issuance.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 * @module practiceManagement/wipEngineService
 */

import type {
  SacapWorkStage,
  WipPosition,
  WipReport,
  ProjectFeeStructure,
  FeeStageAllocation,
} from './types';

// ─── Input Types ─────────────────────────────────────────────────────────────

/**
 * Cost data for a project, aggregated from approved timesheets and expenses.
 */
export interface ProjectCostData {
  projectId: string;
  /** Total time costs from approved timesheets (cents) */
  timeCostsCents: number;
  /** Total disbursement costs from approved expenses (cents) */
  disbursementsCents: number;
  /** Total amount invoiced for this project (cents) */
  amountInvoicedCents: number;
  /** Total amount collected/paid for this project (cents) */
  amountCollectedCents: number;
  /** Per-stage cost breakdown (optional, for stage-level WIP) */
  stageCosts?: WipStageCostData[];
}

/**
 * Cost data for a specific SACAP work stage within a project (WIP context).
 * Extends the basic stage cost data with invoiced/collected amounts for WIP calculation.
 */
export interface WipStageCostData {
  stage: SacapWorkStage;
  timeCostsCents: number;
  disbursementsCents: number;
  amountInvoicedCents: number;
  amountCollectedCents: number;
}

// ─── Core Calculations ───────────────────────────────────────────────────────

/**
 * Calculates the WIP position for a single project.
 *
 * Validates: Requirements 5.1, 5.3
 * THE WIP_Engine SHALL calculate WIP as: agreed fee minus total costs incurred
 * (time + disbursements) minus amounts invoiced, per project.
 * WHEN the WIP balance for a project is negative (costs equal or exceed fee),
 * THE WIP_Engine SHALL flag the project with a loss indicator.
 *
 * @param feeStructure - The project's fee structure defining the agreed fee
 * @param costData - Aggregated cost data from approved timesheets, expenses, and invoices
 * @returns WipPosition for the project
 */
export function calculateProjectWip(
  feeStructure: ProjectFeeStructure,
  costData: ProjectCostData,
): WipPosition {
  const agreedFeeCents = feeStructure.totalAgreedFeeCents;
  const costsIncurredCents = costData.timeCostsCents + costData.disbursementsCents;
  const wipBalanceCents = agreedFeeCents - costsIncurredCents - costData.amountInvoicedCents;
  const isLoss = costsIncurredCents >= agreedFeeCents;

  return {
    projectId: feeStructure.projectId,
    agreedFeeCents,
    costsIncurredCents,
    amountInvoicedCents: costData.amountInvoicedCents,
    amountCollectedCents: costData.amountCollectedCents,
    wipBalanceCents,
    isLoss,
  };
}

/**
 * Calculates the WIP position for a specific SACAP work stage within a project.
 *
 * Validates: Requirement 5.1
 * THE WIP_Engine SHALL calculate WIP per SACAP_Work_Stage.
 *
 * @param feeStructure - The project's fee structure defining the agreed fee and stage breakdown
 * @param stage - The SACAP work stage to calculate WIP for
 * @param stageCosts - Cost data for the specific stage
 * @returns WipPosition for the stage, or null if the stage is not found in the fee structure
 */
export function calculateStageWip(
  feeStructure: ProjectFeeStructure,
  stage: SacapWorkStage,
  stageCosts: WipStageCostData,
): WipPosition | null {
  const stageAllocation = findStageAllocation(feeStructure, stage);
  if (!stageAllocation) return null;

  const agreedFeeCents = stageAllocation.allocatedFeeCents;
  const costsIncurredCents = stageCosts.timeCostsCents + stageCosts.disbursementsCents;
  const wipBalanceCents = agreedFeeCents - costsIncurredCents - stageCosts.amountInvoicedCents;
  const isLoss = costsIncurredCents >= agreedFeeCents;

  return {
    projectId: feeStructure.projectId,
    stage,
    agreedFeeCents,
    costsIncurredCents,
    amountInvoicedCents: stageCosts.amountInvoicedCents,
    amountCollectedCents: stageCosts.amountCollectedCents,
    wipBalanceCents,
    isLoss,
  };
}

/**
 * Generates a firm-wide WIP report aggregating across all active projects.
 *
 * Validates: Requirements 5.2, 5.4
 * THE WIP_Engine SHALL display a WIP report with columns: project name, agreed fee,
 * costs incurred, amount invoiced, amount collected, WIP balance, and profit/loss indicator.
 * THE WIP_Engine SHALL provide firm-wide WIP totals aggregating across all active projects.
 *
 * @param firmId - The firm ID for the report
 * @param feeStructures - Fee structures for all active projects
 * @param costDataByProject - Cost data keyed by project ID
 * @returns WipReport with individual project positions and firm-wide totals
 */
export function getFirmWipReport(
  firmId: string,
  feeStructures: ProjectFeeStructure[],
  costDataByProject: Map<string, ProjectCostData>,
): WipReport {
  const projects: WipPosition[] = [];

  for (const feeStructure of feeStructures) {
    const costData = costDataByProject.get(feeStructure.projectId);

    // If no cost data exists, treat all costs as zero
    const effectiveCostData: ProjectCostData = costData ?? {
      projectId: feeStructure.projectId,
      timeCostsCents: 0,
      disbursementsCents: 0,
      amountInvoicedCents: 0,
      amountCollectedCents: 0,
    };

    const position = calculateProjectWip(feeStructure, effectiveCostData);
    projects.push(position);
  }

  // Aggregate firm-wide totals
  const totalAgreedFeeCents = projects.reduce((sum, p) => sum + p.agreedFeeCents, 0);
  const totalCostsIncurredCents = projects.reduce((sum, p) => sum + p.costsIncurredCents, 0);
  const totalInvoicedCents = projects.reduce((sum, p) => sum + p.amountInvoicedCents, 0);
  const totalCollectedCents = projects.reduce((sum, p) => sum + p.amountCollectedCents, 0);
  const totalWipBalanceCents = projects.reduce((sum, p) => sum + p.wipBalanceCents, 0);

  return {
    firmId,
    projects,
    totalAgreedFeeCents,
    totalCostsIncurredCents,
    totalInvoicedCents,
    totalCollectedCents,
    totalWipBalanceCents,
    calculatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Finds the fee allocation for a specific stage within a project's fee structure.
 */
function findStageAllocation(
  feeStructure: ProjectFeeStructure,
  stage: SacapWorkStage,
): FeeStageAllocation | undefined {
  return feeStructure.stageBreakdown.find((s) => s.stage === stage);
}
