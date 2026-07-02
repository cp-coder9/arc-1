/**
 * Application Engine Service
 *
 * Manages SPLUMA land use application creation, retrieval, and listing.
 * Supports all application types with type-specific validation,
 * unique reference number generation, and integration with
 * audit trail and Project Passport.
 *
 * Uses DI pattern consistent with municipalityConfig service.
 */

import { z } from 'zod';
import type { UserRole } from '@/types';
import type {
  ApplicationType,
  ApplicationStage,
  LandUseApplication,
} from '../types';
import type { FirestoreDB, CollectionRef, QuerySnapshot } from './municipalityConfig';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ApplicationTypeEnum = z.enum([
  'rezoning',
  'departure',
  'subdivision',
  'consolidation',
  'removal_of_restrictive_conditions',
  'township_establishment',
  'consent_use',
  'amendment_of_scheme',
]);

/**
 * Base schema for creating an application — fields common to all types.
 */
const BaseCreateApplicationParamsSchema = z.object({
  applicationType: ApplicationTypeEnum,
  municipalityId: z.string().min(1, 'Municipality ID is required'),
  propertyId: z.string().min(1, 'Property ID is required'),
  applicantName: z.string().min(1, 'Applicant name is required'),
  applicantContact: z.string().min(1, 'Applicant contact is required'),
  description: z.string().min(1, 'Description is required'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Type-specific detail schemas.
 */
const RezoningDetailsSchema = z.object({
  currentZoning: z.string().min(1),
  proposedZoning: z.string().min(1),
  motivation: z.string().min(1),
});

const DepartureDetailsSchema = z.object({
  departureType: z.string().min(1),
  extent: z.string().min(1),
  motivation: z.string().min(1),
});

const SubdivisionDetailsSchema = z.object({
  numberOfPortions: z.number().int().min(2),
  layoutDescription: z.string().min(1),
});

const RestrictiveConditionDetailsSchema = z.object({
  conditionReference: z.string().min(1),
  conditionText: z.string().min(1),
  reasonForRemoval: z.string().min(1),
});

/**
 * Full schema with type-specific required fields via discriminated union-like refinement.
 */
export const CreateApplicationParamsSchema = BaseCreateApplicationParamsSchema.extend({
  rezoningDetails: RezoningDetailsSchema.optional(),
  departureDetails: DepartureDetailsSchema.optional(),
  subdivisionDetails: SubdivisionDetailsSchema.optional(),
  restrictiveConditionDetails: RestrictiveConditionDetailsSchema.optional(),
}).superRefine((data, ctx) => {
  switch (data.applicationType) {
    case 'rezoning':
      if (!data.rezoningDetails) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'rezoningDetails is required for rezoning applications',
          path: ['rezoningDetails'],
        });
      }
      break;
    case 'departure':
      if (!data.departureDetails) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'departureDetails is required for departure applications',
          path: ['departureDetails'],
        });
      }
      break;
    case 'subdivision':
    case 'consolidation':
      if (!data.subdivisionDetails) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'subdivisionDetails is required for subdivision/consolidation applications',
          path: ['subdivisionDetails'],
        });
      }
      break;
    case 'removal_of_restrictive_conditions':
      if (!data.restrictiveConditionDetails) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'restrictiveConditionDetails is required for removal of restrictive conditions applications',
          path: ['restrictiveConditionDetails'],
        });
      }
      break;
    // township_establishment, consent_use, amendment_of_scheme have no extra required fields
  }
});

export type CreateApplicationParams = z.infer<typeof CreateApplicationParamsSchema>;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActorContext {
  id: string;
  role: UserRole;
}

export interface ApplicationAuditEntry {
  action: 'application_created';
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  projectId: string;
  applicationId: string;
  applicationType: ApplicationType;
  referenceNumber: string;
}

export interface PassportWritePayload {
  projectId: string;
  applicationId: string;
  applicationType: ApplicationType;
  status: ApplicationStage;
  referenceNumber: string;
}

/** Audit function type for DI */
export type ApplicationAuditFn = (entry: ApplicationAuditEntry) => Promise<void>;

/** Passport write function type for DI */
export type PassportFn = (payload: PassportWritePayload) => Promise<void>;

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Reference Number Generation ─────────────────────────────────────────────

/**
 * Generates a unique reference number for a new application.
 * Format: TP-{first 4 chars of projectId}-{sequential number padded to 3 digits}
 *
 * Looks at existing applications in the project to determine the next sequence number.
 */
export async function generateReferenceNumber(
  projectId: string,
  db: FirestoreDB
): Promise<string> {
  const projectShort = projectId.substring(0, 4).toUpperCase();
  const collectionPath = `projects/${projectId}/townPlanning/applications`;

  let nextSeq = 1;
  try {
    const snapshot: QuerySnapshot = await db.collection(collectionPath).get();
    if (!snapshot.empty) {
      nextSeq = snapshot.docs.length + 1;
    }
  } catch {
    // If collection doesn't exist yet, start at 1
    nextSeq = 1;
  }

  const seqStr = String(nextSeq).padStart(3, '0');
  return `TP-${projectShort}-${seqStr}`;
}

// ─── Service Implementation ──────────────────────────────────────────────────

/**
 * Creates a new land use application.
 *
 * - Validates input with CreateApplicationParamsSchema (base + type-specific)
 * - Generates unique reference number (TP-{projectShort}-{seq})
 * - Sets initial stage to 'preparation'
 * - Persists to Firestore at projects/{projectId}/townPlanning/applications/{id}
 * - Creates audit trail entry
 * - Writes to Project Passport via adapter
 * - Returns created LandUseApplication
 */
export async function createApplication(
  projectId: string,
  params: unknown,
  actor: ActorContext,
  deps: {
    db: FirestoreDB;
    auditFn: ApplicationAuditFn;
    passportFn: PassportFn;
  }
): Promise<ServiceResult<LandUseApplication>> {
  const { db, auditFn, passportFn } = deps;

  // Validate projectId
  if (!projectId || projectId.trim().length === 0) {
    return { success: false, error: 'projectId is required' };
  }

  // Validate input against schema
  const parsed = CreateApplicationParamsSchema.safeParse(params);
  if (!parsed.success) {
    const messages = parsed.error.errors.map((e) => e.message).join(', ');
    return { success: false, error: `Validation failed: ${messages}` };
  }

  const validParams = parsed.data;

  // Generate unique reference number
  const referenceNumber = await generateReferenceNumber(projectId, db);

  // Build application record
  const now = new Date().toISOString();
  const initialStage: ApplicationStage = 'preparation';

  const applicationData: Omit<LandUseApplication, 'id'> = {
    projectId,
    referenceNumber,
    applicationType: validParams.applicationType,
    stage: initialStage,
    municipalityId: validParams.municipalityId,
    propertyId: validParams.propertyId,
    applicantName: validParams.applicantName,
    applicantContact: validParams.applicantContact,
    description: validParams.description,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
    metadata: {
      ...validParams.metadata,
      ...(validParams.rezoningDetails ? { rezoningDetails: validParams.rezoningDetails } : {}),
      ...(validParams.departureDetails ? { departureDetails: validParams.departureDetails } : {}),
      ...(validParams.subdivisionDetails ? { subdivisionDetails: validParams.subdivisionDetails } : {}),
      ...(validParams.restrictiveConditionDetails ? { restrictiveConditionDetails: validParams.restrictiveConditionDetails } : {}),
    },
  };

  // Persist to Firestore
  const collectionPath = `projects/${projectId}/townPlanning/applications`;
  const docRef = await db.collection(collectionPath).add(applicationData as unknown as Record<string, unknown>);

  const application: LandUseApplication = {
    id: docRef.id,
    ...applicationData,
  };

  // Create audit trail record
  await auditFn({
    action: 'application_created',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    applicationId: docRef.id,
    applicationType: validParams.applicationType,
    referenceNumber,
  });

  // Write to Project Passport
  await passportFn({
    projectId,
    applicationId: docRef.id,
    applicationType: validParams.applicationType,
    status: initialStage,
    referenceNumber,
  });

  return { success: true, data: application };
}

/**
 * Fetches a single application by ID within a project.
 */
export async function getApplication(
  applicationId: string,
  projectId: string,
  db: FirestoreDB
): Promise<LandUseApplication | null> {
  const collectionPath = `projects/${projectId}/townPlanning/applications`;
  const docSnap = await db.collection(collectionPath).doc(applicationId).get();

  if (!docSnap.exists) {
    return null;
  }

  const data = docSnap.data();
  if (!data) return null;

  return {
    id: docSnap.id,
    ...data,
  } as LandUseApplication;
}

/**
 * Lists all applications for a given project.
 * Supports multiple concurrent applications per project.
 */
export async function listApplicationsByProject(
  projectId: string,
  db: FirestoreDB
): Promise<LandUseApplication[]> {
  const collectionPath = `projects/${projectId}/townPlanning/applications`;
  const snapshot: QuerySnapshot = await db.collection(collectionPath).get();

  if (snapshot.empty) {
    return [];
  }

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as LandUseApplication[];
}

// ─── Document Checklist Types ────────────────────────────────────────────────

import type { ChecklistItemStatus, DocumentChecklistItem as BaseChecklistItem } from '../types';

export interface DocChecklistItem extends BaseChecklistItem {
  notApplicableReason?: string;
}

export interface ChecklistCompletenessIndicator {
  total: number;
  uploaded: number;
  outstanding: number;
  notApplicable: number;
}

export interface SubmissionReadiness {
  ready: boolean;
  outstanding: string[];
}

export interface ChecklistItemUpdate {
  status: ChecklistItemStatus;
  documentId?: string;
  notApplicableReason?: string;
}

/** Permitted checklist item status transitions */
export const DOCUMENT_CHECKLIST_TRANSITIONS: Record<ChecklistItemStatus, ChecklistItemStatus[]> = {
  required: ['uploaded', 'not_applicable'],
  uploaded: ['required'], // replacement
  not_applicable: [],
};

// ─── Standard Document Lists ─────────────────────────────────────────────────

const STANDARD_DOCUMENTS: { name: string; description: string }[] = [
  { name: 'Application Form', description: 'Completed and signed SPLUMA application form' },
  { name: 'Title Deed', description: 'Certified copy of title deed for the property' },
  { name: 'SG Diagram', description: 'Surveyor General diagram of the property' },
  { name: 'Power of Attorney', description: 'Letter of authority if applicant is an agent' },
  { name: 'Proof of Payment', description: 'Receipt or proof of application fee payment' },
  { name: 'Memorandum', description: 'Motivation memorandum supporting the application' },
];

const TYPE_SPECIFIC_DOCUMENTS: Partial<Record<ApplicationType, { name: string; description: string }[]>> = {
  rezoning: [
    { name: 'Site Development Plan', description: 'SDP showing proposed development layout' },
    { name: 'Impact Assessments', description: 'Traffic, environmental, and/or heritage impact assessments' },
  ],
  departure: [
    { name: 'Site Development Plan', description: 'SDP showing proposed departure layout' },
    { name: 'Impact Assessments', description: 'Relevant impact assessments for the departure' },
  ],
  subdivision: [
    { name: 'Layout Plan', description: 'Subdivision layout plan prepared by surveyor' },
    { name: 'Surveyor Report', description: 'Professional surveyor report with calculations' },
  ],
  consolidation: [
    { name: 'Layout Plan', description: 'Consolidation layout plan prepared by surveyor' },
    { name: 'Surveyor Report', description: 'Professional surveyor report with calculations' },
  ],
};

// ─── Document Checklist Implementation ───────────────────────────────────────

/**
 * Generates a document checklist for an application.
 *
 * Combines:
 * - Standard documents (app form, title deed, SG diagram, POA, payment proof, memorandum)
 * - Type-specific additions (rezoning: SDP + impacts; subdivision: layout + surveyor report)
 * - Municipality-specific extras from the municipality profile
 */
export async function generateDocumentChecklist(
  applicationId: string,
  projectId: string,
  db: FirestoreDB
): Promise<ServiceResult<DocChecklistItem[]>> {
  // Fetch application to determine type and municipality
  const app = await getApplication(applicationId, projectId, db);
  if (!app) {
    return { success: false, error: `Application '${applicationId}' not found` };
  }

  const items: DocChecklistItem[] = [];

  // Add standard documents
  STANDARD_DOCUMENTS.forEach((doc, idx) => {
    items.push({
      id: `std-${idx + 1}`,
      name: doc.name,
      description: doc.description,
      status: 'required',
      isTypeSpecific: false,
    });
  });

  // Add type-specific documents
  const typeSpecific = TYPE_SPECIFIC_DOCUMENTS[app.applicationType] ?? [];
  typeSpecific.forEach((doc, idx) => {
    items.push({
      id: `type-${idx + 1}`,
      name: doc.name,
      description: doc.description,
      status: 'required',
      isTypeSpecific: true,
      applicationType: app.applicationType,
    });
  });

  // Add municipality-specific extras
  const muniDoc = await db.collection('municipalityProfiles').doc(app.municipalityId).get();
  if (muniDoc.exists) {
    const muniData = muniDoc.data();
    if (muniData?.requiredDocuments) {
      const muniDocs = muniData.requiredDocuments as string[];
      muniDocs.forEach((docName, idx) => {
        items.push({
          id: `muni-${idx + 1}`,
          name: docName,
          description: `Municipality-specific requirement: ${docName}`,
          status: 'required',
          isTypeSpecific: false,
        });
      });
    }
  }

  // Persist the checklist
  const checklistPath = `projects/${projectId}/townPlanning/applications/${applicationId}/checklist`;
  for (const item of items) {
    await db.collection(checklistPath).add(item as unknown as Record<string, unknown>);
  }

  return { success: true, data: items };
}

/**
 * Updates a checklist item's status.
 *
 * Permitted transitions:
 * - required → uploaded (with documentId)
 * - required → not_applicable (with reason)
 * - uploaded → required (replacement)
 */
export async function updateDocumentChecklistItem(
  applicationId: string,
  itemId: string,
  update: ChecklistItemUpdate,
  projectId: string,
  actor: ActorContext,
  deps: { db: FirestoreDB; auditFn: ApplicationAuditFn }
): Promise<ServiceResult<DocChecklistItem>> {
  const { db } = deps;

  const checklistPath = `projects/${projectId}/townPlanning/applications/${applicationId}/checklist`;
  const docSnap = await db.collection(checklistPath).doc(itemId).get();

  if (!docSnap.exists) {
    return { success: false, error: `Checklist item '${itemId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `Checklist item '${itemId}' has no data` };
  }

  const currentStatus = data.status as ChecklistItemStatus;
  const targetStatus = update.status;

  // Validate transition
  const permitted = DOCUMENT_CHECKLIST_TRANSITIONS[currentStatus] ?? [];
  if (!permitted.includes(targetStatus)) {
    return {
      success: false,
      error: `Invalid checklist item transition: '${currentStatus}' → '${targetStatus}'. Permitted: ${permitted.join(', ') || 'none'}`,
    };
  }

  // Validate requirements for uploaded
  if (targetStatus === 'uploaded' && (!update.documentId || update.documentId.trim().length === 0)) {
    return { success: false, error: 'Document ID is required when uploading' };
  }

  // Validate requirements for not_applicable
  if (targetStatus === 'not_applicable' && (!update.notApplicableReason || update.notApplicableReason.trim().length === 0)) {
    return { success: false, error: 'Reason is required when marking as not applicable' };
  }

  const updatePayload: Record<string, unknown> = { status: targetStatus };
  if (update.documentId) updatePayload.documentId = update.documentId;
  if (update.notApplicableReason) updatePayload.notApplicableReason = update.notApplicableReason;

  // If reverting to required (replacement), clear documentId
  if (targetStatus === 'required') {
    updatePayload.documentId = undefined;
  }

  await db.collection(checklistPath).doc(itemId).update(updatePayload);

  const updatedItem: DocChecklistItem = {
    ...(data as unknown as DocChecklistItem),
    id: itemId,
    status: targetStatus,
    ...(update.documentId ? { documentId: update.documentId } : {}),
    ...(update.notApplicableReason ? { notApplicableReason: update.notApplicableReason } : {}),
    ...(targetStatus === 'required' ? { documentId: undefined } : {}),
  };

  return { success: true, data: updatedItem };
}

/**
 * Returns completeness indicator for the document checklist.
 */
export async function getCompletenessIndicator(
  applicationId: string,
  projectId: string,
  db: FirestoreDB
): Promise<ChecklistCompletenessIndicator> {
  const checklistPath = `projects/${projectId}/townPlanning/applications/${applicationId}/checklist`;
  const snapshot = await db.collection(checklistPath).get();

  const indicator: ChecklistCompletenessIndicator = {
    total: 0,
    uploaded: 0,
    outstanding: 0,
    notApplicable: 0,
  };

  if (snapshot.empty) {
    return indicator;
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) continue;

    indicator.total++;
    const status = data.status as ChecklistItemStatus;

    switch (status) {
      case 'uploaded':
        indicator.uploaded++;
        break;
      case 'required':
        indicator.outstanding++;
        break;
      case 'not_applicable':
        indicator.notApplicable++;
        break;
    }
  }

  return indicator;
}

/**
 * Validates whether the application is ready for submission.
 *
 * Returns { ready: boolean; outstanding: string[] } for submission gate.
 * Ready when all required items are either uploaded or not_applicable.
 */
export async function validateSubmissionReadiness(
  applicationId: string,
  projectId: string,
  db: FirestoreDB
): Promise<SubmissionReadiness> {
  const checklistPath = `projects/${projectId}/townPlanning/applications/${applicationId}/checklist`;
  const snapshot = await db.collection(checklistPath).get();

  const outstanding: string[] = [];

  if (snapshot.empty) {
    return { ready: true, outstanding: [] };
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) continue;

    if (data.status === 'required') {
      outstanding.push(data.name as string);
    }
  }

  return { ready: outstanding.length === 0, outstanding };
}
