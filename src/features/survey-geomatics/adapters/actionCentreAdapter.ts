/**
 * Action Centre Adapter — Survey & Geomatics
 *
 * Surfaces survey-related actions to the platform Action Centre / Inbox:
 * - Completion date reminders (14/7 days before)
 * - Overdue SG processing warnings
 * - Beacon damaged/missing notifications
 *
 * Requirements: 20.4, 20.5, 23.2
 */

import type { PlatformIntegrationService } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { BeaconCondition } from '../types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface CompletionReminderPayload {
  projectId: string;
  instructionId: string;
  instructionReference: string;
  requiredCompletionDate: string;
  daysRemaining: 14 | 7;
  appointedSurveyorName: string;
  targetUserId?: string;
}

export interface OverdueSGProcessingPayload {
  projectId: string;
  diagramId: string;
  diagramReference: string;
  lodgementDate: string;
  processingDays: number;
  expectedProcessingDays: number;
  lodgementOffice: string;
  targetUserId?: string;
}

export interface BeaconWarningPayload {
  projectId: string;
  beaconId: string;
  beaconIdentifier: string;
  condition: Extract<BeaconCondition, 'damaged' | 'missing'>;
  erfNumber?: string;
  targetUserId?: string;
  targetRole?: string;
}

export type SurveyActionCentrePayload =
  | { type: 'completion_reminder'; data: CompletionReminderPayload }
  | { type: 'overdue_sg_processing'; data: OverdueSGProcessingPayload }
  | { type: 'beacon_warning'; data: BeaconWarningPayload };

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface SurveyActionCentreAdapter {
  /** Notify about approaching survey instruction completion deadline. */
  notifyCompletionReminder(payload: CompletionReminderPayload): Promise<IntegrationWriteResult>;

  /** Warn about SG diagram processing exceeding expected timeframe. */
  warnOverdueSGProcessing(payload: OverdueSGProcessingPayload): Promise<IntegrationWriteResult>;

  /** Notify about damaged or missing beacons. */
  notifyBeaconWarning(payload: BeaconWarningPayload): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const SOURCE_MODULE = 'survey-geomatics';

/**
 * Creates a Survey & Geomatics → Action Centre adapter.
 *
 * Maps survey module events (completion reminders, overdue processing,
 * beacon warnings) to ActionCentreWritePayload and writes via
 * PlatformIntegrationService. On failure, the platform integration
 * service handles retry queue enqueuing automatically.
 */
export function createSurveyActionCentreAdapter(
  platform: PlatformIntegrationService,
): SurveyActionCentreAdapter {
  return {
    async notifyCompletionReminder(payload: CompletionReminderPayload): Promise<IntegrationWriteResult> {
      const subject = `Survey instruction ${payload.instructionReference} — completion due in ${payload.daysRemaining} days (${payload.requiredCompletionDate}), surveyor: ${payload.appointedSurveyorName}`;

      return platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'completion_reminder',
        subject: subject.slice(0, 200),
        deadline: payload.requiredCompletionDate,
        priority: payload.daysRemaining <= 7 ? 'high' : 'normal',
        targetUserId: payload.targetUserId,
        targetRole: 'architect',
      });
    },

    async warnOverdueSGProcessing(payload: OverdueSGProcessingPayload): Promise<IntegrationWriteResult> {
      const overdueBy = payload.processingDays - payload.expectedProcessingDays;
      const subject = `SG diagram ${payload.diagramReference} overdue — ${payload.processingDays} working days since lodgement (expected ${payload.expectedProcessingDays}), ${overdueBy} days over at ${payload.lodgementOffice}`;

      return platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'overdue_sg_processing',
        subject: subject.slice(0, 200),
        priority: 'high',
        targetUserId: payload.targetUserId,
        targetRole: 'land_surveyor',
      });
    },

    async notifyBeaconWarning(payload: BeaconWarningPayload): Promise<IntegrationWriteResult> {
      const erfPart = payload.erfNumber ? ` on erf ${payload.erfNumber}` : '';
      const subject = `Beacon ${payload.beaconIdentifier}${erfPart} — reported ${payload.condition}`;

      return platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'beacon_warning',
        subject: subject.slice(0, 200),
        priority: 'high',
        targetUserId: payload.targetUserId,
        targetRole: payload.targetRole ?? 'land_surveyor',
      });
    },
  };
}
