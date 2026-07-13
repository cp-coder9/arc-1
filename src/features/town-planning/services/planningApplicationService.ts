import type {
  PlanningApplication,
  PlanningStage,
  ApplicationStatus,
  StageTransition,
  StageGateResult,
  StageRequirement,
  DocumentChecklistItem,
  EnvironmentalHeritageTrigger,
  ContactDetails,
  PlanningApplicationType,
} from '../types';

import { PLANNING_STAGES, REFERENCE_NUMBER_PREFIX, DEFAULT_DOCUMENT_TYPES } from '../constants';
import { adminDb } from '@/lib/firebase-admin';

// ─── Firestore Collections ───────────────────────────────────────────────────

const applicationsCollection = () => adminDb.collection('planning_applications');
const transitionsCollection = () => adminDb.collection('planning_stage_transitions');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generates a unique reference number in the format TP-{YEAR}-{SEQ}.
 * Uses Firestore counter document for atomic sequencing.
 */
async function generateReferenceNumber(): Promise<string> {
  const counterRef = adminDb.collection('planning_counters').doc('reference_sequence');
  const result = await adminDb.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()?.value ?? 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  const year = new Date().getFullYear();
  const seq = String(result).padStart(3, '0');
  return `${REFERENCE_NUMBER_PREFIX}-${year}-${seq}`;
}

// ─── Application CRUD ────────────────────────────────────────────────────────

/**
 * Creates a new planning application with initial stage set to `pre_consultation`
 * and status set to `draft`. Generates a unique reference number.
 */
export async function createApplication(params: {
  projectId: string;
  tenantId: string;
  applicationType: PlanningApplicationType;
  municipalityId: string;
  assignedTownPlannerId: string;
  propertyDescription: string;
  erfNumber: string;
  titleDeedReference: string;
  applicantName: string;
  applicantContactDetails: ContactDetails;
}): Promise<PlanningApplication> {
  const now = new Date().toISOString();
  const referenceNumber = await generateReferenceNumber();
  const docRef = applicationsCollection().doc();

  const application: PlanningApplication = {
    id: docRef.id,
    tenantId: params.tenantId,
    projectId: params.projectId,
    referenceNumber,
    applicationType: params.applicationType,
    currentStage: 'pre_consultation',
    status: 'draft',
    municipalityId: params.municipalityId,
    assignedTownPlannerId: params.assignedTownPlannerId,
    propertyDescription: params.propertyDescription,
    erfNumber: params.erfNumber,
    titleDeedReference: params.titleDeedReference,
    applicantName: params.applicantName,
    applicantContactDetails: params.applicantContactDetails,
    interdependencies: [],
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(application);
  return application;
}

/**
 * Returns a single application by ID, or null if not found.
 */
export async function getApplication(applicationId: string): Promise<PlanningApplication | null> {
  const doc = await applicationsCollection().doc(applicationId).get();
  if (!doc.exists) return null;
  return doc.data() as PlanningApplication;
}

/**
 * Returns all applications for a given project.
 */
export async function getApplicationsByProject(projectId: string): Promise<PlanningApplication[]> {
  const snapshot = await applicationsCollection()
    .where('projectId', '==', projectId)
    .get();
  return snapshot.docs.map((doc) => doc.data() as PlanningApplication);
}

/**
 * Returns all applications assigned to a specific town planner.
 */
export async function getApplicationsByTownPlanner(townPlannerId: string): Promise<PlanningApplication[]> {
  const snapshot = await applicationsCollection()
    .where('assignedTownPlannerId', '==', townPlannerId)
    .get();
  return snapshot.docs.map((doc) => doc.data() as PlanningApplication);
}

// ─── Stage Management ────────────────────────────────────────────────────────

/**
 * Returns the numeric index (0-9) of a planning stage.
 */
export function getStageIndex(stage: PlanningStage): number {
  const index = PLANNING_STAGES.findIndex((s) => s.id === stage);
  return index;
}

/**
 * Returns the next stage in the sequential lifecycle, or null if at completion.
 */
export function getNextStage(currentStage: PlanningStage): PlanningStage | null {
  const currentIndex = getStageIndex(currentStage);
  if (currentIndex < 0 || currentIndex >= PLANNING_STAGES.length - 1) {
    return null;
  }
  return PLANNING_STAGES[currentIndex + 1].id;
}

/**
 * Validates whether an application can advance to the next stage.
 * Checks:
 * - All required documents for the current stage are uploaded
 * - No unresolved parallel process blockers at tribunal_decision stage
 */
export async function validateStageGate(
  applicationId: string,
  documents: DocumentChecklistItem[] = [],
  triggers: EnvironmentalHeritageTrigger[] = []
): Promise<StageGateResult> {
  const application = await getApplication(applicationId);
  if (!application) {
    return {
      canAdvance: false,
      missingDocuments: [],
      missingActions: [],
      blockers: ['Application not found'],
      parallelProcessBlockers: [],
    };
  }

  const currentStage = application.currentStage;
  const missingDocuments: DocumentChecklistItem[] = [];
  const missingActions: string[] = [];
  const blockers: string[] = [];
  const parallelProcessBlockers: EnvironmentalHeritageTrigger[] = [];

  // Check required documents for the current stage
  const requiredDocTypes =
    DEFAULT_DOCUMENT_TYPES[application.applicationType]?.[currentStage] ?? [];

  for (const docType of requiredDocTypes) {
    const doc = documents.find(
      (d) => d.documentType === docType && d.stage === currentStage && d.applicationId === applicationId
    );
    if (!doc || doc.status === 'required') {
      missingDocuments.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        applicationId,
        documentType: docType,
        description: `Required: ${docType}`,
        required: true,
        stage: currentStage,
        status: 'required',
      });
    }
  }

  // Check parallel process blockers at tribunal_decision stage
  if (currentStage === 'tribunal_decision') {
    const unresolvedTriggers = triggers.filter(
      (t) =>
        t.applicationId === applicationId &&
        t.confirmed &&
        t.parallelProcessStatus !== 'resolved' &&
        t.parallelProcessStatus !== 'deferred'
    );
    parallelProcessBlockers.push(...unresolvedTriggers);
    if (unresolvedTriggers.length > 0) {
      blockers.push(
        'Unresolved environmental/heritage parallel processes must be resolved before advancing past Tribunal/Decision'
      );
    }
  }

  // Cannot advance from completion
  if (getNextStage(currentStage) === null) {
    blockers.push('Application is at the final stage and cannot advance further');
  }

  const canAdvance =
    missingDocuments.length === 0 &&
    missingActions.length === 0 &&
    blockers.length === 0 &&
    parallelProcessBlockers.length === 0;

  return {
    canAdvance,
    missingDocuments,
    missingActions,
    blockers,
    parallelProcessBlockers,
  };
}

/**
 * Returns an array of StageRequirement objects showing what's needed for the
 * current stage and their fulfilment status.
 */
export async function getCurrentStageRequirements(
  applicationId: string,
  documents: DocumentChecklistItem[] = []
): Promise<StageRequirement[]> {
  const application = await getApplication(applicationId);
  if (!application) {
    return [];
  }

  const currentStage = application.currentStage;
  const requirements: StageRequirement[] = [];

  // Build document requirements for the current stage
  const requiredDocTypes =
    DEFAULT_DOCUMENT_TYPES[application.applicationType]?.[currentStage] ?? [];

  for (const docType of requiredDocTypes) {
    const doc = documents.find(
      (d) => d.documentType === docType && d.stage === currentStage && d.applicationId === applicationId
    );
    const met = doc !== undefined && doc.status !== 'required';

    requirements.push({
      description: `Upload ${docType.replace(/_/g, ' ')}`,
      type: 'document',
      met,
      linkedItemId: doc?.id,
    });
  }

  return requirements;
}

/**
 * Advances the application to the next sequential stage.
 * Validates the stage gate first — if canAdvance is false, throws an error.
 * Creates a StageTransition record, updates the application's currentStage.
 * If advancing to `circulation_advertising`, auto-sets status to `active` (if still `draft`).
 */
export async function advanceStage(
  applicationId: string,
  userId: string,
  notes: string,
  documents: DocumentChecklistItem[] = [],
  triggers: EnvironmentalHeritageTrigger[] = []
): Promise<StageTransition> {
  const application = await getApplication(applicationId);
  if (!application) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  // Validate stage gate
  const gateResult = await validateStageGate(applicationId, documents, triggers);
  if (!gateResult.canAdvance) {
    const reasons = [
      ...gateResult.blockers,
      ...gateResult.missingDocuments.map((d) => `Missing document: ${d.documentType}`),
      ...gateResult.missingActions,
      ...gateResult.parallelProcessBlockers.map(
        (t) => `Unresolved trigger: ${t.triggerType} — ${t.reason}`
      ),
    ];
    throw new Error(`Cannot advance stage: ${reasons.join('; ')}`);
  }

  const fromStage = application.currentStage;
  const toStage = getNextStage(fromStage);
  if (!toStage) {
    throw new Error('Application is already at the final stage');
  }

  // Create transition record
  const transitionRef = transitionsCollection().doc();
  const transition: StageTransition = {
    id: transitionRef.id,
    applicationId,
    fromStage,
    toStage,
    transitionedBy: userId,
    transitionedAt: new Date().toISOString(),
    notes,
    documentsVerified: gateResult.missingDocuments.length === 0,
  };

  await transitionRef.set(transition);

  // Update the application's current stage
  const updateData: Record<string, unknown> = {
    currentStage: toStage,
    updatedAt: new Date().toISOString(),
  };

  // Auto-set status to active when entering circulation_advertising (if still draft)
  if (toStage === 'circulation_advertising' && application.status === 'draft') {
    updateData.status = 'active';
  }

  await applicationsCollection().doc(applicationId).update(updateData);

  return transition;
}

// ─── Status Management ───────────────────────────────────────────────────────

/**
 * Updates the application status.
 */
export async function updateStatus(applicationId: string, status: ApplicationStatus): Promise<void> {
  const doc = await applicationsCollection().doc(applicationId).get();
  if (!doc.exists) {
    throw new Error(`Application not found: ${applicationId}`);
  }
  await applicationsCollection().doc(applicationId).update({
    status,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Sets status to `deemed_refused`.
 * Called when 60-day decision period expires without a decision per SPLUMA Section 56.
 */
export async function markDeemedRefused(applicationId: string): Promise<void> {
  const doc = await applicationsCollection().doc(applicationId).get();
  if (!doc.exists) {
    throw new Error(`Application not found: ${applicationId}`);
  }
  await applicationsCollection().doc(applicationId).update({
    status: 'deemed_refused',
    updatedAt: new Date().toISOString(),
  });
}

// ─── Test Helpers (for resetting state in tests) ─────────────────────────────

/**
 * Resets the Firestore collections. Only intended for use in tests.
 */
export async function _resetStore(): Promise<void> {
  const appSnapshot = await applicationsCollection().get();
  const transSnapshot = await transitionsCollection().get();
  const batch = adminDb.batch();
  appSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  transSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  // Reset counter
  await adminDb.collection('planning_counters').doc('reference_sequence').set({ value: 0 });
}

/**
 * Returns all stored stage transitions. Useful for assertions in tests.
 */
export async function _getTransitions(): Promise<StageTransition[]> {
  const snapshot = await transitionsCollection().get();
  return snapshot.docs.map((doc) => doc.data() as StageTransition);
}
