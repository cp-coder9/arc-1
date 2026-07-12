/**
 * NHBRC → Project Passport Adapter
 *
 * Writes NHBRC enrolment status, total units enrolled, inspection progress
 * (units per stage), and warranty claims count to the Project Passport.
 *
 * Requirements: 15.1
 */

import type { PlatformIntegrationService } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type {
  EnrolmentStatus,
  InspectionStage,
} from '../types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface NHBRCPassportPayload {
  projectId: string;
  enrolmentStatus: EnrolmentStatus;
  totalUnitsEnrolled: number;
  inspectionProgress: Record<InspectionStage, number>;
  warrantyClaimsCount: number;
  lastUpdated: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface NHBRCPassportAdapter {
  /** Write NHBRC enrolment and inspection summary to the Project Passport. */
  writeEnrolmentStatus(payload: NHBRCPassportPayload): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const MODULE_ID = 'nhbrc';

/**
 * Creates an NHBRC Passport Adapter backed by the shared PlatformIntegrationService.
 */
export function createNHBRCPassportAdapter(
  platform: PlatformIntegrationService,
): NHBRCPassportAdapter {
  return {
    async writeEnrolmentStatus(payload: NHBRCPassportPayload): Promise<IntegrationWriteResult> {
      const { inspectionProgress, warrantyClaimsCount } = payload;

      const inspectionSummary = Object.entries(inspectionProgress)
        .map(([stage, count]) => `${stage}: ${count}`)
        .join(', ');

      const statusLabel = [
        `Enrolment: ${payload.enrolmentStatus}`,
        `Units: ${payload.totalUnitsEnrolled}`,
        `Inspections [${inspectionSummary}]`,
        `Warranty claims: ${warrantyClaimsCount}`,
      ].join(' | ');

      return platform.writeToPassport({
        projectId: payload.projectId,
        moduleId: MODULE_ID,
        statusLabel,
        activeRecords: payload.totalUnitsEnrolled,
        overdueItems: warrantyClaimsCount,
        lastUpdated: payload.lastUpdated,
      });
    },
  };
}
