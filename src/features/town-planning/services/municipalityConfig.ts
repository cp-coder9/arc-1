/**
 * Municipality Configuration Service
 *
 * Manages municipality-specific profiles (global, not project-scoped).
 * Profiles live in `municipalityProfiles/{municipalityId}` collection
 * and are shared across all projects.
 *
 * Provides CRUD operations, role-based editability enforcement,
 * audit trail integration, and application-type-specific requirement lookups.
 */

import { z } from 'zod';
import type { UserRole } from '@/types';
import type { MunicipalityProfile, ApplicationType } from '../types';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const MunicipalityProfileInputSchema = z.object({
  name: z.string().min(1, 'Municipality name is required'),
  province: z.string().min(1, 'Province is required'),
  districtMunicipality: z.string().optional(),
  contactEmail: z.string().email('Invalid email format').optional(),
  contactPhone: z.string().optional(),
  typicalProcessingDays: z.number().int().min(1, 'Must be at least 1 day'),
  advertisingPeriodDays: z.number().int().min(1, 'Must be at least 1 day'),
  appealPeriodDays: z.number().int().min(1, 'Must be at least 1 day'),
  requiredDocuments: z.array(z.string()).default([]),
  additionalSDPComponents: z.array(z.string()).default([]),
  additionalFields: z.record(z.string(), z.string()).default({}),
  notes: z.string().optional(),
});

export type MunicipalityProfileInput = z.infer<typeof MunicipalityProfileInputSchema>;

export const MunicipalityProfileUpdateSchema = MunicipalityProfileInputSchema.partial();

export type MunicipalityProfileUpdate = z.infer<typeof MunicipalityProfileUpdateSchema>;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Roles allowed to create/update municipality profiles */
const WRITE_ROLES: UserRole[] = ['town_planner', 'admin', 'platform_admin'];

/** Actor performing the action */
export interface Actor {
  id: string;
  role: UserRole;
}

/** Audit trail entry shape */
export interface AuditEntry {
  action: 'municipality_profile_created' | 'municipality_profile_updated';
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  municipalityId: string;
  fieldsChanged?: { field: string; oldValue: unknown; newValue: unknown }[];
}

/** Result shape for operations */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Application type requirements */
export interface ApplicationTypeRequirements {
  forms: string[];
  documents: string[];
  additionalFields: Record<string, string>;
  sdpComponents: string[];
}

// ─── Standard requirements per application type ──────────────────────────────

const STANDARD_FORMS: Record<ApplicationType, string[]> = {
  rezoning: ['Application for Rezoning (Form A)', 'Motivation Report'],
  departure: ['Application for Departure (Form B)', 'Departure Motivation'],
  subdivision: ['Application for Subdivision (Form C)', 'Layout Plan'],
  consolidation: ['Application for Consolidation (Form D)'],
  removal_of_restrictive_conditions: ['Application for Removal (Form E)', 'Title Deed Copy'],
  township_establishment: ['Township Establishment Application', 'Town Planning Report', 'Services Report'],
  consent_use: ['Consent Use Application (Form F)', 'Motivation Letter'],
  amendment_of_scheme: ['Amendment Application (Form G)', 'Scheme Amendment Motivation'],
};

const STANDARD_DOCUMENTS: Record<ApplicationType, string[]> = {
  rezoning: ['Title Deed', 'SG Diagram', 'Power of Attorney', 'Proof of Payment', 'Site Development Plan'],
  departure: ['Title Deed', 'SG Diagram', 'Power of Attorney', 'Proof of Payment', 'Site Plan'],
  subdivision: ['Title Deed', 'SG Diagram', 'Power of Attorney', 'Proof of Payment', 'Surveyor Layout Plan'],
  consolidation: ['Title Deeds (all properties)', 'SG Diagrams (all properties)', 'Power of Attorney', 'Proof of Payment'],
  removal_of_restrictive_conditions: ['Title Deed', 'SG Diagram', 'Power of Attorney', 'Proof of Payment', 'Bondholder Consent'],
  township_establishment: ['Title Deed', 'SG Diagram', 'Power of Attorney', 'Proof of Payment', 'Engineering Services Report', 'Environmental Impact Assessment'],
  consent_use: ['Title Deed', 'SG Diagram', 'Power of Attorney', 'Proof of Payment'],
  amendment_of_scheme: ['Title Deed', 'SG Diagram', 'Power of Attorney', 'Proof of Payment', 'Current Zoning Certificate'],
};

// ─── Firestore Interface ─────────────────────────────────────────────────────

/**
 * Minimal Firestore-like interface for dependency injection.
 * Allows mocking in tests without requiring the full Firebase SDK.
 */
export interface FirestoreDB {
  collection(path: string): CollectionRef;
}

export interface CollectionRef {
  doc(id: string): DocumentRef;
  add(data: Record<string, unknown>): Promise<{ id: string }>;
  get(): Promise<QuerySnapshot>;
}

export interface DocumentRef {
  get(): Promise<DocumentSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
}

export interface DocumentSnapshot {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
}

export interface QuerySnapshot {
  docs: DocumentSnapshot[];
  empty: boolean;
}

/** Audit function type for dependency injection */
export type AuditFn = (entry: AuditEntry) => Promise<void>;

// ─── Service Implementation ──────────────────────────────────────────────────

const COLLECTION_PATH = 'municipalityProfiles';

/**
 * Checks if the actor has write access to municipality profiles.
 */
function checkWriteAccess(actor: Actor): ServiceResult<true> {
  if (!WRITE_ROLES.includes(actor.role)) {
    return {
      success: false,
      error: `Unauthorized: role '${actor.role}' cannot modify municipality profiles. Required: town_planner, admin, or platform_admin.`,
    };
  }
  return { success: true, data: true };
}

/**
 * Creates a new municipality profile.
 *
 * - Validates input with MunicipalityProfileInputSchema
 * - Checks role-based write access
 * - Persists to Firestore `municipalityProfiles/{id}`
 * - Creates audit trail entry
 */
export async function createMunicipalityProfile(
  input: unknown,
  actor: Actor,
  db: FirestoreDB,
  auditFn: AuditFn
): Promise<ServiceResult<MunicipalityProfile>> {
  // Role check
  const accessCheck = checkWriteAccess(actor);
  if (!accessCheck.success) return accessCheck;

  // Validate input
  const parsed = MunicipalityProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: `Validation failed: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
    };
  }

  const now = new Date().toISOString();
  const profileData: Omit<MunicipalityProfile, 'id'> = {
    ...parsed.data,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };

  // Persist to Firestore
  const docRef = await db.collection(COLLECTION_PATH).add(profileData as unknown as Record<string, unknown>);

  const profile: MunicipalityProfile = {
    id: docRef.id,
    ...profileData,
  };

  // Record audit
  await auditFn({
    action: 'municipality_profile_created',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    municipalityId: docRef.id,
  });

  return { success: true, data: profile };
}

/**
 * Fetches a municipality profile by ID.
 * Returns null if not found.
 */
export async function getMunicipalityProfile(
  municipalityId: string,
  db: FirestoreDB
): Promise<MunicipalityProfile | null> {
  const docSnap = await db.collection(COLLECTION_PATH).doc(municipalityId).get();

  if (!docSnap.exists) {
    return null;
  }

  const data = docSnap.data();
  if (!data) return null;

  return {
    id: docSnap.id,
    ...data,
  } as MunicipalityProfile;
}

/**
 * Partially updates a municipality profile.
 *
 * - Validates update fields with partial schema
 * - Checks role-based write access
 * - Records field-level audit trail (field name, old value, new value)
 * - Returns updated profile
 */
export async function updateMunicipalityProfile(
  municipalityId: string,
  updates: unknown,
  actor: Actor,
  db: FirestoreDB,
  auditFn: AuditFn
): Promise<ServiceResult<MunicipalityProfile>> {
  // Role check
  const accessCheck = checkWriteAccess(actor);
  if (!accessCheck.success) return accessCheck;

  // Validate update input
  const parsed = MunicipalityProfileUpdateSchema.safeParse(updates);
  if (!parsed.success) {
    return {
      success: false,
      error: `Validation failed: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
    };
  }

  // Fetch existing profile
  const existing = await getMunicipalityProfile(municipalityId, db);
  if (!existing) {
    return {
      success: false,
      error: `Municipality profile '${municipalityId}' not found`,
    };
  }

  // Compute field-level changes
  const fieldsChanged: AuditEntry['fieldsChanged'] = [];
  const validUpdates = parsed.data;

  for (const [key, newValue] of Object.entries(validUpdates)) {
    if (newValue !== undefined) {
      const oldValue = (existing as Record<string, unknown>)[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        fieldsChanged.push({ field: key, oldValue, newValue });
      }
    }
  }

  const now = new Date().toISOString();
  const updateData = {
    ...validUpdates,
    updatedAt: now,
  };

  // Persist update
  await db.collection(COLLECTION_PATH).doc(municipalityId).update(updateData as Record<string, unknown>);

  // Record audit with field-level changes
  await auditFn({
    action: 'municipality_profile_updated',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    municipalityId,
    fieldsChanged,
  });

  // Return updated profile
  const updated: MunicipalityProfile = {
    ...existing,
    ...validUpdates,
    updatedAt: now,
  };

  return { success: true, data: updated };
}

/**
 * Lists all municipality profiles.
 */
export async function listMunicipalities(db: FirestoreDB): Promise<MunicipalityProfile[]> {
  const snapshot = await db.collection(COLLECTION_PATH).get();

  if (snapshot.empty) {
    return [];
  }

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as MunicipalityProfile[];
}

/**
 * Returns the application-type-specific requirements for a municipality.
 *
 * Merges standard requirements (forms, documents) with municipality-specific
 * additional fields, required documents, and SDP components.
 */
export async function getRequirementsForApplicationType(
  municipalityId: string,
  applicationType: ApplicationType,
  db: FirestoreDB
): Promise<ServiceResult<ApplicationTypeRequirements>> {
  const profile = await getMunicipalityProfile(municipalityId, db);

  if (!profile) {
    return {
      success: false,
      error: `Municipality profile '${municipalityId}' not found`,
    };
  }

  const forms = STANDARD_FORMS[applicationType] ?? [];
  const standardDocs = STANDARD_DOCUMENTS[applicationType] ?? [];

  // Merge municipality-specific required documents
  const documents = [...standardDocs, ...profile.requiredDocuments];

  return {
    success: true,
    data: {
      forms,
      documents,
      additionalFields: profile.additionalFields,
      sdpComponents: profile.additionalSDPComponents,
    },
  };
}
