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

// ─── In-Memory Store ─────────────────────────────────────────────────────────

const applications: PlanningApplication[] = [];
const stageTransitions: StageTransition[] = [];
let referenceSequence = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generates a unique reference number in the format TP-{YEAR}-{SEQ}.
 * Sequential counter is zero-padded to 3 digits.
 */
function generateReferenceNumber(): string {
  referenceSequence += 1;
  const year = new Date().getFullYear();
  const seq = String(referenceSequence).padStart(3, '0');
  return `${REFERENCE_NUMBER_PREFIX}-${year}-${seq}`;
}

/**
 * Generates a simple unique ID for records.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ─── Application CRUD ────────────────────────────────────────────────────────

/**
 * Creates a new planning application with initial stage set to `pre_consultation`
 * and status set to `draft`. Generates a unique reference number.
 */
export function createApplication(params: {
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
}): PlanningApplication {
  const now = new Date().toISOString();
  const application: PlanningApplication = {
    id: generateId(),
    tenantId: params.tenantId,
    projectId: params.projectId,
    referenceNumber: generateReferenceNumber(),
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

  applications.push(application);
  return application;
}

/**
 * Returns a single application by ID, or null if not found.
 */
export function getApplication(applicationId: string): PlanningApplication | null {
  return applications.find((app) => app.id === applicationId) ?? null;
}

/**
 * Returns all applications for a given project.
 */
export function getApplicationsByProject(projectId: string): PlanningApplication[] {
  return applications.filter((app) => app.projectId === projectId);
}

/**
 * Returns all applications assigned to a specific town planner.
 */
export function getApplicationsByTownPlanner(townPlannerId: string): PlanningApplication[] {
  return applications.filter((app) => app.assignedTownPlannerId === townPlannerId);
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
export function validateStageGate(
  applicationId: string,
  documents: DocumentChecklistItem[] = [],
  triggers: EnvironmentalHeritageTrigger[] = []
): StageGateResult {
  const application = getApplication(applicationId);
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
        id: generateId(),
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
export function getCurrentStageRequirements(
  applicationId: string,
  documents: DocumentChecklistItem[] = []
): StageRequirement[] {
  const application = getApplication(applicationId);
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
export function advanceStage(
  applicationId: string,
  userId: string,
  notes: string,
  documents: DocumentChecklistItem[] = [],
  triggers: EnvironmentalHeritageTrigger[] = []
): StageTransition {
  const application = getApplication(applicationId);
  if (!application) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  // Validate stage gate
  const gateResult = validateStageGate(applicationId, documents, triggers);
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
  const transition: StageTransition = {
    id: generateId(),
    applicationId,
    fromStage,
    toStage,
    transitionedBy: userId,
    transitionedAt: new Date().toISOString(),
    notes,
    documentsVerified: gateResult.missingDocuments.length === 0,
  };

  stageTransitions.push(transition);

  // Update the application's current stage
  application.currentStage = toStage;
  application.updatedAt = new Date().toISOString();

  // Auto-set status to active when entering circulation_advertising (if still draft)
  if (toStage === 'circulation_advertising' && application.status === 'draft') {
    application.status = 'active';
  }

  return transition;
}

// ─── Status Management ───────────────────────────────────────────────────────

/**
 * Updates the application status.
 */
export function updateStatus(applicationId: string, status: ApplicationStatus): void {
  const application = getApplication(applicationId);
  if (!application) {
    throw new Error(`Application not found: ${applicationId}`);
  }
  application.status = status;
  application.updatedAt = new Date().toISOString();
}

/**
 * Sets status to `deemed_refused`.
 * Called when 60-day decision period expires without a decision per SPLUMA Section 56.
 */
export function markDeemedRefused(applicationId: string): void {
  const application = getApplication(applicationId);
  if (!application) {
    throw new Error(`Application not found: ${applicationId}`);
  }
  application.status = 'deemed_refused';
  application.updatedAt = new Date().toISOString();
}

// ─── Test Helpers (for resetting state in tests) ─────────────────────────────

/**
 * Resets the in-memory store. Only intended for use in tests.
 */
export function _resetStore(): void {
  applications.length = 0;
  stageTransitions.length = 0;
  referenceSequence = 0;
}

/**
 * Returns all stored stage transitions. Useful for assertions in tests.
 */
export function _getTransitions(): StageTransition[] {
  return [...stageTransitions];
}
