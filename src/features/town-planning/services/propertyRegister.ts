/**
 * Property Intelligence Register Service
 *
 * Manages property intelligence data per project.
 * Firestore path: `projects/{projectId}/townPlanning/property/main`
 * Sub-collections:
 *   - `projects/{projectId}/townPlanning/property/main/restrictiveConditions/{id}`
 *   - `projects/{projectId}/townPlanning/property/main/servitudes/{id}`
 *
 * Provides CRUD operations, field-level audit trail, restrictive condition
 * and servitude management, surveyor linking, and compliance hub exposure.
 *
 * All write operations enforce role-based editability.
 */

import type { UserRole } from '@/types';
import type {
  PropertyIntelligence,
  RestrictiveCondition,
  Servitude,
  ZoningParameters,
} from '../types';

// ─── Firestore Interface (DI) ────────────────────────────────────────────────

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
  delete(): Promise<void>;
  collection(path: string): CollectionRef;
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

// ─── Audit Types ─────────────────────────────────────────────────────────────

export interface PropertyAuditEntry {
  action:
    | 'property_created'
    | 'property_field_updated'
    | 'restrictive_condition_added'
    | 'restrictive_condition_removed'
    | 'servitude_added'
    | 'surveyor_linked'
    | 'zoning_exposed_to_compliance_hub';
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  projectId: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  details?: Record<string, unknown>;
}

export type AuditFn = (entry: PropertyAuditEntry) => Promise<void>;

// ─── Actor ───────────────────────────────────────────────────────────────────

export interface Actor {
  id: string;
  role: UserRole;
}

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface PropertyDeps {
  db: FirestoreDB;
  auditFn: AuditFn;
}

// ─── Result Type ─────────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Role Enforcement ────────────────────────────────────────────────────────

/** Roles allowed to write property intelligence data */
const WRITE_ROLES: UserRole[] = [
  'town_planner',
  'land_surveyor',
  'architect',
  'bep',
  'admin',
  'platform_admin',
];

function checkWriteAccess(actor: Actor): { success: true } | { success: false; error: string } {
  if (!WRITE_ROLES.includes(actor.role)) {
    return {
      success: false,
      error: `Unauthorized: role '${actor.role}' cannot modify property intelligence. Required: town_planner, land_surveyor, architect, bep, admin, or platform_admin.`,
    };
  }
  return { success: true };
}

// ─── Firestore Path Helpers ──────────────────────────────────────────────────

function getPropertyDocPath(projectId: string): string {
  return `projects/${projectId}/townPlanning/property`;
}

const PROPERTY_DOC_ID = 'main';

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface CreatePropertyInput {
  erfNumber: string;
  portionNumber?: string;
  township: string;
  registrationDivision: string;
  province: string;
  municipality: string;
  titleDeedNumber: string;
  extent: number;
  zoning: ZoningParameters;
}

export type ComplianceHubFn = (
  projectId: string,
  zoningParams: ZoningParameters
) => Promise<void>;

// ─── Service Implementation ──────────────────────────────────────────────────

/**
 * Creates initial property record for a project.
 */
export async function createPropertyRecord(
  projectId: string,
  input: CreatePropertyInput,
  actor: Actor,
  deps: PropertyDeps
): Promise<ServiceResult<PropertyIntelligence>> {
  const accessCheck = checkWriteAccess(actor);
  if (!accessCheck.success) return accessCheck;

  const now = new Date().toISOString();

  const propertyData: Omit<PropertyIntelligence, 'id'> = {
    projectId,
    erfNumber: input.erfNumber,
    portionNumber: input.portionNumber,
    township: input.township,
    registrationDivision: input.registrationDivision,
    province: input.province,
    municipality: input.municipality,
    titleDeedNumber: input.titleDeedNumber,
    extent: input.extent,
    zoning: input.zoning,
    restrictiveConditions: [],
    servitudes: [],
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };

  const collectionPath = getPropertyDocPath(projectId);
  await deps.db
    .collection(collectionPath)
    .doc(PROPERTY_DOC_ID)
    .set(propertyData as unknown as Record<string, unknown>);

  const property: PropertyIntelligence = {
    id: PROPERTY_DOC_ID,
    ...propertyData,
  };

  await deps.auditFn({
    action: 'property_created',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
  });

  return { success: true, data: property };
}

/**
 * Fetches property intelligence for a project. Returns null if not found.
 */
export async function getPropertyData(
  projectId: string,
  db: FirestoreDB
): Promise<PropertyIntelligence | null> {
  const collectionPath = getPropertyDocPath(projectId);
  const docSnap = await db.collection(collectionPath).doc(PROPERTY_DOC_ID).get();

  if (!docSnap.exists) {
    return null;
  }

  const data = docSnap.data();
  if (!data) return null;

  return {
    id: docSnap.id,
    ...data,
  } as PropertyIntelligence;
}

/**
 * Updates a single field on the property record with full audit trail.
 * Records old value, new value, actor, and timestamp.
 */
export async function updatePropertyField(
  projectId: string,
  field: string,
  value: unknown,
  actor: Actor,
  deps: PropertyDeps
): Promise<ServiceResult<PropertyIntelligence>> {
  const accessCheck = checkWriteAccess(actor);
  if (!accessCheck.success) return accessCheck;

  // Fetch current record
  const existing = await getPropertyData(projectId, deps.db);
  if (!existing) {
    return {
      success: false,
      error: `Property record not found for project '${projectId}'`,
    };
  }

  const oldValue = (existing as unknown as Record<string, unknown>)[field];
  const now = new Date().toISOString();

  // Update the field
  const collectionPath = getPropertyDocPath(projectId);
  await deps.db
    .collection(collectionPath)
    .doc(PROPERTY_DOC_ID)
    .update({ [field]: value, updatedAt: now });

  // Record field-level audit
  await deps.auditFn({
    action: 'property_field_updated',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    field,
    oldValue,
    newValue: value,
  });

  // Return updated property
  const updated: PropertyIntelligence = {
    ...existing,
    [field]: value,
    updatedAt: now,
  };

  return { success: true, data: updated };
}

/**
 * Adds a restrictive condition to the property's sub-collection.
 */
export async function addRestrictiveCondition(
  projectId: string,
  condition: Omit<RestrictiveCondition, 'id'>,
  actor: Actor,
  deps: PropertyDeps
): Promise<ServiceResult<RestrictiveCondition>> {
  const accessCheck = checkWriteAccess(actor);
  if (!accessCheck.success) return accessCheck;

  // Verify property exists
  const existing = await getPropertyData(projectId, deps.db);
  if (!existing) {
    return {
      success: false,
      error: `Property record not found for project '${projectId}'`,
    };
  }

  const now = new Date().toISOString();
  const collectionPath = `${getPropertyDocPath(projectId)}/${PROPERTY_DOC_ID}/restrictiveConditions`;

  const docRef = await deps.db
    .collection(collectionPath)
    .add(condition as unknown as Record<string, unknown>);

  const created: RestrictiveCondition = {
    id: docRef.id,
    ...condition,
  };

  // Update the updatedAt timestamp on the main document
  await deps.db
    .collection(getPropertyDocPath(projectId))
    .doc(PROPERTY_DOC_ID)
    .update({ updatedAt: now });

  await deps.auditFn({
    action: 'restrictive_condition_added',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    details: { conditionId: docRef.id, conditionText: condition.conditionText },
  });

  return { success: true, data: created };
}

/**
 * Marks a restrictive condition as inactive (soft delete).
 * Does not physically remove the sub-document.
 */
export async function removeRestrictiveCondition(
  projectId: string,
  conditionId: string,
  actor: Actor,
  deps: PropertyDeps
): Promise<ServiceResult<RestrictiveCondition>> {
  const accessCheck = checkWriteAccess(actor);
  if (!accessCheck.success) return accessCheck;

  // Verify property exists
  const existing = await getPropertyData(projectId, deps.db);
  if (!existing) {
    return {
      success: false,
      error: `Property record not found for project '${projectId}'`,
    };
  }

  const now = new Date().toISOString();
  const collectionPath = `${getPropertyDocPath(projectId)}/${PROPERTY_DOC_ID}/restrictiveConditions`;

  const conditionDoc = await deps.db.collection(collectionPath).doc(conditionId).get();
  if (!conditionDoc.exists) {
    return {
      success: false,
      error: `Restrictive condition '${conditionId}' not found`,
    };
  }

  // Mark as inactive (soft delete)
  await deps.db
    .collection(collectionPath)
    .doc(conditionId)
    .update({ status: 'removed', updatedAt: now });

  // Update the main doc updatedAt
  await deps.db
    .collection(getPropertyDocPath(projectId))
    .doc(PROPERTY_DOC_ID)
    .update({ updatedAt: now });

  const conditionData = conditionDoc.data()!;
  const removedCondition: RestrictiveCondition = {
    id: conditionId,
    ...conditionData,
    status: 'removed',
  } as RestrictiveCondition;

  await deps.auditFn({
    action: 'restrictive_condition_removed',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    details: { conditionId },
  });

  return { success: true, data: removedCondition };
}

/**
 * Adds a servitude to the property's sub-collection.
 */
export async function addServitude(
  projectId: string,
  servitude: Omit<Servitude, 'id'>,
  actor: Actor,
  deps: PropertyDeps
): Promise<ServiceResult<Servitude>> {
  const accessCheck = checkWriteAccess(actor);
  if (!accessCheck.success) return accessCheck;

  // Verify property exists
  const existing = await getPropertyData(projectId, deps.db);
  if (!existing) {
    return {
      success: false,
      error: `Property record not found for project '${projectId}'`,
    };
  }

  const now = new Date().toISOString();
  const collectionPath = `${getPropertyDocPath(projectId)}/${PROPERTY_DOC_ID}/servitudes`;

  const docRef = await deps.db
    .collection(collectionPath)
    .add(servitude as unknown as Record<string, unknown>);

  const created: Servitude = {
    id: docRef.id,
    ...servitude,
  };

  // Update the updatedAt timestamp on the main document
  await deps.db
    .collection(getPropertyDocPath(projectId))
    .doc(PROPERTY_DOC_ID)
    .update({ updatedAt: now });

  await deps.auditFn({
    action: 'servitude_added',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    details: { servitudeId: docRef.id, type: servitude.type },
  });

  return { success: true, data: created };
}

/**
 * Links a surveyor to the property record (name + PLATO registration number).
 */
export async function linkSurveyor(
  projectId: string,
  surveyorName: string,
  platoNumber: string,
  actor: Actor,
  deps: PropertyDeps
): Promise<ServiceResult<PropertyIntelligence>> {
  const accessCheck = checkWriteAccess(actor);
  if (!accessCheck.success) return accessCheck;

  // Fetch current record
  const existing = await getPropertyData(projectId, deps.db);
  if (!existing) {
    return {
      success: false,
      error: `Property record not found for project '${projectId}'`,
    };
  }

  const now = new Date().toISOString();
  const collectionPath = getPropertyDocPath(projectId);

  await deps.db
    .collection(collectionPath)
    .doc(PROPERTY_DOC_ID)
    .update({
      surveyorName,
      surveyorPlatoNumber: platoNumber,
      updatedAt: now,
    });

  await deps.auditFn({
    action: 'surveyor_linked',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    field: 'surveyor',
    oldValue: {
      surveyorName: existing.surveyorName,
      surveyorPlatoNumber: existing.surveyorPlatoNumber,
    },
    newValue: { surveyorName, surveyorPlatoNumber: platoNumber },
  });

  const updated: PropertyIntelligence = {
    ...existing,
    surveyorName,
    surveyorPlatoNumber: platoNumber,
    updatedAt: now,
  };

  return { success: true, data: updated };
}

/**
 * Reads current zoning parameters and exposes them to the compliance hub
 * via a DI callback function.
 */
export async function exposeZoningToComplianceHub(
  projectId: string,
  db: FirestoreDB,
  complianceHubFn: ComplianceHubFn
): Promise<ServiceResult<ZoningParameters>> {
  const property = await getPropertyData(projectId, db);
  if (!property) {
    return {
      success: false,
      error: `Property record not found for project '${projectId}'`,
    };
  }

  await complianceHubFn(projectId, property.zoning);

  return { success: true, data: property.zoning };
}
