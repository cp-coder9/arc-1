/**
 * SDP (Site Development Plan) Engine Service
 *
 * Manages Site Development Plan workflow including initiation,
 * municipality-specific checklist generation, checklist item management,
 * stage transitions, and prerequisite validation.
 *
 * State machine:
 *   preparation → submitted → under_review → approved | amendments_required | rejected
 *   rejected → preparation (resubmit)
 *
 * Uses DI pattern consistent with other town-planning services.
 */

import type { UserRole } from '@/types';
import type {
  SDPStage,
  SDPChecklistItemStatus,
  SDPChecklistItem,
  SiteDevelopmentPlan,
} from '../types';
import type { FirestoreDB } from './municipalityConfig';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Standard SDP checklist items common to all municipalities */
const STANDARD_CHECKLIST_ITEMS: Omit<SDPChecklistItem, 'id'>[] = [
  { name: 'Site Layout Plan', description: 'Overall site layout showing building positions, setbacks, and access', status: 'not_started', linkedDocumentIds: [], isRequired: true, category: 'site_layout' },
  { name: 'Engineering Services', description: 'Civil engineering infrastructure design (water, sewer, stormwater)', status: 'not_started', linkedDocumentIds: [], isRequired: true, category: 'engineering' },
  { name: 'Landscaping Plan', description: 'Landscape design including plantings, hardscape, and irrigation', status: 'not_started', linkedDocumentIds: [], isRequired: true, category: 'landscaping' },
  { name: 'Stormwater Management', description: 'Stormwater attenuation and drainage management plan', status: 'not_started', linkedDocumentIds: [], isRequired: true, category: 'stormwater' },
  { name: 'Parking Layout', description: 'Parking provision plan with calculations per zoning requirements', status: 'not_started', linkedDocumentIds: [], isRequired: true, category: 'parking' },
];

/** Permitted SDP stage transitions */
export const SDP_STAGE_TRANSITIONS: Record<SDPStage, SDPStage[]> = {
  preparation: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'amendments_required', 'rejected'],
  approved: [],
  amendments_required: [],
  rejected: ['preparation'],
};

/** Permitted checklist item status transitions */
export const CHECKLIST_ITEM_TRANSITIONS: Record<SDPChecklistItemStatus, SDPChecklistItemStatus[]> = {
  not_started: ['in_progress'],
  in_progress: ['complete'],
  complete: [],
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SDPActor {
  id: string;
  role: UserRole;
}

export interface SDPAuditEntry {
  action: 'sdp_initiated' | 'sdp_checklist_updated' | 'sdp_stage_transitioned';
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  projectId: string;
  sdpId: string;
  details: Record<string, unknown>;
}

export type SDPAuditFn = (entry: SDPAuditEntry) => Promise<void>;

export interface SDPPassportPayload {
  projectId: string;
  sdpId: string;
  stage: SDPStage;
  approved: boolean;
}

export type SDPPassportFn = (payload: SDPPassportPayload) => Promise<void>;

export interface SDPReadinessPayload {
  projectId: string;
  sdpId: string;
  sdpApproved: boolean;
}

export type SDPReadinessFn = (payload: SDPReadinessPayload) => Promise<void>;

export interface SDPActionCentrePayload {
  projectId: string;
  sdpId: string;
  alertType: 'sdp_rejected' | 'sdp_approved';
  message: string;
}

export type SDPActionCentreFn = (payload: SDPActionCentrePayload) => Promise<void>;

export interface SDPDeps {
  db: FirestoreDB;
  auditFn: SDPAuditFn;
  passportFn?: SDPPassportFn;
  readinessFn?: SDPReadinessFn;
  actionCentreFn?: SDPActionCentreFn;
}

export interface PrerequisiteResult {
  canSubmit: boolean;
  blockers: string[];
}

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Helper: Collection Path ─────────────────────────────────────────────────

function sdpPath(projectId: string): string {
  return `projects/${projectId}/townPlanning/sdps`;
}

// ─── Service Implementation ──────────────────────────────────────────────────

/**
 * Initiates a new Site Development Plan with municipality-specific checklist.
 *
 * Generates standard checklist items (site layout, engineering, landscaping,
 * stormwater, parking) plus municipality-specific extras from the profile.
 */
export async function initiateSDP(
  projectId: string,
  municipalityId: string,
  actor: SDPActor,
  deps: SDPDeps
): Promise<ServiceResult<SiteDevelopmentPlan>> {
  const { db, auditFn } = deps;

  if (!projectId || projectId.trim().length === 0) {
    return { success: false, error: 'projectId is required' };
  }
  if (!municipalityId || municipalityId.trim().length === 0) {
    return { success: false, error: 'municipalityId is required' };
  }

  // Fetch municipality profile for additional SDP components
  const municipalityDoc = await db.collection('municipalityProfiles').doc(municipalityId).get();
  let additionalComponents: string[] = [];
  if (municipalityDoc.exists) {
    const profileData = municipalityDoc.data();
    if (profileData?.additionalSDPComponents) {
      additionalComponents = profileData.additionalSDPComponents as string[];
    }
  }

  // Build checklist: standard + municipality extras
  const checklist: SDPChecklistItem[] = STANDARD_CHECKLIST_ITEMS.map((item, idx) => ({
    ...item,
    id: `std-${idx + 1}`,
  }));

  for (let i = 0; i < additionalComponents.length; i++) {
    checklist.push({
      id: `muni-${i + 1}`,
      name: additionalComponents[i],
      description: `Municipality-specific requirement: ${additionalComponents[i]}`,
      status: 'not_started',
      linkedDocumentIds: [],
      isRequired: true,
      category: 'municipality_specific',
    });
  }

  const now = new Date().toISOString();
  const sdpData: Omit<SiteDevelopmentPlan, 'id'> = {
    applicationId: '', // linked later or via project
    projectId,
    stage: 'preparation',
    checklist,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };

  const path = sdpPath(projectId);
  const docRef = await db.collection(path).add(sdpData as unknown as Record<string, unknown>);

  const sdp: SiteDevelopmentPlan = { id: docRef.id, ...sdpData };

  await auditFn({
    action: 'sdp_initiated',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    sdpId: docRef.id,
    details: { municipalityId, checklistItemCount: checklist.length },
  });

  return { success: true, data: sdp };
}

/**
 * Updates an SDP checklist item status.
 *
 * Validates:
 * - Status transition is permitted (not_started → in_progress → complete)
 * - Complete requires ≥1 linked drawing/document
 * - No reverse: complete → not_started not allowed
 */
export async function updateChecklistItem(
  sdpId: string,
  itemId: string,
  update: { status: SDPChecklistItemStatus; linkedDocumentIds?: string[] },
  projectId: string,
  actor: SDPActor,
  deps: SDPDeps
): Promise<ServiceResult<SiteDevelopmentPlan>> {
  const { db, auditFn } = deps;

  const path = sdpPath(projectId);
  const docSnap = await db.collection(path).doc(sdpId).get();

  if (!docSnap.exists) {
    return { success: false, error: `SDP '${sdpId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `SDP '${sdpId}' has no data` };
  }

  const checklist = (data.checklist as SDPChecklistItem[]) ?? [];
  const itemIndex = checklist.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    return { success: false, error: `Checklist item '${itemId}' not found in SDP` };
  }

  const item = checklist[itemIndex];
  const currentStatus = item.status;
  const targetStatus = update.status;

  // Validate transition
  const permitted = CHECKLIST_ITEM_TRANSITIONS[currentStatus] ?? [];
  if (!permitted.includes(targetStatus)) {
    return {
      success: false,
      error: `Invalid checklist item transition: '${currentStatus}' → '${targetStatus}'. Permitted: ${permitted.join(', ') || 'none (terminal state)'}`,
    };
  }

  // Complete requires linked drawing/document
  if (targetStatus === 'complete') {
    const docs = update.linkedDocumentIds ?? item.linkedDocumentIds ?? [];
    if (docs.length === 0) {
      return {
        success: false,
        error: 'Marking item as complete requires at least 1 linked drawing or document',
      };
    }
  }

  // Update the item
  const updatedItem: SDPChecklistItem = {
    ...item,
    status: targetStatus,
    linkedDocumentIds: update.linkedDocumentIds
      ? [...item.linkedDocumentIds, ...update.linkedDocumentIds]
      : item.linkedDocumentIds,
  };

  const updatedChecklist = [...checklist];
  updatedChecklist[itemIndex] = updatedItem;

  const now = new Date().toISOString();
  await db.collection(path).doc(sdpId).update({
    checklist: updatedChecklist as unknown as Record<string, unknown>[],
    updatedAt: now,
  });

  await auditFn({
    action: 'sdp_checklist_updated',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    sdpId,
    details: { itemId, previousStatus: currentStatus, newStatus: targetStatus },
  });

  const sdp: SiteDevelopmentPlan = {
    id: sdpId,
    ...(data as unknown as Omit<SiteDevelopmentPlan, 'id'>),
    checklist: updatedChecklist,
    updatedAt: now,
  };

  return { success: true, data: sdp };
}

/**
 * Transitions the SDP through its stage state machine.
 *
 * State machine:
 *   preparation → submitted (requires prerequisite check pass)
 *   submitted → under_review
 *   under_review → approved | amendments_required | rejected
 *   rejected → preparation (resubmit)
 *
 * On approval: updates Project Passport and exposes to readiness adapter.
 * On rejection: fires Action Centre alert.
 */
export async function transitionSDPStage(
  sdpId: string,
  targetStage: SDPStage,
  params: { notes?: string },
  projectId: string,
  actor: SDPActor,
  deps: SDPDeps
): Promise<ServiceResult<SiteDevelopmentPlan>> {
  const { db, auditFn, passportFn, readinessFn, actionCentreFn } = deps;

  const path = sdpPath(projectId);
  const docSnap = await db.collection(path).doc(sdpId).get();

  if (!docSnap.exists) {
    return { success: false, error: `SDP '${sdpId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `SDP '${sdpId}' has no data` };
  }

  const currentStage = data.stage as SDPStage;

  // Validate transition
  const permitted = SDP_STAGE_TRANSITIONS[currentStage] ?? [];
  if (!permitted.includes(targetStage)) {
    return {
      success: false,
      error: `Invalid SDP stage transition: '${currentStage}' → '${targetStage}'. Permitted: ${permitted.join(', ') || 'none (terminal state)'}`,
    };
  }

  // If transitioning to submitted, check prerequisites
  if (targetStage === 'submitted') {
    const prereqResult = await validatePrerequisites(sdpId, projectId, db);
    if (!prereqResult.canSubmit) {
      return {
        success: false,
        error: `Cannot submit SDP: ${prereqResult.blockers.join('; ')}`,
      };
    }
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    stage: targetStage,
    updatedAt: now,
  };

  if (targetStage === 'submitted') {
    updatePayload.submissionDate = now;
  }
  if (targetStage === 'under_review') {
    updatePayload.reviewDate = now;
  }
  if (['approved', 'amendments_required', 'rejected'].includes(targetStage)) {
    updatePayload.decisionDate = now;
    if (params.notes) {
      updatePayload.decisionNotes = params.notes;
    }
  }

  await db.collection(path).doc(sdpId).update(updatePayload);

  await auditFn({
    action: 'sdp_stage_transitioned',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    sdpId,
    details: { previousStage: currentStage, newStage: targetStage, notes: params.notes },
  });

  // On approval: update passport and expose to readiness adapter
  if (targetStage === 'approved') {
    if (passportFn) {
      await passportFn({ projectId, sdpId, stage: targetStage, approved: true });
    }
    if (readinessFn) {
      await readinessFn({ projectId, sdpId, sdpApproved: true });
    }
    if (actionCentreFn) {
      await actionCentreFn({ projectId, sdpId, alertType: 'sdp_approved', message: 'SDP has been approved' });
    }
  }

  // On rejection: fire Action Centre alert
  if (targetStage === 'rejected') {
    if (actionCentreFn) {
      await actionCentreFn({ projectId, sdpId, alertType: 'sdp_rejected', message: `SDP rejected: ${params.notes ?? 'No reason provided'}` });
    }
  }

  const sdp: SiteDevelopmentPlan = {
    id: sdpId,
    ...(data as unknown as Omit<SiteDevelopmentPlan, 'id'>),
    stage: targetStage,
    updatedAt: now,
    ...(targetStage === 'submitted' ? { submissionDate: now } : {}),
    ...(targetStage === 'under_review' ? { reviewDate: now } : {}),
    ...(['approved', 'amendments_required', 'rejected'].includes(targetStage) ? { decisionDate: now, decisionNotes: params.notes } : {}),
  };

  return { success: true, data: sdp };
}

/**
 * Validates prerequisites before SDP submission.
 *
 * Checks:
 * - SPLUMA application approved (decision = 'approved' or 'approved_with_conditions')
 * - Conditions compliant (all fulfilled/waived)
 *
 * Returns { canSubmit, blockers[] }
 */
export async function validatePrerequisites(
  sdpId: string,
  projectId: string,
  db: FirestoreDB
): Promise<PrerequisiteResult> {
  const blockers: string[] = [];

  // Check SPLUMA application status
  const appsPath = `projects/${projectId}/townPlanning/applications`;
  const appsSnapshot = await db.collection(appsPath).get();

  let hasApprovedSpluma = false;
  let applicationId: string | null = null;

  if (!appsSnapshot.empty) {
    for (const doc of appsSnapshot.docs) {
      const appData = doc.data();
      if (appData) {
        const outcome = appData.decisionOutcome as string | undefined;
        if (outcome === 'approved' || outcome === 'approved_with_conditions') {
          hasApprovedSpluma = true;
          applicationId = doc.id;
          break;
        }
      }
    }
  }

  if (!hasApprovedSpluma) {
    blockers.push('SPLUMA application must be approved before SDP submission');
  }

  // Check conditions compliance (if there's an approved application)
  if (applicationId) {
    const conditionsPath = `projects/${projectId}/townPlanning/applications/${applicationId}/conditions`;
    const condSnapshot = await db.collection(conditionsPath).get();

    if (!condSnapshot.empty) {
      for (const doc of condSnapshot.docs) {
        const condData = doc.data();
        if (condData) {
          const status = condData.status as string;
          if (status !== 'fulfilled' && status !== 'waived') {
            blockers.push('All conditions of approval must be fulfilled or waived before SDP submission');
            break;
          }
        }
      }
    }
  }

  return { canSubmit: blockers.length === 0, blockers };
}
