/**
 * Planning Integration Service — Orchestrates all integrations between the
 * Town Planning module and the Architex platform spine.
 *
 * Provides typed contracts for: Project Passport, SpecForge, Compliance Hub,
 * Survey Module, Document Register, Action Centre, and Audit Trail.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 7.1, 7.2
 */

import type {
  PlanningApplication,
  Condition,
  MunicipalityProfile,
  DocumentChecklistItem,
  PlanningApplicationType,
  PlanningStage,
} from '../types';

import { DEFAULT_DOCUMENT_TYPES } from '../constants';
import type { Priority } from '../constants';

// ── Helpers ─────────────────────────────────────────────────────────────────

let idCounter = 0;
function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// ── Project Passport ────────────────────────────────────────────────────────

/**
 * Updates the Project Passport with current planning application status.
 * Stub — will wire to projectPassportService.buildProjectPassport() once connected.
 */
export function updateProjectPassportPlanning(
  _projectId: string,
  _application: PlanningApplication,
): void {
  // Integration stub — writes planning status to Project Passport
}

/**
 * Reports planning-related risk flags to the Project Passport risk engine.
 * Stub — will wire to riskEngine.evaluateRisks() once connected.
 */
export function reportPlanningRisk(
  _projectId: string,
  _riskFlags: string[],
): void {
  // Integration stub — reports risk flags to Project Passport
}

// ── SpecForge ───────────────────────────────────────────────────────────────

/**
 * Writes Record of Decision conditions to SpecForge as specification items.
 * Stub — will wire to specforgeApiClient.createItem() once connected.
 */
export function writeConditionsToSpecForge(
  _projectId: string,
  _conditions: Condition[],
): void {
  // Integration stub — writes conditions as SpecForge spec items
}

// ── Compliance Hub ──────────────────────────────────────────────────────────

/**
 * Notifies the Compliance Hub that planning approval is complete for a project.
 * Stub — will wire to compliance hub notification system once connected.
 */
export function notifyPlanningApprovalComplete(
  _projectId: string,
  _applicationId: string,
): void {
  // Integration stub — notifies Compliance Hub of planning approval
}

// ── Survey Module ───────────────────────────────────────────────────────────

/**
 * Creates a handoff record to the Survey Module for post-approval survey work.
 * Stub — will wire to Survey Module service once connected.
 */
export function createSurveyHandoff(_params: {
  projectId: string;
  applicationId: string;
  approvalDetails: string;
  conditionReferences: string[];
  workRequired: string[];
}): void {
  // Integration stub — creates survey handoff record
}

// ── Document Register ───────────────────────────────────────────────────────

/**
 * Generates a document checklist for an application based on its type and
 * the municipality profile's required forms.
 *
 * Creates DocumentChecklistItem records for all stages of the given application
 * type using DEFAULT_DOCUMENT_TYPES, plus any additional forms from the
 * municipality profile.
 *
 * @param applicationId - The planning application ID
 * @param applicationType - The application type determining which documents are needed
 * @param profile - Optional municipality profile with additional required forms
 * @returns Array of DocumentChecklistItem records
 */
export function generateDocumentChecklist(
  applicationId: string,
  applicationType: PlanningApplicationType,
  profile?: MunicipalityProfile,
): DocumentChecklistItem[] {
  const checklist: DocumentChecklistItem[] = [];
  const docTypesByStage = DEFAULT_DOCUMENT_TYPES[applicationType] ?? {};

  // Generate from DEFAULT_DOCUMENT_TYPES
  for (const [stage, docTypes] of Object.entries(docTypesByStage)) {
    for (const docType of docTypes as string[]) {
      checklist.push({
        id: generateId('chk'),
        applicationId,
        documentType: docType,
        description: docType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        required: true,
        stage: stage as PlanningStage,
        status: 'required',
      });
    }
  }

  // Add municipality-specific required forms
  if (profile) {
    const municipalityForms = profile.requiredForms.filter((form) =>
      form.applicationType.includes(applicationType),
    );
    for (const form of municipalityForms) {
      // Avoid duplicates
      const exists = checklist.some(
        (item) => item.documentType === form.name && item.stage === form.stage,
      );
      if (!exists) {
        checklist.push({
          id: generateId('chk'),
          applicationId,
          documentType: form.name,
          description: form.name,
          required: true,
          stage: form.stage,
          status: 'required',
        });
      }
    }
  }

  return checklist;
}

/**
 * Registers a document in the Documents & Drawing Intelligence module.
 * Stub — will wire to documentRegisterService once connected.
 */
export function registerDocument(
  _applicationId: string,
  _documentId: string,
  _documentType: string,
  _metadata: Record<string, string>,
): void {
  // Integration stub — registers document in the Document Register
}

// ── Action Centre ───────────────────────────────────────────────────────────

/**
 * Surfaces an action in the Action Centre / Inbox with priority and due date.
 * Stub — will wire to inboxEventAdapter.createWorkflowEvent() once connected.
 */
export function surfaceAction(_params: {
  applicationId: string;
  projectId: string;
  priority: Priority;
  title: string;
  dueDate?: string;
  assignedRoles: string[];
}): void {
  // Integration stub — surfaces action in Action Centre
}

// ── Audit Trail ─────────────────────────────────────────────────────────────

/**
 * Writes an audit event to the platform Audit Trail.
 * Stub — will wire to auditTrailService.createAuditEntry() once connected.
 */
export function auditEvent(_params: {
  applicationId: string;
  projectId: string;
  action: string;
  actorId: string;
  details?: Record<string, unknown>;
}): void {
  // Integration stub — writes audit event
}
