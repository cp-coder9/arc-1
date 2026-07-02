/**
 * Appeal Tracker Service
 *
 * Manages appeal lifecycle: filing, stage transitions, deadline calculation,
 * and outcome recording.
 *
 * State machine:
 *   filed → under_consideration → hearing_scheduled → decision_received
 *   any → withdrawn
 *
 * Uses DI pattern consistent with other town-planning services.
 */

import type { UserRole } from '@/types';
import type { AppealStage, AppealOutcome, Appeal } from '../types';
import type { FirestoreDB } from './municipalityConfig';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default prescribed period for appeals (calendar days) */
const DEFAULT_APPEAL_PERIOD_DAYS = 180;

/** Permitted appeal stage transitions */
export const APPEAL_STAGE_TRANSITIONS: Record<AppealStage, AppealStage[]> = {
  filed: ['under_consideration', 'withdrawn'],
  under_consideration: ['hearing_scheduled', 'withdrawn'],
  hearing_scheduled: ['decision_received', 'withdrawn'],
  decision_received: ['withdrawn'],
  withdrawn: [],
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AppealActor {
  id: string;
  role: UserRole;
}

export interface AppealInput {
  grounds: string;
  decisionDate: string;
  hearingDate?: string;
}

export interface AppealAuditEntry {
  action: 'appeal_filed' | 'appeal_stage_transitioned' | 'appeal_outcome_recorded';
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  projectId: string;
  appealId: string;
  details: Record<string, unknown>;
}

export type AppealAuditFn = (entry: AppealAuditEntry) => Promise<void>;

export interface AppealPassportPayload {
  projectId: string;
  appealId: string;
  applicationId: string;
  underAppeal: boolean;
  blocksBuilding: boolean;
  outcome?: AppealOutcome;
}

export type AppealPassportFn = (payload: AppealPassportPayload) => Promise<void>;

export interface AppealActionCentrePayload {
  projectId: string;
  appealId: string;
  alertType: 'appeal_filed' | 'appeal_late_filing' | 'appeal_outcome';
  message: string;
}

export type AppealActionCentreFn = (payload: AppealActionCentrePayload) => Promise<void>;

export interface AppealDeps {
  db: FirestoreDB;
  auditFn: AppealAuditFn;
  passportFn?: AppealPassportFn;
  actionCentreFn?: AppealActionCentreFn;
}

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Helper: Collection Path ─────────────────────────────────────────────────

function appealsPath(projectId: string): string {
  return `projects/${projectId}/townPlanning/appeals`;
}

// ─── Helper: Deadline Calculation ────────────────────────────────────────────

/**
 * Calculates prescribed deadline by adding calendar days to the decision date.
 * Uses municipality-configured appeal period or default 180 days.
 */
export function calculatePrescribedDeadline(decisionDate: string, periodDays: number): string {
  const date = new Date(decisionDate);
  date.setDate(date.getDate() + periodDays);
  return date.toISOString().split('T')[0];
}

/**
 * Determines if the filing date is within the prescribed period.
 */
export function isWithinPrescribedPeriod(filingDate: string, prescribedDeadline: string): boolean {
  return filingDate <= prescribedDeadline;
}

// ─── Service Implementation ──────────────────────────────────────────────────

/**
 * Files a new appeal against an application decision.
 *
 * - Validates input (grounds required, decision date required)
 * - Calculates prescribed deadline (180 calendar days or municipality-configured)
 * - Sets filedWithinPrescribedPeriod flag
 * - On filed: updates Project Passport (project under appeal, blocks building plan)
 */
export async function fileAppeal(
  applicationId: string,
  projectId: string,
  input: AppealInput,
  actor: AppealActor,
  deps: AppealDeps
): Promise<ServiceResult<Appeal>> {
  const { db, auditFn, passportFn, actionCentreFn } = deps;

  // Validate input
  if (!applicationId || applicationId.trim().length === 0) {
    return { success: false, error: 'applicationId is required' };
  }
  if (!projectId || projectId.trim().length === 0) {
    return { success: false, error: 'projectId is required' };
  }
  if (!input.grounds || input.grounds.trim().length === 0) {
    return { success: false, error: 'Appeal grounds are required' };
  }
  if (!input.decisionDate || input.decisionDate.trim().length === 0) {
    return { success: false, error: 'Decision date is required' };
  }

  // Determine appeal period from municipality config
  let appealPeriodDays = DEFAULT_APPEAL_PERIOD_DAYS;

  // Check municipality config for custom period
  const appsPath = `projects/${projectId}/townPlanning/applications`;
  const appsSnapshot = await db.collection(appsPath).get();
  let municipalityId: string | null = null;

  if (!appsSnapshot.empty) {
    for (const doc of appsSnapshot.docs) {
      const appData = doc.data();
      if (appData && doc.id === applicationId) {
        municipalityId = appData.municipalityId as string;
        break;
      }
    }
  }

  if (municipalityId) {
    const muniDoc = await db.collection('municipalityProfiles').doc(municipalityId).get();
    if (muniDoc.exists) {
      const muniData = muniDoc.data();
      if (muniData?.appealPeriodDays) {
        appealPeriodDays = muniData.appealPeriodDays as number;
      }
    }
  }

  const now = new Date().toISOString();
  const filingDate = now.split('T')[0];
  const prescribedDeadline = calculatePrescribedDeadline(input.decisionDate, appealPeriodDays);
  const filedWithinPrescribedPeriod = isWithinPrescribedPeriod(filingDate, prescribedDeadline);

  const appealData: Omit<Appeal, 'id'> = {
    applicationId,
    projectId,
    stage: 'filed',
    filingDate,
    prescribedDeadline,
    filedWithinPrescribedPeriod,
    grounds: input.grounds,
    hearingDate: input.hearingDate,
    createdAt: now,
    updatedAt: now,
  };

  const path = appealsPath(projectId);
  const docRef = await db.collection(path).add(appealData as unknown as Record<string, unknown>);

  const appeal: Appeal = { id: docRef.id, ...appealData };

  await auditFn({
    action: 'appeal_filed',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    appealId: docRef.id,
    details: {
      applicationId,
      filedWithinPrescribedPeriod,
      prescribedDeadline,
    },
  });

  // Update Project Passport: project under appeal, blocks building plan
  if (passportFn) {
    await passportFn({
      projectId,
      appealId: docRef.id,
      applicationId,
      underAppeal: true,
      blocksBuilding: true,
    });
  }

  // Alert if filed late
  if (!filedWithinPrescribedPeriod && actionCentreFn) {
    await actionCentreFn({
      projectId,
      appealId: docRef.id,
      alertType: 'appeal_late_filing',
      message: `Appeal filed after prescribed deadline (${prescribedDeadline}). May be dismissed on procedural grounds.`,
    });
  }

  if (actionCentreFn) {
    await actionCentreFn({
      projectId,
      appealId: docRef.id,
      alertType: 'appeal_filed',
      message: `Appeal filed against application ${applicationId}`,
    });
  }

  return { success: true, data: appeal };
}

/**
 * Transitions the appeal through its stage state machine.
 *
 * State machine:
 *   filed → under_consideration → hearing_scheduled → decision_received
 *   any → withdrawn (except from withdrawn itself)
 *
 * On outcome: records result (upheld/dismissed/varied) and updates passport.
 */
export async function transitionAppealStage(
  appealId: string,
  targetStage: AppealStage,
  params: { outcome?: AppealOutcome; outcomeReasons?: string; hearingDate?: string; notes?: string },
  projectId: string,
  actor: AppealActor,
  deps: AppealDeps
): Promise<ServiceResult<Appeal>> {
  const { db, auditFn, passportFn, actionCentreFn } = deps;

  const path = appealsPath(projectId);
  const docSnap = await db.collection(path).doc(appealId).get();

  if (!docSnap.exists) {
    return { success: false, error: `Appeal '${appealId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `Appeal '${appealId}' has no data` };
  }

  const currentStage = data.stage as AppealStage;

  // Validate transition
  const permitted = APPEAL_STAGE_TRANSITIONS[currentStage] ?? [];
  if (!permitted.includes(targetStage)) {
    return {
      success: false,
      error: `Invalid appeal stage transition: '${currentStage}' → '${targetStage}'. Permitted: ${permitted.join(', ') || 'none (terminal state)'}`,
    };
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    stage: targetStage,
    updatedAt: now,
  };

  if (targetStage === 'hearing_scheduled' && params.hearingDate) {
    updatePayload.hearingDate = params.hearingDate;
  }

  if (targetStage === 'decision_received') {
    if (params.outcome) {
      updatePayload.outcome = params.outcome;
      updatePayload.outcomeDate = now;
    }
    if (params.outcomeReasons) {
      updatePayload.outcomeReasons = params.outcomeReasons;
    }
  }

  await db.collection(path).doc(appealId).update(updatePayload);

  await auditFn({
    action: targetStage === 'decision_received' ? 'appeal_outcome_recorded' : 'appeal_stage_transitioned',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    appealId,
    details: {
      previousStage: currentStage,
      newStage: targetStage,
      outcome: params.outcome,
      outcomeReasons: params.outcomeReasons,
    },
  });

  // On decision_received or withdrawn: update passport (no longer blocks)
  if (targetStage === 'decision_received' || targetStage === 'withdrawn') {
    if (passportFn) {
      const applicationId = data.applicationId as string;
      await passportFn({
        projectId,
        appealId,
        applicationId,
        underAppeal: false,
        blocksBuilding: false,
        outcome: params.outcome,
      });
    }

    if (targetStage === 'decision_received' && actionCentreFn && params.outcome) {
      await actionCentreFn({
        projectId,
        appealId,
        alertType: 'appeal_outcome',
        message: `Appeal outcome: ${params.outcome}${params.outcomeReasons ? ' — ' + params.outcomeReasons : ''}`,
      });
    }
  }

  const appeal: Appeal = {
    id: appealId,
    ...(data as unknown as Omit<Appeal, 'id'>),
    stage: targetStage,
    updatedAt: now,
    ...(targetStage === 'hearing_scheduled' && params.hearingDate ? { hearingDate: params.hearingDate } : {}),
    ...(targetStage === 'decision_received' && params.outcome ? { outcome: params.outcome, outcomeDate: now } : {}),
    ...(targetStage === 'decision_received' && params.outcomeReasons ? { outcomeReasons: params.outcomeReasons } : {}),
  };

  return { success: true, data: appeal };
}
