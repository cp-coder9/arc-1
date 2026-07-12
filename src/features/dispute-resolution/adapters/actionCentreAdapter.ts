/**
 * Action Centre Adapter — Dispute Resolution
 *
 * Surfaces deadline warnings, submission deadlines, and overdue notices
 * to the platform Action Centre / Inbox using ActionCentreWritePayload.
 *
 * Priority levels:
 * - normal: 14-day warning
 * - high: 7-day warning
 * - critical: 3-day warning or overdue
 *
 * Requirements: 10.6, 10.8
 */

import type { PlatformIntegrationService } from '@/features/p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '@/features/p1-shared/types';
import type { NoticeDeadline } from '../types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface DeadlineWarningInput {
  projectId: string;
  deadline: NoticeDeadline;
  claimReference: string;
  targetRole?: string;
  targetUserId?: string;
}

export interface SubmissionDeadlineInput {
  projectId: string;
  claimReference: string;
  subject: string;
  deadline: string;
  targetRole?: string;
  targetUserId?: string;
}

export interface OverdueNoticeInput {
  projectId: string;
  deadline: NoticeDeadline;
  claimReference: string;
  daysOverdue: number;
  targetRole?: string;
  targetUserId?: string;
}

export interface SyncFailureInput {
  projectId: string;
  claimReference: string;
  targetModule: string;
  errorDescription: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface DisputeActionCentreAdapter {
  /** Surface a deadline warning (14/7/3 day thresholds) */
  writeDeadlineWarning(input: DeadlineWarningInput): Promise<IntegrationWriteResult>;

  /** Surface a submission deadline (adjudication submissions, etc.) */
  writeSubmissionDeadline(input: SubmissionDeadlineInput): Promise<IntegrationWriteResult>;

  /** Surface an overdue notice for missed deadlines */
  writeOverdueNotice(input: OverdueNoticeInput): Promise<IntegrationWriteResult>;

  /** Surface a sync failure alert (Req 10.8) */
  writeSyncFailureAlert(input: SyncFailureInput): Promise<IntegrationWriteResult>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine priority level based on days remaining.
 * - 14 days: normal
 * - 7 days: high
 * - 3 days or fewer / overdue: critical
 */
export function determinePriority(daysRemaining: number): 'normal' | 'high' | 'critical' {
  if (daysRemaining <= 3) return 'critical';
  if (daysRemaining <= 7) return 'high';
  return 'normal';
}

/**
 * Format a deadline type into a human-readable label.
 */
function formatDeadlineType(type: NoticeDeadline['deadlineType']): string {
  switch (type) {
    case 'notification': return 'Notice Submission';
    case 'particulars': return 'Particulars Submission';
    case 'response': return 'Response';
    case 'adjudication_referral': return 'Adjudication Referral';
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates the Dispute Resolution Action Centre adapter.
 *
 * Accepts a PlatformIntegrationService and returns an object with
 * typed write methods for surfacing deadline warnings, submission
 * deadlines, overdue notices, and sync failure alerts.
 */
export function createDisputeActionCentreAdapter(
  platform: PlatformIntegrationService,
): DisputeActionCentreAdapter {
  return {
    async writeDeadlineWarning(input: DeadlineWarningInput): Promise<IntegrationWriteResult> {
      const { projectId, deadline, claimReference, targetRole, targetUserId } = input;
      const priority = determinePriority(deadline.daysRemaining);
      const deadlineLabel = formatDeadlineType(deadline.deadlineType);

      return platform.writeToActionCentre({
        projectId,
        sourceModule: 'dispute-resolution',
        actionType: 'deadline_warning',
        subject: `${deadlineLabel} deadline in ${deadline.daysRemaining} day${deadline.daysRemaining !== 1 ? 's' : ''} — Claim ${claimReference}`,
        deadline: deadline.dueDate,
        priority,
        targetRole,
        targetUserId,
      });
    },

    async writeSubmissionDeadline(input: SubmissionDeadlineInput): Promise<IntegrationWriteResult> {
      const { projectId, claimReference, subject, deadline, targetRole, targetUserId } = input;

      return platform.writeToActionCentre({
        projectId,
        sourceModule: 'dispute-resolution',
        actionType: 'submission_deadline',
        subject: `${subject} — Claim ${claimReference}`,
        deadline,
        priority: 'high',
        targetRole,
        targetUserId,
      });
    },

    async writeOverdueNotice(input: OverdueNoticeInput): Promise<IntegrationWriteResult> {
      const { projectId, deadline, claimReference, daysOverdue, targetRole, targetUserId } = input;
      const deadlineLabel = formatDeadlineType(deadline.deadlineType);

      return platform.writeToActionCentre({
        projectId,
        sourceModule: 'dispute-resolution',
        actionType: 'overdue_notice',
        subject: `OVERDUE: ${deadlineLabel} — ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} past deadline — Claim ${claimReference}`,
        deadline: deadline.dueDate,
        priority: 'critical',
        targetRole,
        targetUserId,
      });
    },

    async writeSyncFailureAlert(input: SyncFailureInput): Promise<IntegrationWriteResult> {
      const { projectId, claimReference, targetModule, errorDescription } = input;

      return platform.writeToActionCentre({
        projectId,
        sourceModule: 'dispute-resolution',
        actionType: 'sync_failure',
        subject: `Sync failure: write to ${targetModule} failed for Claim ${claimReference} — ${errorDescription}`,
        priority: 'high',
      });
    },
  };
}
