/**
 * Write-Off Tracker Service
 *
 * Pure business logic for write-off recording and cumulative tracking. Supports:
 * - Write-off creation with amount, reason, authorising user, and date
 * - Reversal entries to reduce cumulative totals for any business reason
 * - Cumulative total per project (monotonically non-decreasing without explicit reversal)
 * - Cumulative write-offs as percentage of agreed fee
 * - Warning generation when write-offs exceed 10% of agreed fee
 * - Write-off totals feed into Profitability Calculator and WIP Engine
 *
 * This service operates on arrays of typed objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 * @module practiceManagement/writeOffTrackerService
 */

import type {
  WriteOffEntry,
  WriteOffSummary,
  WriteOffWarning,
  FirmWriteOffReport,
  CreateWriteOffInput,
  ProjectFeeStructure,
  SacapWorkStage,
} from './types';

// ─── Write-Off Warning Threshold ────────────────────────────────────────────

const WRITE_OFF_WARNING_THRESHOLD_PERCENT = 10;

// ─── createWriteOff ─────────────────────────────────────────────────────────

/**
 * Creates a new write-off entry for a project.
 *
 * Validates: Requirement 10.1
 * WHEN time is written off for a project, THE Write_Off_Tracker SHALL record
 * the write-off amount, reason (scope creep, rework, goodwill, fee negotiation, other),
 * authorising user, and date.
 *
 * @param input - The write-off creation input
 * @returns The newly created WriteOffEntry
 */
export function createWriteOff(input: CreateWriteOffInput): WriteOffEntry {
  const now = new Date().toISOString();
  const id = generateWriteOffId(input.firmId, input.projectId);

  return {
    id,
    firmId: input.firmId,
    projectId: input.projectId,
    sacapStage: input.sacapStage,
    amountCents: input.amountCents,
    reason: input.reason,
    description: input.description,
    isReversal: false,
    authorisedBy: input.authorisedBy,
    date: input.date,
    createdAt: now,
  };
}

// ─── createReversal ─────────────────────────────────────────────────────────

/**
 * Creates a reversal entry for an existing write-off.
 *
 * Validates: Requirement 10.2
 * THE Write_Off_Tracker SHALL maintain a cumulative write-off total per project
 * that only increases or remains equal — write-offs SHALL NOT decrease without
 * an explicit reversal entry; reversals MAY be created for any business reason.
 *
 * @param entries - All existing write-off entries (used to find the original)
 * @param writeOffId - The ID of the original write-off to reverse
 * @param reason - The business reason for the reversal
 * @param userId - The user authorising the reversal
 * @returns The newly created reversal WriteOffEntry, or null if original not found
 */
export function createReversal(
  entries: WriteOffEntry[],
  writeOffId: string,
  reason: string,
  userId: string,
): WriteOffEntry | null {
  const original = entries.find((e) => e.id === writeOffId);
  if (!original) return null;

  // Cannot reverse a reversal
  if (original.isReversal) return null;

  const now = new Date().toISOString();
  const id = generateWriteOffId(original.firmId, original.projectId);

  return {
    id,
    firmId: original.firmId,
    projectId: original.projectId,
    sacapStage: original.sacapStage,
    amountCents: original.amountCents,
    reason: original.reason,
    description: reason,
    isReversal: true,
    reversalOfId: writeOffId,
    authorisedBy: userId,
    date: new Date().toISOString().split('T')[0],
    createdAt: now,
  };
}

// ─── getProjectWriteOffs ────────────────────────────────────────────────────

/**
 * Gets a summary of all write-offs for a project, including cumulative totals
 * and percentage of agreed fee.
 *
 * Validates: Requirement 10.2
 * THE Write_Off_Tracker SHALL maintain a cumulative write-off total per project
 * that only increases or remains equal without explicit reversal.
 *
 * Validates: Requirement 10.3
 * THE Write_Off_Tracker SHALL display cumulative write-offs against agreed fee
 * as a percentage, per project and per SACAP_Work_Stage.
 *
 * Validates: Requirement 10.4
 * WHEN cumulative write-offs for a project exceed 10% of the agreed fee,
 * THE Write_Off_Tracker SHALL generate a warning notification to firm directors.
 *
 * @param entries - All write-off entries
 * @param feeStructures - All project fee structures (for agreed fee lookup)
 * @param projectId - The project ID to get write-offs for
 * @returns WriteOffSummary with cumulative totals, percentage, stage breakdown, and warnings
 */
export function getProjectWriteOffs(
  entries: WriteOffEntry[],
  feeStructures: ProjectFeeStructure[],
  projectId: string,
): WriteOffSummary {
  const projectEntries = entries
    .filter((e) => e.projectId === projectId)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate cumulative total: write-offs add, reversals subtract
  const cumulativeWriteOffCents = calculateCumulativeWriteOff(projectEntries);

  // Look up agreed fee from fee structure
  const feeStructure = feeStructures.find((f) => f.projectId === projectId);
  const agreedFeeCents = feeStructure?.totalAgreedFeeCents ?? 0;

  // Calculate percentage of agreed fee
  const writeOffPercentage = agreedFeeCents > 0
    ? (cumulativeWriteOffCents / agreedFeeCents) * 100
    : 0;

  // Calculate per-stage breakdown
  const byStage = calculateStageBreakdown(projectEntries);

  // Generate warnings
  const warnings = generateWarnings(projectId, writeOffPercentage);

  return {
    projectId,
    cumulativeWriteOffCents,
    agreedFeeCents,
    writeOffPercentage,
    byStage,
    entries: projectEntries,
    warnings,
  };
}

// ─── getFirmWriteOffs ───────────────────────────────────────────────────────

/**
 * Gets firm-wide write-off report aggregating across all projects.
 *
 * Validates: Requirement 10.5
 * THE Write_Off_Tracker SHALL feed write-off totals into the Profitability_Calculator
 * and WIP_Engine calculations.
 *
 * @param entries - All write-off entries
 * @param feeStructures - All project fee structures
 * @param firmId - The firm ID to scope the report
 * @returns FirmWriteOffReport with totals and per-project summaries
 */
export function getFirmWriteOffs(
  entries: WriteOffEntry[],
  feeStructures: ProjectFeeStructure[],
  firmId: string,
): FirmWriteOffReport {
  const firmEntries = entries.filter((e) => e.firmId === firmId);
  const firmFeeStructures = feeStructures.filter((f) => f.firmId === firmId);

  // Group entries by project
  const projectIds = [...new Set(firmEntries.map((e) => e.projectId))];

  const projects: WriteOffSummary[] = projectIds.map((projectId) =>
    getProjectWriteOffs(firmEntries, firmFeeStructures, projectId),
  );

  const totalWriteOffCents = projects.reduce(
    (sum, p) => sum + p.cumulativeWriteOffCents,
    0,
  );

  const totalAgreedFeeCents = projects.reduce(
    (sum, p) => sum + p.agreedFeeCents,
    0,
  );

  const firmWriteOffPercentage = totalAgreedFeeCents > 0
    ? (totalWriteOffCents / totalAgreedFeeCents) * 100
    : 0;

  return {
    firmId,
    projects,
    totalWriteOffCents,
    totalAgreedFeeCents,
    firmWriteOffPercentage,
    calculatedAt: new Date().toISOString(),
  };
}

// ─── getWriteOffTotalForProject ─────────────────────────────────────────────

/**
 * Gets the cumulative write-off total for a project (for use by Profitability
 * Calculator and WIP Engine).
 *
 * Validates: Requirement 10.5
 * THE Write_Off_Tracker SHALL feed write-off totals into the Profitability_Calculator
 * and WIP_Engine calculations.
 *
 * @param entries - All write-off entries
 * @param projectId - The project to get the total for
 * @returns The cumulative write-off in cents
 */
export function getWriteOffTotalForProject(
  entries: WriteOffEntry[],
  projectId: string,
): number {
  const projectEntries = entries.filter((e) => e.projectId === projectId);
  return calculateCumulativeWriteOff(projectEntries);
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Calculates cumulative write-off total from entries.
 * Write-offs add to the total, reversals subtract.
 * The result is clamped to a minimum of 0 (cumulative cannot go negative).
 */
function calculateCumulativeWriteOff(entries: WriteOffEntry[]): number {
  let total = 0;

  for (const entry of entries) {
    if (entry.isReversal) {
      total -= entry.amountCents;
    } else {
      total += entry.amountCents;
    }
  }

  // Cumulative write-off cannot be negative
  return Math.max(0, total);
}

/**
 * Calculates write-off breakdown per SACAP work stage.
 * Returns a partial record with only the stages that have write-offs.
 */
function calculateStageBreakdown(
  entries: WriteOffEntry[],
): Partial<Record<SacapWorkStage, number>> {
  const byStage: Partial<Record<SacapWorkStage, number>> = {};

  for (const entry of entries) {
    if (!entry.sacapStage) continue;

    const current = byStage[entry.sacapStage] ?? 0;
    if (entry.isReversal) {
      byStage[entry.sacapStage] = Math.max(0, current - entry.amountCents);
    } else {
      byStage[entry.sacapStage] = current + entry.amountCents;
    }
  }

  return byStage;
}

/**
 * Generates warning messages when write-off percentage exceeds threshold.
 *
 * Validates: Requirement 10.4
 * WHEN cumulative write-offs for a project exceed 10% of the agreed fee,
 * THE Write_Off_Tracker SHALL generate a warning notification to firm directors.
 */
function generateWarnings(
  projectId: string,
  writeOffPercentage: number,
): WriteOffWarning[] {
  const warnings: WriteOffWarning[] = [];

  if (writeOffPercentage > WRITE_OFF_WARNING_THRESHOLD_PERCENT) {
    warnings.push({
      projectId,
      message: `Write-offs exceed ${WRITE_OFF_WARNING_THRESHOLD_PERCENT}% of agreed fee (currently ${writeOffPercentage.toFixed(1)}%)`,
      writeOffPercentage,
      thresholdPercent: WRITE_OFF_WARNING_THRESHOLD_PERCENT,
    });
  }

  return warnings;
}

/**
 * Generates a unique write-off ID.
 */
function generateWriteOffId(firmId: string, projectId: string): string {
  return `wo_${firmId}_${projectId}_${Date.now()}`;
}
