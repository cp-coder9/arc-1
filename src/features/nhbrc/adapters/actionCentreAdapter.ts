/**
 * NHBRC → Action Centre Adapter
 *
 * Surfaces inspection failure notifications, condition deadline warnings,
 * warranty inspection schedules, and rectification overdue alerts
 * to the Action Centre / Inbox.
 *
 * Requirements: 15.2, 15.8
 */

import type { PlatformIntegrationService } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { InspectionStage, WarrantyClaimStage } from '../types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface InspectionFailurePayload {
  projectId: string;
  unitId: string;
  stage: InspectionStage;
  rectificationRequirement: string;
  targetSiteManagerId?: string;
  targetBuilderId?: string;
}

export interface ConditionDeadlinePayload {
  projectId: string;
  unitId: string;
  stage: InspectionStage;
  inspectionId: string;
  deadline: string;
  daysRemaining: number;
  targetUserId?: string;
}

export interface WarrantyInspectionSchedulePayload {
  projectId: string;
  unitId: string;
  claimId: string;
  claimantName: string;
  claimStage: WarrantyClaimStage;
  scheduledDate?: string;
  targetUserId?: string;
}

export interface RectificationOverduePayload {
  projectId: string;
  unitId: string;
  claimId: string;
  rectificationDeadline: string;
  daysOverdue: number;
  responsibleParty?: string;
  targetUserId?: string;
}

export interface EnrolmentMilestonePayload {
  projectId: string;
  eventType: string;
  unitId?: string;
  newStatus: string;
  date: string;
  targetRole?: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface NHBRCActionCentreAdapter {
  /** Notify Site Manager and Builder of a failed inspection. */
  notifyInspectionFailure(payload: InspectionFailurePayload): Promise<IntegrationWriteResult>;

  /** Warn about approaching condition resolution deadlines. */
  warnConditionDeadline(payload: ConditionDeadlinePayload): Promise<IntegrationWriteResult>;

  /** Surface warranty inspection schedule to relevant parties. */
  notifyWarrantyInspectionSchedule(payload: WarrantyInspectionSchedulePayload): Promise<IntegrationWriteResult>;

  /** Alert on overdue rectification work. */
  alertRectificationOverdue(payload: RectificationOverduePayload): Promise<IntegrationWriteResult>;

  /** Notify team members of enrolment or inspection milestones. */
  notifyEnrolmentMilestone(payload: EnrolmentMilestonePayload): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const SOURCE_MODULE = 'nhbrc';

/**
 * Creates an NHBRC Action Centre Adapter backed by the shared PlatformIntegrationService.
 */
export function createNHBRCActionCentreAdapter(
  platform: PlatformIntegrationService,
): NHBRCActionCentreAdapter {
  return {
    async notifyInspectionFailure(payload: InspectionFailurePayload): Promise<IntegrationWriteResult> {
      const subject = `Inspection failed: Unit ${payload.unitId} at ${payload.stage} stage — ${payload.rectificationRequirement}`;

      // Notify site manager
      const siteManagerResult = await platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'inspection_failure',
        subject,
        priority: 'high',
        targetUserId: payload.targetSiteManagerId,
        targetRole: 'site_manager',
      });

      // Notify builder
      const builderResult = await platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'inspection_failure',
        subject,
        priority: 'high',
        targetUserId: payload.targetBuilderId,
        targetRole: 'contractor',
      });

      // Return success only if both succeeded
      return {
        success: siteManagerResult.success && builderResult.success,
        retryQueued: siteManagerResult.retryQueued || builderResult.retryQueued,
      };
    },

    async warnConditionDeadline(payload: ConditionDeadlinePayload): Promise<IntegrationWriteResult> {
      const subject = `Condition deadline: Unit ${payload.unitId} (${payload.stage}) — ${payload.daysRemaining} days remaining (due ${payload.deadline})`;

      return platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'condition_deadline_warning',
        subject,
        deadline: payload.deadline,
        priority: payload.daysRemaining <= 3 ? 'critical' : 'high',
        targetUserId: payload.targetUserId,
        targetRole: 'site_manager',
      });
    },

    async notifyWarrantyInspectionSchedule(payload: WarrantyInspectionSchedulePayload): Promise<IntegrationWriteResult> {
      const subject = `Warranty inspection scheduled: Unit ${payload.unitId} — Claim ${payload.claimId} (${payload.claimantName})`;

      return platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'warranty_inspection_schedule',
        subject,
        deadline: payload.scheduledDate,
        priority: 'normal',
        targetUserId: payload.targetUserId,
        targetRole: 'site_manager',
      });
    },

    async alertRectificationOverdue(payload: RectificationOverduePayload): Promise<IntegrationWriteResult> {
      const subject = `Rectification overdue: Unit ${payload.unitId} — Claim ${payload.claimId} (${payload.daysOverdue} days overdue, was due ${payload.rectificationDeadline})`;

      return platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'rectification_overdue',
        subject,
        priority: 'critical',
        targetUserId: payload.targetUserId,
        targetRole: 'contractor',
      });
    },

    async notifyEnrolmentMilestone(payload: EnrolmentMilestonePayload): Promise<IntegrationWriteResult> {
      const unitPart = payload.unitId ? ` — Unit ${payload.unitId}` : '';
      const subject = `NHBRC ${payload.eventType}${unitPart}: ${payload.newStatus} (${payload.date})`;

      return platform.writeToActionCentre({
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'enrolment_milestone',
        subject,
        priority: 'normal',
        targetRole: payload.targetRole,
      });
    },
  };
}
