/**
 * Project Passport Adapter — Survey & Geomatics
 *
 * Writes survey status to Project Passport health card:
 * - Active survey instructions count
 * - Diagrams awaiting SG approval count
 * - Diagrams approved count
 *
 * Requirements: 20.4, 23.1
 */

import type { PlatformIntegrationService, PassportWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface SurveyPassportPayload {
  projectId: string;
  activeSurveyInstructions: number;
  diagramsAwaitingApproval: number;
  diagramsApproved: number;
  lastUpdated: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface SurveyPassportAdapter {
  /** Write survey & geomatics health card summary to Project Passport. */
  writeSurveyStatus(payload: SurveyPassportPayload): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const MODULE_ID = 'survey-geomatics';

/**
 * Creates a Survey & Geomatics → Project Passport adapter.
 *
 * Maps survey module state (active instructions, diagram counts) to
 * PassportWritePayload and writes via PlatformIntegrationService.
 * On failure, the platform integration service handles retry queue
 * enqueuing automatically (exponential backoff, 3 retries).
 */
export function createSurveyPassportAdapter(
  platform: PlatformIntegrationService,
): SurveyPassportAdapter {
  return {
    async writeSurveyStatus(payload: SurveyPassportPayload): Promise<IntegrationWriteResult> {
      const {
        projectId,
        activeSurveyInstructions,
        diagramsAwaitingApproval,
        diagramsApproved,
        lastUpdated,
      } = payload;

      const statusLabel = [
        `Active instructions: ${activeSurveyInstructions}`,
        `Awaiting SG approval: ${diagramsAwaitingApproval}`,
        `Diagrams approved: ${diagramsApproved}`,
      ].join(' | ');

      const passportPayload: PassportWritePayload = {
        projectId,
        moduleId: MODULE_ID,
        statusLabel,
        activeRecords: activeSurveyInstructions,
        overdueItems: diagramsAwaitingApproval,
        lastUpdated,
      };

      return platform.writeToPassport(passportPayload);
    },
  };
}
