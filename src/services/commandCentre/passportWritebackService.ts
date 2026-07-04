/**
 * Project Command Centre — Passport Writeback Service
 *
 * Writes significant state changes back into the Project Passport
 * so the central project truth remains current.
 * Persists at `projects/{projectId}/passport/`.
 *
 * @module commandCentre/passportWritebackService
 */

import { setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { addDoc } from 'firebase/firestore';
import type { PassportWriteback, Priority } from '@/services/commandCentre/types';

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const PASSPORT_SUBCOL = 'passport';
const HEALTH_DOC = 'health';
const AUDIT_SUBCOL = 'passport_audit';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function healthDocument(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoDoc(PROJECTS_COL, projectId, PASSPORT_SUBCOL, HEALTH_DOC);
}

function passportAuditCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, AUDIT_SUBCOL);
}

// ── Writeback Functions ──────────────────────────────────────────────────────

/**
 * Writes schedule health status to the Project Passport.
 * Triggered by milestone status changes or programme variance.
 */
export async function writeScheduleHealth(
  projectId: string,
  status: 'on_track' | 'at_risk' | 'delayed',
): Promise<void> {
  try {
    const writeback: Partial<PassportWriteback['updates']> = { scheduleHealth: status };
    await setDoc(healthDocument(projectId), {
      scheduleHealth: status,
      scheduleHealthUpdatedAt: new Date().toISOString(),
    }, { merge: true });

    void recordSignificantAction(projectId, {
      type: 'schedule_health_update',
      detail: `Schedule health set to ${status}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PASSPORT_SUBCOL}/${HEALTH_DOC}`);
  }
}

/**
 * Writes financial health status to the Project Passport.
 * Triggered by budget overrun detection or significant variance.
 */
export async function writeFinancialHealth(
  projectId: string,
  status: 'healthy' | 'at_risk' | 'over_budget',
): Promise<void> {
  try {
    await setDoc(healthDocument(projectId), {
      financialHealth: status,
      financialHealthUpdatedAt: new Date().toISOString(),
    }, { merge: true });

    void recordSignificantAction(projectId, {
      type: 'financial_health_update',
      detail: `Financial health set to ${status}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PASSPORT_SUBCOL}/${HEALTH_DOC}`);
  }
}

/**
 * Writes risk profile summary to the Project Passport.
 * Triggered by critical risk creation or escalation.
 */
export async function writeRiskProfile(
  projectId: string,
  profile: { level: Priority; openCount: number; criticalCount: number },
): Promise<void> {
  try {
    await setDoc(healthDocument(projectId), {
      riskProfile: profile,
      riskProfileUpdatedAt: new Date().toISOString(),
    }, { merge: true });

    void recordSignificantAction(projectId, {
      type: 'risk_profile_update',
      detail: `Risk profile updated: ${profile.openCount} open, ${profile.criticalCount} critical`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PASSPORT_SUBCOL}/${HEALTH_DOC}`);
  }
}

/**
 * Writes milestone progress summary to the Project Passport.
 * Triggered by milestone completion or overdue status.
 */
export async function writeMilestoneProgress(
  projectId: string,
  progress: { total: number; completed: number; overdue: number },
): Promise<void> {
  try {
    await setDoc(healthDocument(projectId), {
      milestoneProgress: progress,
      milestoneProgressUpdatedAt: new Date().toISOString(),
    }, { merge: true });

    void recordSignificantAction(projectId, {
      type: 'milestone_progress_update',
      detail: `Milestones: ${progress.completed}/${progress.total} complete, ${progress.overdue} overdue`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PASSPORT_SUBCOL}/${HEALTH_DOC}`);
  }
}

/**
 * Writes quality score (snag resolution rate %) to the Project Passport.
 */
export async function writeQualityScore(
  projectId: string,
  score: number,
): Promise<void> {
  try {
    await setDoc(healthDocument(projectId), {
      qualityScore: score,
      qualityScoreUpdatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${PASSPORT_SUBCOL}/${HEALTH_DOC}`);
  }
}

/**
 * Records a significant action in the Passport audit trail.
 * Used by all subsystems to create a central audit record.
 */
export async function recordSignificantAction(
  projectId: string,
  action: { type: string; detail: string; timestamp: string; actorId?: string },
): Promise<void> {
  try {
    await addDoc(passportAuditCollection(projectId), {
      ...action,
      projectId,
      source: 'command_centre',
      timestamp: action.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    // Fire-and-forget: log but don't throw
    console.error('[PassportWriteback] Audit write failed:', error instanceof Error ? error.message : String(error));
  }
}

// ── Service Export ───────────────────────────────────────────────────────────

export const passportWritebackService = {
  writeScheduleHealth,
  writeFinancialHealth,
  writeRiskProfile,
  writeMilestoneProgress,
  writeQualityScore,
  recordSignificantAction,
};

export default passportWritebackService;
