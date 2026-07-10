/**
 * Inspection Tracker Service
 *
 * Tracks NHBRC-mandated construction inspections through sequential stages
 * (foundation → wall_plate → roof → completion), enforces stage ordering,
 * records outcomes, and manages condition resolution.
 *
 * Stage sequence enforcement:
 *   A stage at index N requires all stages at index < N to have outcome
 *   'passed' (or waived). A failed stage blocks all subsequent stages
 *   until re-inspected and passed.
 *
 * Requirements: 12.1–12.10
 */

import type {
  InspectionRecord,
  InspectionStage,
  RecordInspectionInput,
  UnitInspectionStatus,
  UserRole,
  InspectionTrackerService,
} from '../types';
import { inspectionRecordSchema } from '../schemas';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Canonical stage execution order. */
export const STAGE_ORDER: InspectionStage[] = ['foundation', 'wall_plate', 'roof', 'completion'];

/** Roles permitted to waive a stage. */
const WAIVE_PERMITTED_ROLES: UserRole[] = ['architect', 'engineer', 'site_manager'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InspectionTrackerServiceOptions {
  /** Injectable clock for deterministic testing. Returns ISO date-time string. */
  now?: () => string;
}

/** Internal record of a stage waiver. */
interface StageWaiver {
  projectId: string;
  unitId: string;
  stage: InspectionStage;
  waivedBy: string;
  waivedByRole: UserRole;
  waivedAt: string;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class InspectionTrackerServiceImpl implements InspectionTrackerService {
  private inspections: Map<string, InspectionRecord> = new Map();
  private waivers: StageWaiver[] = [];
  private readonly now: () => string;

  constructor(options: InspectionTrackerServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async recordInspection(
    projectId: string,
    input: RecordInspectionInput,
    actorId: string,
  ): Promise<InspectionRecord> {
    // Validate input with Zod schema
    const parsed = inspectionRecordSchema.parse(input);

    // Enforce stage sequence
    const stageCheck = await this.canRecordStage(projectId, parsed.unitId, parsed.stage);
    if (!stageCheck.allowed) {
      throw new Error(
        `Cannot record stage '${parsed.stage}' for unit '${parsed.unitId}': ` +
        `blocked by preceding stage '${stageCheck.blockedBy}' which has not passed or been waived.`,
      );
    }

    const id = this.generateId();
    const timestamp = this.now();

    const record: InspectionRecord = {
      id,
      projectId,
      unitId: parsed.unitId,
      stage: parsed.stage,
      inspectionDate: parsed.inspectionDate,
      inspectorName: parsed.inspectorName,
      outcome: parsed.outcome,
      conditionsOrDefects: parsed.conditionsOrDefects,
      evidenceRefs: parsed.evidenceRefs,
      conditionDeadline: parsed.conditionDeadline,
      conditionsResolved: parsed.outcome === 'conditionally_passed' ? false : undefined,
      createdBy: actorId,
      createdAt: timestamp,
    };

    this.inspections.set(id, record);
    return { ...record };
  }

  async waiveStage(
    projectId: string,
    unitId: string,
    stage: InspectionStage,
    actorId: string,
    actorRole: UserRole,
  ): Promise<void> {
    // Enforce role restriction
    if (!WAIVE_PERMITTED_ROLES.includes(actorRole)) {
      throw new Error(
        `Role '${actorRole}' is not permitted to waive inspection stages. ` +
        `Only ${WAIVE_PERMITTED_ROLES.join(', ')} can waive stages.`,
      );
    }

    // Check the stage is valid
    if (!STAGE_ORDER.includes(stage)) {
      throw new Error(`Invalid inspection stage: '${stage}'`);
    }

    const timestamp = this.now();

    const waiver: StageWaiver = {
      projectId,
      unitId,
      stage,
      waivedBy: actorId,
      waivedByRole: actorRole,
      waivedAt: timestamp,
    };

    this.waivers.push(waiver);
  }

  async canRecordStage(
    projectId: string,
    unitId: string,
    stage: InspectionStage,
  ): Promise<{ allowed: boolean; blockedBy?: InspectionStage }> {
    const stageIndex = STAGE_ORDER.indexOf(stage);

    // Foundation (index 0) is always allowed
    if (stageIndex <= 0) {
      return { allowed: true };
    }

    // Check all preceding stages are passed or waived
    for (let i = 0; i < stageIndex; i++) {
      const precedingStage = STAGE_ORDER[i];
      const isPassed = this.isStagePassed(projectId, unitId, precedingStage);
      const isWaived = this.isStageWaived(projectId, unitId, precedingStage);

      if (!isPassed && !isWaived) {
        return { allowed: false, blockedBy: precedingStage };
      }
    }

    return { allowed: true };
  }

  async getUnitStatus(projectId: string, unitId: string): Promise<UnitInspectionStatus> {
    const stagesCompleted: InspectionStage[] = [];
    const failedStages: InspectionStage[] = [];
    let currentStage: InspectionStage | 'inspection_complete' = 'foundation';

    for (const stage of STAGE_ORDER) {
      if (this.isStagePassed(projectId, unitId, stage) || this.isStageWaived(projectId, unitId, stage)) {
        stagesCompleted.push(stage);
      } else {
        // This is the current stage (first non-completed)
        currentStage = stage;
        break;
      }
    }

    // If all 4 stages completed, mark as inspection_complete
    if (stagesCompleted.length === STAGE_ORDER.length) {
      currentStage = 'inspection_complete';
    }

    // Determine failed stages — stages with most recent outcome 'failed'
    for (const stage of STAGE_ORDER) {
      if (this.isStageFailed(projectId, unitId, stage)) {
        failedStages.push(stage);
      }
    }

    return {
      unitId,
      currentStage,
      stagesCompleted,
      hasFailed: failedStages.length > 0,
      failedStages,
    };
  }

  async getAllUnitsStatus(projectId: string): Promise<UnitInspectionStatus[]> {
    // Collect all unique unitIds for this project
    const unitIds = new Set<string>();

    for (const record of this.inspections.values()) {
      if (record.projectId === projectId) {
        unitIds.add(record.unitId);
      }
    }

    // Also include units that have waivers
    for (const waiver of this.waivers) {
      if (waiver.projectId === projectId) {
        unitIds.add(waiver.unitId);
      }
    }

    const results: UnitInspectionStatus[] = [];
    for (const unitId of unitIds) {
      results.push(await this.getUnitStatus(projectId, unitId));
    }

    return results;
  }

  async resolveConditions(
    projectId: string,
    inspectionId: string,
    actorId: string,
  ): Promise<InspectionRecord> {
    const record = this.inspections.get(inspectionId);

    if (!record) {
      throw new Error(`Inspection record not found: ${inspectionId}`);
    }

    if (record.projectId !== projectId) {
      throw new Error(`Inspection record '${inspectionId}' does not belong to project '${projectId}'`);
    }

    if (record.outcome !== 'conditionally_passed') {
      throw new Error(
        `Cannot resolve conditions on inspection '${inspectionId}': ` +
        `outcome is '${record.outcome}', must be 'conditionally_passed'.`,
      );
    }

    if (record.conditionsResolved === true) {
      throw new Error(`Conditions already resolved for inspection '${inspectionId}'`);
    }

    const updated: InspectionRecord = {
      ...record,
      conditionsResolved: true,
    };

    this.inspections.set(inspectionId, updated);
    return { ...updated };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Returns true if the most recent inspection for this unit+stage has outcome 'passed'
   * or 'conditionally_passed' (with conditions resolved).
   */
  private isStagePassed(projectId: string, unitId: string, stage: InspectionStage): boolean {
    const records = this.getStageRecords(projectId, unitId, stage);
    if (records.length === 0) return false;

    // Get the most recent record (latest createdAt)
    const latest = records[records.length - 1];

    if (latest.outcome === 'passed') return true;
    if (latest.outcome === 'conditionally_passed' && latest.conditionsResolved === true) return true;

    return false;
  }

  /** Returns true if this unit+stage has an active waiver. */
  private isStageWaived(projectId: string, unitId: string, stage: InspectionStage): boolean {
    return this.waivers.some(
      (w) => w.projectId === projectId && w.unitId === unitId && w.stage === stage,
    );
  }

  /**
   * Returns true if the most recent inspection for this unit+stage has outcome 'failed'.
   * Does NOT count as failed if there's a waiver or a subsequent passed record.
   */
  private isStageFailed(projectId: string, unitId: string, stage: InspectionStage): boolean {
    if (this.isStageWaived(projectId, unitId, stage)) return false;

    const records = this.getStageRecords(projectId, unitId, stage);
    if (records.length === 0) return false;

    const latest = records[records.length - 1];
    return latest.outcome === 'failed';
  }

  /** Get all inspection records for a specific project+unit+stage, ordered by createdAt. */
  private getStageRecords(projectId: string, unitId: string, stage: InspectionStage): InspectionRecord[] {
    const results: InspectionRecord[] = [];
    for (const record of this.inspections.values()) {
      if (record.projectId === projectId && record.unitId === unitId && record.stage === stage) {
        results.push(record);
      }
    }
    // Sort by createdAt ascending to get latest at end
    results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return results;
  }

  private generateId(): string {
    return `insp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new InspectionTrackerService instance.
 * Uses in-memory Map storage. Injectable clock for deterministic tests.
 */
export function createInspectionTrackerService(
  options: InspectionTrackerServiceOptions = {},
): InspectionTrackerService {
  return new InspectionTrackerServiceImpl(options);
}
