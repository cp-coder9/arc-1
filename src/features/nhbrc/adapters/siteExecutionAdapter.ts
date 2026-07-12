/**
 * NHBRC → Site Execution Adapter
 *
 * Exposes inspection hold points to the Site Execution module.
 * Maps unit inspection stages to programme view entries for
 * construction scheduling integration.
 *
 * Requirements: 15.2
 */

import type { PlatformIntegrationService } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { InspectionStage, InspectionOutcome } from '../types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface InspectionHoldPointPayload {
  projectId: string;
  unitId: string;
  stage: InspectionStage;
  inspectionDate?: string;
  outcome?: InspectionOutcome;
  isHoldActive: boolean;
}

export interface ProgrammeViewEntry {
  projectId: string;
  unitId: string;
  stage: InspectionStage;
  label: string;
  status: 'pending' | 'passed' | 'failed' | 'conditional';
  holdActive: boolean;
  inspectionDate?: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface NHBRCSiteExecutionAdapter {
  /** Write an inspection hold point to the Site Execution programme view. */
  writeInspectionHoldPoint(payload: InspectionHoldPointPayload): Promise<IntegrationWriteResult>;

  /** Map all unit inspection stages to programme view entries. */
  mapStagesToProgrammeEntries(
    projectId: string,
    unitId: string,
    stages: InspectionStageStatus[],
  ): ProgrammeViewEntry[];
}

export interface InspectionStageStatus {
  stage: InspectionStage;
  outcome?: InspectionOutcome;
  inspectionDate?: string;
  isHoldActive: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<InspectionStage, string> = {
  foundation: 'NHBRC Hold Point: Foundation Inspection',
  wall_plate: 'NHBRC Hold Point: Wall Plate Inspection',
  roof: 'NHBRC Hold Point: Roof Inspection',
  completion: 'NHBRC Hold Point: Completion Inspection',
};

const SOURCE_MODULE = 'nhbrc';

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an NHBRC Site Execution Adapter backed by the shared PlatformIntegrationService.
 */
export function createNHBRCSiteExecutionAdapter(
  platform: PlatformIntegrationService,
): NHBRCSiteExecutionAdapter {
  return {
    async writeInspectionHoldPoint(payload: InspectionHoldPointPayload): Promise<IntegrationWriteResult> {
      const status = resolveHoldPointStatus(payload.outcome, payload.isHoldActive);
      const label = STAGE_LABELS[payload.stage];

      const subject = payload.isHoldActive
        ? `${label} — Unit ${payload.unitId} (HOLD ACTIVE: construction may not proceed)`
        : `${label} — Unit ${payload.unitId} (${status})`;

      return platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'inspection_hold_point',
        subject,
        priority: payload.isHoldActive ? 'high' : 'normal',
        targetRole: 'site_manager',
      });
    },

    mapStagesToProgrammeEntries(
      projectId: string,
      unitId: string,
      stages: InspectionStageStatus[],
    ): ProgrammeViewEntry[] {
      return stages.map((stageStatus) => ({
        projectId,
        unitId,
        stage: stageStatus.stage,
        label: STAGE_LABELS[stageStatus.stage],
        status: resolveHoldPointStatus(stageStatus.outcome, stageStatus.isHoldActive),
        holdActive: stageStatus.isHoldActive,
        inspectionDate: stageStatus.inspectionDate,
      }));
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveHoldPointStatus(
  outcome: InspectionOutcome | undefined,
  isHoldActive: boolean,
): ProgrammeViewEntry['status'] {
  if (!outcome) return 'pending';
  if (isHoldActive) return 'failed';

  switch (outcome) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'conditionally_passed':
      return 'conditional';
    default:
      return 'pending';
  }
}
