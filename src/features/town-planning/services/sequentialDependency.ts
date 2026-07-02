/**
 * Sequential Dependency Service
 *
 * Enforces the SPLUMA → SDP → Building Plan dependency chain.
 * Evaluates readiness, provides progress indicators, and supports
 * bypassing when within existing rights.
 *
 * Readiness requires:
 * 1. SPLUMA application approved + conditions complete
 * 2. SDP approved
 *
 * Uses DI pattern consistent with other town-planning services.
 */

import type { UserRole } from '@/types';
import type { FirestoreDB } from './municipalityConfig';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DependencyStatus {
  spluma: 'not_started' | 'in_progress' | 'approved' | 'refused';
  conditions: 'not_started' | 'in_progress' | 'compliant';
  sdp: 'not_started' | 'in_progress' | 'approved' | 'rejected';
  overall: 'not_ready' | 'ready' | 'bypassed';
}

export interface ReadinessResult {
  ready: boolean;
  status: DependencyStatus;
  blockers: string[];
}

export interface ProgressIndicator {
  splumaPercent: number;
  conditionsPercent: number;
  sdpPercent: number;
  overallReadiness: boolean;
  bypassed: boolean;
}

export interface DependencyActor {
  id: string;
  role: UserRole;
}

export interface DependencyAuditEntry {
  action: 'readiness_checked' | 'planning_bypassed' | 'planning_phase_complete';
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  projectId: string;
  details: Record<string, unknown>;
}

export type DependencyAuditFn = (entry: DependencyAuditEntry) => Promise<void>;

export interface DependencyPassportPayload {
  projectId: string;
  planningPhaseComplete: boolean;
  bypassed: boolean;
  motivation?: string;
}

export type DependencyPassportFn = (payload: DependencyPassportPayload) => Promise<void>;

export interface DependencyDeps {
  db: FirestoreDB;
  auditFn: DependencyAuditFn;
  passportFn?: DependencyPassportFn;
}

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Service Implementation ──────────────────────────────────────────────────

/**
 * Checks readiness by evaluating the full dependency chain:
 * SPLUMA approved + conditions complete + SDP approved.
 *
 * Returns { ready, status, blockers }.
 */
export async function checkReadiness(
  projectId: string,
  db: FirestoreDB
): Promise<ReadinessResult> {
  const blockers: string[] = [];
  const status: DependencyStatus = {
    spluma: 'not_started',
    conditions: 'not_started',
    sdp: 'not_started',
    overall: 'not_ready',
  };

  // Check if bypassed
  const bypassPath = `projects/${projectId}/townPlanning/bypass`;
  const bypassSnapshot = await db.collection(bypassPath).get();
  if (!bypassSnapshot.empty) {
    const bypassDoc = bypassSnapshot.docs[0];
    const bypassData = bypassDoc.data();
    if (bypassData?.bypassed === true) {
      status.overall = 'bypassed';
      return { ready: true, status, blockers: [] };
    }
  }

  // 1. Check SPLUMA application status
  const appsPath = `projects/${projectId}/townPlanning/applications`;
  const appsSnapshot = await db.collection(appsPath).get();

  let splumaApproved = false;
  let applicationId: string | null = null;
  let hasApplication = false;

  if (!appsSnapshot.empty) {
    hasApplication = true;
    for (const doc of appsSnapshot.docs) {
      const appData = doc.data();
      if (appData) {
        const outcome = appData.decisionOutcome as string | undefined;
        const stage = appData.stage as string | undefined;

        if (outcome === 'approved' || outcome === 'approved_with_conditions') {
          splumaApproved = true;
          applicationId = doc.id;
          status.spluma = 'approved';
          break;
        } else if (outcome === 'refused') {
          status.spluma = 'approved'; // We set to track last state - actually refused
          status.spluma = 'refused';
        } else if (stage && stage !== 'preparation') {
          status.spluma = 'in_progress';
        }
      }
    }
  }

  if (!hasApplication) {
    status.spluma = 'not_started';
    blockers.push('SPLUMA application not yet created');
  } else if (!splumaApproved) {
    if (status.spluma !== 'refused') {
      status.spluma = status.spluma === 'not_started' ? 'in_progress' : status.spluma;
    }
    blockers.push('SPLUMA application must be approved');
  }

  // 2. Check conditions compliance
  if (applicationId) {
    const conditionsPath = `projects/${projectId}/townPlanning/applications/${applicationId}/conditions`;
    const condSnapshot = await db.collection(conditionsPath).get();

    if (condSnapshot.empty) {
      // No conditions = compliant
      status.conditions = 'compliant';
    } else {
      let allComplete = true;
      let hasInProgress = false;

      for (const doc of condSnapshot.docs) {
        const condData = doc.data();
        if (condData) {
          const condStatus = condData.status as string;
          if (condStatus !== 'fulfilled' && condStatus !== 'waived') {
            allComplete = false;
            if (condStatus === 'in_progress') {
              hasInProgress = true;
            }
          }
        }
      }

      if (allComplete) {
        status.conditions = 'compliant';
      } else {
        status.conditions = hasInProgress ? 'in_progress' : 'not_started';
        blockers.push('All conditions of approval must be fulfilled or waived');
      }
    }
  } else {
    // No application means no conditions to check yet
    status.conditions = 'not_started';
  }

  // 3. Check SDP status
  const sdpPath = `projects/${projectId}/townPlanning/sdps`;
  const sdpSnapshot = await db.collection(sdpPath).get();

  let sdpApproved = false;

  if (!sdpSnapshot.empty) {
    for (const doc of sdpSnapshot.docs) {
      const sdpData = doc.data();
      if (sdpData) {
        const stage = sdpData.stage as string;
        if (stage === 'approved') {
          sdpApproved = true;
          status.sdp = 'approved';
          break;
        } else if (stage === 'rejected') {
          status.sdp = 'rejected';
        } else if (stage !== 'preparation') {
          status.sdp = 'in_progress';
        }
      }
    }
  }

  if (!sdpApproved) {
    if (sdpSnapshot.empty) {
      status.sdp = 'not_started';
      blockers.push('Site Development Plan not yet initiated');
    } else if (status.sdp !== 'rejected') {
      blockers.push('Site Development Plan must be approved');
    } else {
      blockers.push('Site Development Plan was rejected — must be resubmitted and approved');
    }
  }

  // Determine overall readiness
  const ready = splumaApproved && status.conditions === 'compliant' && sdpApproved;
  status.overall = ready ? 'ready' : 'not_ready';

  return { ready, status, blockers };
}

/**
 * Marks the planning phase as not applicable (bypass).
 *
 * Used when the project is within existing rights and no SPLUMA/SDP is needed.
 * Requires motivation and property register confirmation.
 */
export async function markPlanningNotApplicable(
  projectId: string,
  motivation: string,
  actor: DependencyActor,
  deps: DependencyDeps
): Promise<ServiceResult<{ bypassed: boolean }>> {
  const { db, auditFn, passportFn } = deps;

  if (!projectId || projectId.trim().length === 0) {
    return { success: false, error: 'projectId is required' };
  }
  if (!motivation || motivation.trim().length === 0) {
    return { success: false, error: 'Motivation is required when bypassing planning requirements' };
  }

  // Verify property register exists (confirmation that property has been assessed)
  const propertyPath = `projects/${projectId}/townPlanning/propertyRegister`;
  const propertySnapshot = await db.collection(propertyPath).get();

  if (propertySnapshot.empty) {
    return {
      success: false,
      error: 'Property register must be populated to confirm existing rights before bypassing',
    };
  }

  const now = new Date().toISOString();
  const bypassPath = `projects/${projectId}/townPlanning/bypass`;
  await db.collection(bypassPath).add({
    bypassed: true,
    motivation,
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
  } as unknown as Record<string, unknown>);

  await auditFn({
    action: 'planning_bypassed',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    details: { motivation },
  });

  if (passportFn) {
    await passportFn({
      projectId,
      planningPhaseComplete: true,
      bypassed: true,
      motivation,
    });
  }

  return { success: true, data: { bypassed: true } };
}

/**
 * Returns visual progress data for the dependency chain.
 *
 * SPLUMA %: 0 (not started), 50 (in progress), 100 (approved)
 * Conditions %: based on fulfilled+waived / total
 * SDP %: 0 (not started), 50 (in progress), 100 (approved)
 */
export async function getProgressIndicator(
  projectId: string,
  db: FirestoreDB
): Promise<ProgressIndicator> {
  // Check bypass
  const bypassPath = `projects/${projectId}/townPlanning/bypass`;
  const bypassSnapshot = await db.collection(bypassPath).get();
  if (!bypassSnapshot.empty) {
    const bypassDoc = bypassSnapshot.docs[0];
    const bypassData = bypassDoc.data();
    if (bypassData?.bypassed === true) {
      return { splumaPercent: 100, conditionsPercent: 100, sdpPercent: 100, overallReadiness: true, bypassed: true };
    }
  }

  let splumaPercent = 0;
  let conditionsPercent = 0;
  let sdpPercent = 0;

  // SPLUMA progress
  const appsPath = `projects/${projectId}/townPlanning/applications`;
  const appsSnapshot = await db.collection(appsPath).get();
  let applicationId: string | null = null;

  if (!appsSnapshot.empty) {
    for (const doc of appsSnapshot.docs) {
      const appData = doc.data();
      if (appData) {
        const outcome = appData.decisionOutcome as string | undefined;
        if (outcome === 'approved' || outcome === 'approved_with_conditions') {
          splumaPercent = 100;
          applicationId = doc.id;
          break;
        } else {
          splumaPercent = 50;
          applicationId = doc.id;
        }
      }
    }
  }

  // Conditions progress
  if (applicationId) {
    const conditionsPath = `projects/${projectId}/townPlanning/applications/${applicationId}/conditions`;
    const condSnapshot = await db.collection(conditionsPath).get();

    if (condSnapshot.empty) {
      conditionsPercent = 100; // No conditions = compliant
    } else {
      let total = 0;
      let complete = 0;
      for (const doc of condSnapshot.docs) {
        const condData = doc.data();
        if (condData) {
          total++;
          const condStatus = condData.status as string;
          if (condStatus === 'fulfilled' || condStatus === 'waived') {
            complete++;
          }
        }
      }
      conditionsPercent = total > 0 ? Math.round((complete / total) * 100) : 100;
    }
  }

  // SDP progress
  const sdpPath = `projects/${projectId}/townPlanning/sdps`;
  const sdpSnapshot = await db.collection(sdpPath).get();

  if (!sdpSnapshot.empty) {
    for (const doc of sdpSnapshot.docs) {
      const sdpData = doc.data();
      if (sdpData) {
        const stage = sdpData.stage as string;
        if (stage === 'approved') {
          sdpPercent = 100;
          break;
        } else {
          sdpPercent = 50;
        }
      }
    }
  }

  const overallReadiness = splumaPercent === 100 && conditionsPercent === 100 && sdpPercent === 100;

  return { splumaPercent, conditionsPercent, sdpPercent, overallReadiness, bypassed: false };
}

/**
 * Called when the full chain is satisfied to update Project Passport.
 * Marks planning phase as complete.
 */
export async function markPlanningPhaseComplete(
  projectId: string,
  actor: DependencyActor,
  deps: DependencyDeps
): Promise<ServiceResult<{ complete: boolean }>> {
  const { db, auditFn, passportFn } = deps;

  // Verify readiness
  const readiness = await checkReadiness(projectId, db);
  if (!readiness.ready) {
    return {
      success: false,
      error: `Planning phase not complete: ${readiness.blockers.join('; ')}`,
    };
  }

  const now = new Date().toISOString();

  await auditFn({
    action: 'planning_phase_complete',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    details: { status: readiness.status },
  });

  if (passportFn) {
    await passportFn({
      projectId,
      planningPhaseComplete: true,
      bypassed: readiness.status.overall === 'bypassed',
    });
  }

  return { success: true, data: { complete: true } };
}
