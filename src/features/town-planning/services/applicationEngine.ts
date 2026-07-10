/**
 * Town Planning Application Engine
 *
 * Core CRUD operations for land use applications.
 * Zod validation, type-specific field enforcement, DI pattern.
 */

import type { LandUseApplication, ApplicationType } from '../types';
import { CreateApplicationParamsSchema } from '../schemas';
import type { CreateApplicationParams } from '../schemas';
import type { FirestoreDB } from './accessControl';

// ─── Validation Error ─────────────────────────────────────────────────────────

export class ApplicationValidationError extends Error {
  public readonly code: string;
  public readonly details: Record<string, string[]>;

  constructor(message: string, details: Record<string, string[]>) {
    super(message);
    this.name = 'ApplicationValidationError';
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

// ─── Type-Specific Required Fields ───────────────────────────────────────────

const TYPE_REQUIRED_FIELDS: Record<ApplicationType, string[]> = {
  rezoning: ['currentZoning', 'proposedZoning'],
  subdivision: ['erfSize'],
  consolidation: ['erfSize'],
  consent_use: ['currentZoning', 'proposedLandUse'],
  departure: ['currentZoning'],
  removal_of_restrictive_conditions: ['currentZoning'],
  township_establishment: ['erfSize', 'proposedZoning'],
  site_development_plan: [],
  building_line_relaxation: ['currentZoning'],
  amendment_of_scheme: ['currentZoning', 'proposedZoning'],
};

// ─── Reference Number Generator ───────────────────────────────────────────────

/**
 * Generate a unique reference number for a town planning application.
 * Format: TP-{TYPE_CODE}-{YEAR}-{SEQUENCE}
 */
export function generateReferenceNumber(
  applicationType: ApplicationType,
  sequenceNumber: number,
): string {
  const typeCodeMap: Record<ApplicationType, string> = {
    rezoning: 'RZ',
    subdivision: 'SD',
    consolidation: 'CN',
    consent_use: 'CU',
    departure: 'DP',
    removal_of_restrictive_conditions: 'RC',
    township_establishment: 'TE',
    site_development_plan: 'SDP',
    building_line_relaxation: 'BL',
    amendment_of_scheme: 'AS',
  };

  const code = typeCodeMap[applicationType];
  const year = new Date().getFullYear();
  const seq = String(sequenceNumber).padStart(4, '0');

  return `TP-${code}-${year}-${seq}`;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Create a new land use application with Zod validation and type-specific enforcement.
 */
export function createApplication(
  params: unknown,
  sequenceNumber: number,
): LandUseApplication {
  // Validate with Zod
  const parseResult = CreateApplicationParamsSchema.safeParse(params);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const path = issue.path.join('.');
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    throw new ApplicationValidationError('Validation failed', fieldErrors);
  }

  const validated: CreateApplicationParams = parseResult.data;

  // Type-specific field enforcement
  const requiredFields = TYPE_REQUIRED_FIELDS[validated.applicationType];
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    const value = validated[field as keyof CreateApplicationParams];
    if (value === undefined || value === null || value === '') {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    const fieldErrors: Record<string, string[]> = {};
    for (const field of missingFields) {
      fieldErrors[field] = [`Required for application type '${validated.applicationType}'`];
    }
    throw new ApplicationValidationError(
      `Missing required fields for ${validated.applicationType}: ${missingFields.join(', ')}`,
      fieldErrors,
    );
  }

  const now = new Date().toISOString();
  const id = `app_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const referenceNumber = generateReferenceNumber(validated.applicationType, sequenceNumber);

  return {
    id,
    projectId: validated.projectId,
    referenceNumber,
    applicationType: validated.applicationType,
    currentStage: 'preparation',
    municipality: validated.municipality,
    erfNumber: validated.erfNumber,
    townshipName: validated.townshipName,
    province: validated.province,
    applicantId: validated.applicantId,
    ownerId: validated.ownerId,
    townPlannerId: validated.townPlannerId,
    description: validated.description,
    currentZoning: validated.currentZoning,
    proposedZoning: validated.proposedZoning,
    currentLandUse: validated.currentLandUse,
    proposedLandUse: validated.proposedLandUse,
    erfSize: validated.erfSize,
    stageHistory: [
      {
        stage: 'preparation',
        enteredAt: now,
        triggeredBy: validated.applicantId,
      },
    ],
    deadlines: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get an application by ID from Firestore.
 */
export async function getApplication(
  db: FirestoreDB,
  applicationId: string,
): Promise<LandUseApplication | null> {
  const docRef = db.collection('town_planning_applications').doc(applicationId);
  const doc = await docRef.get();

  if (!doc.exists) return null;
  return { id: applicationId, ...doc.data() } as unknown as LandUseApplication;
}

/**
 * List all applications for a given project.
 */
export async function listApplicationsByProject(
  db: FirestoreDB,
  projectId: string,
): Promise<LandUseApplication[]> {
  const snapshot = await db
    .collection('town_planning_applications')
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as unknown as LandUseApplication[];
}

/**
 * Persist an application to Firestore.
 */
export async function persistApplication(
  db: FirestoreDB,
  application: LandUseApplication,
): Promise<void> {
  const docRef = db.collection('town_planning_applications').doc(application.id);
  await docRef.set(application as unknown as Record<string, unknown>);
}
