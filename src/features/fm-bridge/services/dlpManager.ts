/**
 * FM Bridge — DLP Manager Service
 *
 * Manages Defects Liability Period lifecycle, defect state machine transitions,
 * DLP countdown with notification thresholds, post-DLP defect handling,
 * and DLP summary generation.
 *
 * Pure functions — no direct persistence imports.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

import type {
  DefectRecord,
  DefectStage,
  DLPRecord,
  DLPStatus,
} from '../types';

// ─── Service Result Type ──────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Output Types ─────────────────────────────────────────────────────────────

/** Notification threshold levels for DLP countdown */
export type DLPNotificationThreshold = 60 | 30 | 14 | 7;

/** Result of calculating DLP countdown */
export interface DLPCountdownResult {
  remainingDays: number;
  isExpired: boolean;
  activeThresholds: DLPNotificationThreshold[];
  status: DLPStatus;
}

/** Summary report of DLP defects (Requirement 5.6) */
export interface DLPSummaryReport {
  dlpId: string;
  dlpStatus: DLPStatus;
  totalDefects: number;
  defectsClosed: number;
  defectsOutstanding: number;
  outstandingBySeverity: {
    critical: number;
    major: number;
    minor: number;
    cosmetic: number;
  };
}

/** Result of accepting a post-DLP defect */
export interface PostDLPDefectResult {
  defect: DefectRecord;
  isPostDLP: boolean;
  notice: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Forward-only defect state machine (Requirement 5.4).
 * Each stage maps to its single valid next stage.
 */
const DEFECT_STAGE_ORDER: readonly DefectStage[] = [
  'logged',
  'notified',
  'inspection_scheduled',
  'rectification_in_progress',
  'rectified',
  'verified',
  'closed',
] as const;

/**
 * Notification thresholds in descending order (Requirement 5.2).
 * Notifications fire at 60, 30, 14, and 7 days before DLP expiry.
 */
const NOTIFICATION_THRESHOLDS: readonly DLPNotificationThreshold[] = [60, 30, 14, 7] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculates the difference in calendar days between two dates.
 * A positive result means `end` is in the future relative to `start`.
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculates the DLP countdown showing remaining days until expiry and
 * which notification thresholds are currently active.
 *
 * Rules (Requirement 5.2):
 * - remaining = endDate - now (in calendar days)
 * - Notification thresholds fire at 60, 30, 14, 7 days before expiry
 * - A threshold is "active" when remainingDays <= threshold
 * - If remaining <= 0, DLP is expired
 * - If DLP status is already "all_defects_resolved", retain that status
 *
 * @param dlp - The DLP record
 * @param now - Current date (injected for testability)
 * @returns ServiceResult with countdown info
 */
export function calculateDLPCountdown(
  dlp: DLPRecord,
  now: Date,
): ServiceResult<DLPCountdownResult> {
  if (!dlp || !now) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'DLP record and current date are required',
      },
    };
  }

  // If DLP is already resolved, retain that status
  if (dlp.status === 'all_defects_resolved') {
    const endDate = new Date(dlp.endDate);
    const remaining = daysBetween(now, endDate);
    return {
      success: true,
      data: {
        remainingDays: Math.max(remaining, 0),
        isExpired: remaining <= 0,
        activeThresholds: [],
        status: 'all_defects_resolved',
      },
    };
  }

  const endDate = new Date(dlp.endDate);
  const remaining = daysBetween(now, endDate);

  // Determine if expired
  const isExpired = remaining <= 0;
  const status: DLPStatus = isExpired ? 'expired' : 'active';

  // Calculate active notification thresholds
  // A threshold is active when remaining days are <= the threshold value
  // and the DLP is not yet expired
  const activeThresholds: DLPNotificationThreshold[] = [];
  if (!isExpired) {
    for (const threshold of NOTIFICATION_THRESHOLDS) {
      if (remaining <= threshold) {
        activeThresholds.push(threshold);
      }
    }
  }

  return {
    success: true,
    data: {
      remainingDays: Math.max(remaining, 0),
      isExpired,
      activeThresholds,
      status,
    },
  };
}

/**
 * Transitions a defect to the next stage in the forward-only state machine.
 *
 * State machine (Requirement 5.4):
 * logged → notified → inspection_scheduled → rectification_in_progress → rectified → verified → closed
 *
 * Rules:
 * - Only forward transitions permitted
 * - "closed" is the terminal state
 * - Target stage must be the immediate next stage (no skipping)
 *
 * @param defect - The current defect record
 * @param targetStage - The desired next stage
 * @returns ServiceResult with the updated defect or validation error
 */
export function transitionDefect(
  defect: DefectRecord,
  targetStage: DefectStage,
): ServiceResult<{ next: DefectRecord; valid: boolean; error?: string }> {
  if (!defect || !targetStage) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Defect record and target stage are required',
      },
    };
  }

  const currentIndex = DEFECT_STAGE_ORDER.indexOf(defect.stage);
  const targetIndex = DEFECT_STAGE_ORDER.indexOf(targetStage);

  // Validate target stage is a known stage
  if (targetIndex === -1) {
    return {
      success: true,
      data: {
        next: defect,
        valid: false,
        error: `Invalid target stage: "${targetStage}". Valid stages: ${DEFECT_STAGE_ORDER.join(', ')}`,
      },
    };
  }

  // Terminal state — no further transitions allowed
  if (defect.stage === 'closed') {
    return {
      success: true,
      data: {
        next: defect,
        valid: false,
        error: 'Defect is already at terminal stage "closed". No further transitions permitted.',
      },
    };
  }

  // Must be the immediate next stage (forward-only, no skipping)
  if (targetIndex !== currentIndex + 1) {
    const expectedNext = DEFECT_STAGE_ORDER[currentIndex + 1];
    return {
      success: true,
      data: {
        next: defect,
        valid: false,
        error: `Cannot transition from "${defect.stage}" to "${targetStage}". ` +
          `Only forward transitions are permitted. Next valid stage: "${expectedNext}".`,
      },
    };
  }

  // Valid transition — produce updated defect
  const updatedDefect: DefectRecord = {
    ...defect,
    stage: targetStage,
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    data: {
      next: updatedDefect,
      valid: true,
    },
  };
}

/**
 * Generates a summary report of defects within a DLP.
 *
 * Rules (Requirement 5.6):
 * - totalDefects: count of all defects (including post-DLP)
 * - defectsClosed: count of defects at "closed" stage
 * - defectsOutstanding: count of defects NOT at "closed" stage
 * - outstandingBySeverity: breakdown of outstanding defects by severity
 *
 * @param dlp - The DLP record
 * @param defects - All defects associated with this DLP
 * @returns ServiceResult with the summary report
 */
export function generateDLPSummary(
  dlp: DLPRecord,
  defects: DefectRecord[],
): ServiceResult<DLPSummaryReport> {
  if (!dlp || !defects) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'DLP record and defects array are required',
      },
    };
  }

  const totalDefects = defects.length;
  const closedDefects = defects.filter((d) => d.stage === 'closed');
  const outstandingDefects = defects.filter((d) => d.stage !== 'closed');

  const outstandingBySeverity = {
    critical: outstandingDefects.filter((d) => d.severity === 'critical').length,
    major: outstandingDefects.filter((d) => d.severity === 'major').length,
    minor: outstandingDefects.filter((d) => d.severity === 'minor').length,
    cosmetic: outstandingDefects.filter((d) => d.severity === 'cosmetic').length,
  };

  return {
    success: true,
    data: {
      dlpId: dlp.id,
      dlpStatus: dlp.status,
      totalDefects,
      defectsClosed: closedDefects.length,
      defectsOutstanding: outstandingDefects.length,
      outstandingBySeverity,
    },
  };
}

/**
 * Determines whether a defect should be flagged as post-DLP and accepts it.
 *
 * Rules (Requirement 5.7):
 * - If dateDiscovered > DLP endDate, the defect IS post-DLP
 * - Post-DLP defects are accepted but flagged with isPostDLP=true
 * - A notice is attached stating that entitlement to rectification at
 *   contractor's cost requires contractual and legal review
 *
 * @param dlp - The DLP record
 * @param defect - The defect being logged
 * @returns ServiceResult with the defect (flagged if post-DLP) and notice
 */
export function acceptDefect(
  dlp: DLPRecord,
  defect: DefectRecord,
): ServiceResult<PostDLPDefectResult> {
  if (!dlp || !defect) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'DLP record and defect record are required',
      },
    };
  }

  const dlpEndDate = new Date(dlp.endDate);
  const dateDiscovered = new Date(defect.dateDiscovered);
  const isPostDLP = dateDiscovered > dlpEndDate;

  const updatedDefect: DefectRecord = {
    ...defect,
    isPostDLP,
  };

  const notice = isPostDLP
    ? 'This defect was recorded after the Defects Liability Period expired. ' +
      'Entitlement to rectification at contractor\'s cost requires contractual and legal review.'
    : '';

  return {
    success: true,
    data: {
      defect: updatedDefect,
      isPostDLP,
      notice,
    },
  };
}

/**
 * Checks whether the DLP should auto-transition to "all_defects_resolved"
 * when all defects have reached "closed" stage.
 *
 * Rules (Requirement 5.8):
 * - When ALL defects logged during the DLP reach "closed" stage,
 *   the DLP status transitions to "all_defects_resolved"
 * - If there are zero defects, the DLP remains in its current status
 *   (no auto-transition for an empty defect list)
 * - Only applies when DLP is in "active" or "expired" status
 *
 * @param dlp - The DLP record
 * @param defects - All defects associated with this DLP
 * @returns ServiceResult with updated DLP and whether transition occurred
 */
export function evaluateDLPAutoTransition(
  dlp: DLPRecord,
  defects: DefectRecord[],
): ServiceResult<{ dlp: DLPRecord; transitioned: boolean }> {
  if (!dlp || !defects) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'DLP record and defects array are required',
      },
    };
  }

  // Already resolved — no transition needed
  if (dlp.status === 'all_defects_resolved') {
    return {
      success: true,
      data: { dlp, transitioned: false },
    };
  }

  // No defects — don't auto-transition
  if (defects.length === 0) {
    return {
      success: true,
      data: { dlp, transitioned: false },
    };
  }

  // Check if all defects are closed
  const allClosed = defects.every((d) => d.stage === 'closed');

  if (allClosed) {
    const updatedDLP: DLPRecord = {
      ...dlp,
      status: 'all_defects_resolved',
      updatedAt: new Date().toISOString(),
    };
    return {
      success: true,
      data: { dlp: updatedDLP, transitioned: true },
    };
  }

  return {
    success: true,
    data: { dlp, transitioned: false },
  };
}
