/**
 * Subdivision Engine Service
 *
 * Manages subdivision records, surveyor instructions, SG diagram processing,
 * and title deed endorsement workflows.
 *
 * SG Diagram State Machine:
 *   instruction_issued → survey_in_progress → diagram_prepared → diagram_lodged → approved | rejected
 *   rejected → diagram_prepared
 *
 * Title Deed Endorsement State Machine:
 *   pending → lodged → registered | rejected
 *
 * Uses DI pattern consistent with other town-planning services.
 */

import type { UserRole } from '@/types';
import type {
  SGDiagramStage,
  TitleDeedEndorsementStage,
  SubdivisionRecord,
} from '../types';
import type { FirestoreDB } from './municipalityConfig';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Permitted SG diagram stage transitions */
export const SG_DIAGRAM_TRANSITIONS: Record<SGDiagramStage, SGDiagramStage[]> = {
  instruction_issued: ['survey_in_progress'],
  survey_in_progress: ['diagram_prepared'],
  diagram_prepared: ['diagram_lodged'],
  diagram_lodged: ['approved', 'rejected'],
  approved: [],
  rejected: ['diagram_prepared'],
};

/** Permitted title deed endorsement stage transitions */
export const TITLE_DEED_TRANSITIONS: Record<TitleDeedEndorsementStage, TitleDeedEndorsementStage[]> = {
  pending: ['lodged'],
  lodged: ['registered', 'rejected'],
  registered: [],
  rejected: [],
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubdivisionActor {
  id: string;
  role: UserRole;
}

export interface SubdivisionAuditEntry {
  action: 'subdivision_created' | 'surveyor_instruction_generated' | 'sg_diagram_transitioned' | 'title_deed_transitioned' | 'property_register_updated';
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  projectId: string;
  subdivisionId: string;
  details: Record<string, unknown>;
}

export type SubdivisionAuditFn = (entry: SubdivisionAuditEntry) => Promise<void>;

export interface SubdivisionPassportPayload {
  projectId: string;
  subdivisionId: string;
  sgDiagramApproved: boolean;
  titleDeedRegistered: boolean;
  newErfNumbers: string[];
}

export type SubdivisionPassportFn = (payload: SubdivisionPassportPayload) => Promise<void>;

export interface SubdivisionActionCentrePayload {
  projectId: string;
  subdivisionId: string;
  alertType: 'surveyor_instruction' | 'sg_rejected' | 'title_deed_registered';
  message: string;
  targetRole?: string;
}

export type SubdivisionActionCentreFn = (payload: SubdivisionActionCentrePayload) => Promise<void>;

export interface TeamRouterPayload {
  projectId: string;
  requiredRole: string;
  reason: string;
}

export type TeamRouterFn = (payload: TeamRouterPayload) => Promise<void>;

export interface SubdivisionDeps {
  db: FirestoreDB;
  auditFn: SubdivisionAuditFn;
  passportFn?: SubdivisionPassportFn;
  actionCentreFn?: SubdivisionActionCentreFn;
  teamRouterFn?: TeamRouterFn;
}

export interface SubdivisionCreateParams {
  surveyorId?: string;
  surveyorName?: string;
  surveyorPlatoNumber?: string;
  notes?: string;
}

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Helper: Collection Path ─────────────────────────────────────────────────

function subdivisionPath(projectId: string): string {
  return `projects/${projectId}/townPlanning/subdivisions`;
}

// ─── Service Implementation ──────────────────────────────────────────────────

/**
 * Creates a new subdivision record linked to an application.
 *
 * Triggers Professional Team Router if no surveyor is assigned.
 */
export async function createSubdivisionRecord(
  applicationId: string,
  projectId: string,
  params: SubdivisionCreateParams,
  actor: SubdivisionActor,
  deps: SubdivisionDeps
): Promise<ServiceResult<SubdivisionRecord>> {
  const { db, auditFn, teamRouterFn } = deps;

  if (!applicationId || applicationId.trim().length === 0) {
    return { success: false, error: 'applicationId is required' };
  }
  if (!projectId || projectId.trim().length === 0) {
    return { success: false, error: 'projectId is required' };
  }

  const now = new Date().toISOString();

  const recordData: Omit<SubdivisionRecord, 'id'> = {
    applicationId,
    projectId,
    surveyorId: params.surveyorId,
    surveyorName: params.surveyorName,
    surveyorPlatoNumber: params.surveyorPlatoNumber,
    sgDiagramStage: 'instruction_issued',
    titleDeedStage: 'pending',
    newErfNumbers: [],
    notes: params.notes,
    createdAt: now,
    updatedAt: now,
  };

  const path = subdivisionPath(projectId);
  const docRef = await db.collection(path).add(recordData as unknown as Record<string, unknown>);

  const record: SubdivisionRecord = { id: docRef.id, ...recordData };

  await auditFn({
    action: 'subdivision_created',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    subdivisionId: docRef.id,
    details: { applicationId, surveyorAssigned: !!params.surveyorId },
  });

  // Trigger Professional Team Router when no surveyor assigned
  if (!params.surveyorId && teamRouterFn) {
    await teamRouterFn({
      projectId,
      requiredRole: 'land_surveyor',
      reason: 'Subdivision record created without assigned surveyor',
    });
  }

  return { success: true, data: record };
}

/**
 * Generates a surveyor instruction document.
 *
 * Surfaces to land_surveyor's Action Centre.
 */
export async function generateSurveyorInstruction(
  subdivisionId: string,
  projectId: string,
  actor: SubdivisionActor,
  deps: SubdivisionDeps
): Promise<ServiceResult<{ subdivisionId: string; instructionDocument: string }>> {
  const { db, auditFn, actionCentreFn } = deps;

  const path = subdivisionPath(projectId);
  const docSnap = await db.collection(path).doc(subdivisionId).get();

  if (!docSnap.exists) {
    return { success: false, error: `Subdivision record '${subdivisionId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `Subdivision record '${subdivisionId}' has no data` };
  }

  const now = new Date().toISOString();
  const instructionRef = `SI-${projectId.substring(0, 4).toUpperCase()}-${subdivisionId.substring(0, 4).toUpperCase()}-${Date.now()}`;

  await db.collection(path).doc(subdivisionId).update({
    instructionDocument: instructionRef,
    updatedAt: now,
  });

  await auditFn({
    action: 'surveyor_instruction_generated',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    subdivisionId,
    details: { instructionDocument: instructionRef },
  });

  // Surface to land_surveyor's Action Centre
  if (actionCentreFn) {
    await actionCentreFn({
      projectId,
      subdivisionId,
      alertType: 'surveyor_instruction',
      message: `Surveyor instruction issued: ${instructionRef}`,
      targetRole: 'land_surveyor',
    });
  }

  return { success: true, data: { subdivisionId, instructionDocument: instructionRef } };
}

/**
 * Transitions the SG diagram through its state machine.
 *
 * On approved: updates property register with new erf numbers.
 * On rejected: fires Action Centre alert.
 */
export async function transitionSGDiagramStage(
  subdivisionId: string,
  targetStage: SGDiagramStage,
  params: { sgDiagramReference?: string; newErfNumbers?: string[]; notes?: string },
  projectId: string,
  actor: SubdivisionActor,
  deps: SubdivisionDeps
): Promise<ServiceResult<SubdivisionRecord>> {
  const { db, auditFn, passportFn, actionCentreFn } = deps;

  const path = subdivisionPath(projectId);
  const docSnap = await db.collection(path).doc(subdivisionId).get();

  if (!docSnap.exists) {
    return { success: false, error: `Subdivision record '${subdivisionId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `Subdivision record '${subdivisionId}' has no data` };
  }

  const currentStage = data.sgDiagramStage as SGDiagramStage;

  // Validate transition
  const permitted = SG_DIAGRAM_TRANSITIONS[currentStage] ?? [];
  if (!permitted.includes(targetStage)) {
    return {
      success: false,
      error: `Invalid SG diagram transition: '${currentStage}' → '${targetStage}'. Permitted: ${permitted.join(', ') || 'none (terminal state)'}`,
    };
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    sgDiagramStage: targetStage,
    updatedAt: now,
  };

  if (params.sgDiagramReference) {
    updatePayload.sgDiagramReference = params.sgDiagramReference;
  }
  if (params.newErfNumbers && targetStage === 'approved') {
    updatePayload.newErfNumbers = params.newErfNumbers;
  }
  if (params.notes) {
    updatePayload.notes = params.notes;
  }

  await db.collection(path).doc(subdivisionId).update(updatePayload);

  await auditFn({
    action: 'sg_diagram_transitioned',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    subdivisionId,
    details: { previousStage: currentStage, newStage: targetStage, ...params },
  });

  // On approved: update property register with new erf numbers
  if (targetStage === 'approved' && params.newErfNumbers && params.newErfNumbers.length > 0) {
    // Write new erf numbers to property register
    const propertyPath = `projects/${projectId}/townPlanning/propertyRegister`;
    const propertySnapshot = await db.collection(propertyPath).get();
    if (!propertySnapshot.empty) {
      const propDoc = propertySnapshot.docs[0];
      await db.collection(propertyPath).doc(propDoc.id).update({
        newErfNumbers: params.newErfNumbers,
        updatedAt: now,
      });
    }

    await auditFn({
      action: 'property_register_updated',
      actorId: actor.id,
      actorRole: actor.role,
      timestamp: now,
      projectId,
      subdivisionId,
      details: { newErfNumbers: params.newErfNumbers },
    });

    // Update passport
    if (passportFn) {
      await passportFn({
        projectId,
        subdivisionId,
        sgDiagramApproved: true,
        titleDeedRegistered: false,
        newErfNumbers: params.newErfNumbers,
      });
    }
  }

  // On rejection: fire Action Centre alert
  if (targetStage === 'rejected' && actionCentreFn) {
    await actionCentreFn({
      projectId,
      subdivisionId,
      alertType: 'sg_rejected',
      message: `SG diagram rejected: ${params.notes ?? 'No reason provided'}`,
    });
  }

  const record: SubdivisionRecord = {
    id: subdivisionId,
    ...(data as unknown as Omit<SubdivisionRecord, 'id'>),
    sgDiagramStage: targetStage,
    updatedAt: now,
    ...(params.sgDiagramReference ? { sgDiagramReference: params.sgDiagramReference } : {}),
    ...(params.newErfNumbers && targetStage === 'approved' ? { newErfNumbers: params.newErfNumbers } : {}),
    ...(params.notes ? { notes: params.notes } : {}),
  };

  return { success: true, data: record };
}

/**
 * Transitions the title deed endorsement through its state machine.
 *
 * On registered: updates Project Passport.
 */
export async function transitionTitleDeedStage(
  subdivisionId: string,
  targetStage: TitleDeedEndorsementStage,
  params: { notes?: string },
  projectId: string,
  actor: SubdivisionActor,
  deps: SubdivisionDeps
): Promise<ServiceResult<SubdivisionRecord>> {
  const { db, auditFn, passportFn, actionCentreFn } = deps;

  const path = subdivisionPath(projectId);
  const docSnap = await db.collection(path).doc(subdivisionId).get();

  if (!docSnap.exists) {
    return { success: false, error: `Subdivision record '${subdivisionId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `Subdivision record '${subdivisionId}' has no data` };
  }

  const currentStage = data.titleDeedStage as TitleDeedEndorsementStage;

  // Validate transition
  const permitted = TITLE_DEED_TRANSITIONS[currentStage] ?? [];
  if (!permitted.includes(targetStage)) {
    return {
      success: false,
      error: `Invalid title deed transition: '${currentStage}' → '${targetStage}'. Permitted: ${permitted.join(', ') || 'none (terminal state)'}`,
    };
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    titleDeedStage: targetStage,
    updatedAt: now,
  };

  await db.collection(path).doc(subdivisionId).update(updatePayload);

  await auditFn({
    action: 'title_deed_transitioned',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    subdivisionId,
    details: { previousStage: currentStage, newStage: targetStage, notes: params.notes },
  });

  // On registered: update passport
  if (targetStage === 'registered') {
    if (passportFn) {
      const newErfNumbers = (data.newErfNumbers as string[]) ?? [];
      await passportFn({
        projectId,
        subdivisionId,
        sgDiagramApproved: data.sgDiagramStage === 'approved',
        titleDeedRegistered: true,
        newErfNumbers,
      });
    }
    if (actionCentreFn) {
      await actionCentreFn({
        projectId,
        subdivisionId,
        alertType: 'title_deed_registered',
        message: 'Title deed has been registered — subdivision complete',
      });
    }
  }

  const record: SubdivisionRecord = {
    id: subdivisionId,
    ...(data as unknown as Omit<SubdivisionRecord, 'id'>),
    titleDeedStage: targetStage,
    updatedAt: now,
  };

  return { success: true, data: record };
}
